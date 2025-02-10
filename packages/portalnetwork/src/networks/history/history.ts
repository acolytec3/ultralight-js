import { Block, BlockHeader } from '@ethereumjs/block'
import { bytesToHex, bytesToInt, equalsBytes, hexToBytes } from '@ethereumjs/util'
import debug from 'debug'

import type { BaseNetworkConfig, ContentLookupResponse, FindContentMessage } from '../../index.js'
import {
  ContentMessageType,
  FoundContent,
  HistoricalSummariesBlockProof,
  MessageCodes,
  PingPongPayloadExtensions,
  PortalWireMessageType,
  RequestCode,
  decodeHistoryNetworkContentKey,
  decodeReceipts,
  reassembleBlock,
  saveReceipts,
  shortId,
} from '../../index.js'
import { BaseNetwork } from '../network.js'
import { NetworkId } from '../types.js'

import {
  AccumulatorProofType,
  BlockHeaderWithProof,
  BlockNumberKey,
  HistoricalRootsBlockProof,
  HistoryNetworkContentType,
  MERGE_BLOCK,
  SHANGHAI_BLOCK,
  sszReceiptsListType,
} from './types.js'
import {
  getContentKey,
  verifyPostCapellaHeaderProof,
  verifyPreCapellaHeaderProof,
  verifyPreMergeHeaderProof,
} from './util.js'

import type { ENR } from '@chainsafe/enr'

import { RunStatusCode } from '@lodestar/light-client'
import type { Debugger } from 'debug'

export class HistoryNetwork extends BaseNetwork {
  networkId: NetworkId.HistoryNetwork
  networkName = 'HistoryNetwork'
  logger: Debugger

  public blockHashIndex: Map<string, string>
  constructor({ client, db, radius, maxStorage }: BaseNetworkConfig) {
    super({ client, networkId: NetworkId.HistoryNetwork, db, radius, maxStorage })
    this.capabilities = [
      PingPongPayloadExtensions.CLIENT_INFO_RADIUS_AND_CAPABILITIES,
      PingPongPayloadExtensions.HISTORY_RADIUS_PAYLOAD,
    ]
    this.networkId = NetworkId.HistoryNetwork
    this.logger = debug(this.enr.nodeId.slice(0, 5)).extend('Portal').extend('HistoryNetwork')
    this.routingTable.setLogger(this.logger)
    this.blockHashIndex = new Map()
  }

  public blockNumberToHash(blockNumber: bigint): Uint8Array | undefined {
    const number = '0x' + blockNumber.toString(16)
    return this.blockHashIndex.has(number)
      ? hexToBytes(this.blockHashIndex.get(number)!)
      : undefined
  }

  public blockHashToNumber(blockHash: Uint8Array): bigint | undefined {
    const blockNumber = this.blockHashIndex.get(bytesToHex(blockHash))
    return blockNumber === undefined ? undefined : BigInt(blockNumber)
  }

  /**
   *
   * @param decodedContentMessage content key to be found
   * @returns content if available locally
   */
  public findContentLocally = async (contentKey: Uint8Array): Promise<Uint8Array | undefined> => {
    const contentType = contentKey[0]
    if (contentType === HistoryNetworkContentType.BlockHeaderByNumber) {
      const blockNumber = decodeHistoryNetworkContentKey(contentKey).keyOpt
      const blockHash = this.blockNumberToHash(<bigint>blockNumber)
      if (blockHash === undefined) {
        return undefined
      }
      const hashKey = getContentKey(HistoryNetworkContentType.BlockHeader, blockHash)
      const value = await this.retrieve(hashKey)
      return value !== undefined ? hexToBytes(value) : undefined
    }

    const value = await this.retrieve(contentKey)
    return value !== undefined ? hexToBytes(value) : undefined
  }

  public indexBlockHash = async (number: bigint, blockHash: string) => {
    const blockNumber = '0x' + number.toString(16)
    this.blockHashIndex.set(blockNumber, blockHash)
    this.blockHashIndex.set(blockHash, blockNumber)
    await this.portal.db.storeBlockIndex(this.blockHashIndex)
  }

  /**
   * Retrieve a blockheader from the DB by hash
   * @param blockHash the hash of the blockheader sought
   * @param asBytes return the header as RLP encoded bytes or as an `@ethereumjs/block` BlockHeader
   * @returns the bytes or Blockheader if found or else undefined
   */
  public getBlockHeaderFromDB = async (
    opt: { blockHash: Uint8Array } | { blockNumber: bigint },
    asBytes = true,
  ): Promise<undefined | (Uint8Array | BlockHeader)> => {
    const contentKey =
      'blockHash' in opt
        ? getContentKey(HistoryNetworkContentType.BlockHeader, opt.blockHash)
        : getContentKey(HistoryNetworkContentType.BlockHeaderByNumber, opt.blockNumber)
    const value = await this.findContentLocally(contentKey)
    if (value === undefined) return undefined
    const header = BlockHeaderWithProof.deserialize(value).header

    return asBytes === true
      ? header
      : BlockHeader.fromRLPSerializedHeader(header, { setHardfork: true })
  }

  public getBlockBodyBytes = async (blockHash: Uint8Array): Promise<Uint8Array | undefined> => {
    const contentKey = getContentKey(HistoryNetworkContentType.BlockBody, blockHash)
    const value = await this.retrieve(contentKey)
    return value !== undefined ? hexToBytes(value) : undefined
  }

  /**
   * Convenience function that implements `getBlockByHash` when block is stored locally
   * @param blockHash the hash of the block sought
   * @param includeTransactions whether to include the full transactions or not
   * @returns a block with or without transactions
   * @throws if the block isn't found in the DB
   */
  public getBlockFromDB = async (
    opt: { blockHash: Uint8Array } | { blockNumber: bigint },
    includeTransactions = true,
  ): Promise<Block> => {
    let header = await this.getBlockHeaderFromDB(opt, false)
    if (header === undefined) {
      throw new Error('Block not found')
    }
    header = header as BlockHeader
    let body
    if (includeTransactions) {
      body = await this.getBlockBodyBytes(header.mixHash)
      if (!body) {
        throw new Error('Block body not found')
      }
    }
    return reassembleBlock(header.serialize(), body ?? undefined)
  }

  public validateHeader = async (
    value: Uint8Array,
    validation: { blockHash: string } | { blockNumber: bigint },
  ) => {
    const headerProof = BlockHeaderWithProof.deserialize(value)
    const header = BlockHeader.fromRLPSerializedHeader(headerProof.header, {
      setHardfork: true,
    })
    if ('blockHash' in validation) {
      if (bytesToHex(header.hash()) !== validation.blockHash) {
        throw new Error('Block hash from data does not match block hash provided for validation')
      }
    }
    const proof = headerProof.proof

    if (header.number < MERGE_BLOCK) {
      if (proof === null) {
        throw new Error('Received pre-merge block header without proof')
      }
      let deserializedProof: Uint8Array[]
      try {
        deserializedProof = AccumulatorProofType.deserialize(proof)
      } catch (err: any) {
        this.logger(`invalid proof for block ${bytesToHex(header.hash())}`)
        throw new Error(`invalid proof for block ${bytesToHex(header.hash())}`)
      }
      let validated = false
      if ('blockHash' in validation) {
        validated = verifyPreMergeHeaderProof(
          deserializedProof,
          validation.blockHash,
          header.number,
        )
      } else {
        validated = verifyPreMergeHeaderProof(
          deserializedProof,
          bytesToHex(header.hash()),
          validation.blockNumber,
        )
      }
      if (!validated) {
        throw new Error('Unable to validate proof for pre-merge header')
      }
    } else if (header.number < SHANGHAI_BLOCK) {
      if (proof === null) {
        this.logger('Received post-merge block without proof')
        throw new Error('Received post-merge block header without proof')
      }
      let deserializedProof: ReturnType<typeof HistoricalRootsBlockProof.deserialize>
      try {
        deserializedProof = HistoricalRootsBlockProof.deserialize(proof)
      } catch (err: any) {
        this.logger(`invalid proof for block ${bytesToHex(header.hash())}`)
        throw new Error(`invalid proof for block ${bytesToHex(header.hash())}`)
      }
      let validated = false
      try {
        validated = verifyPreCapellaHeaderProof(deserializedProof, header.hash())
      } catch (err: any) {
        this.logger(`Unable to validate proof for post-merge header: ${err.message}`)
      }
      if (!validated) {
        throw new Error('Unable to validate proof for post-merge header')
      }
    } else {
      // TODO: Check proof slot to ensure header is from previous sync period and handle ephemeral headers separately
      if (proof === null) {
        this.logger('Received post-merge block without proof')
      }
      let deserializedProof: ReturnType<typeof HistoricalSummariesBlockProof.deserialize>
      try {
        deserializedProof = HistoricalSummariesBlockProof.deserialize(proof)
      } catch (err: any) {
        this.logger(`invalid proof for block ${bytesToHex(header.hash())}`)
        throw new Error(`invalid proof for block ${bytesToHex(header.hash())}`)
      }
      const beacon = this.portal.network()['0x500c']
      if (beacon !== undefined && beacon.lightClient?.status === RunStatusCode.started) {
        try {
          verifyPostCapellaHeaderProof(
            deserializedProof,
            header.hash(),
            beacon.historicalSummaries,
            beacon.beaconConfig,
          )
          this.logger(`Successfully verified proof for block header ${header.number}`)
        } catch {
          this.logger('Received post-capella block header with invalid proof')
          // TODO: throw new Error('Received post-merge block header with invalid proof')
        }
      } else {
        this.logger(
          'Received post-capella block but Beacon light client is not running so cannot verify proof',
        )
      }
    }
    await this.indexBlockHash(header.number, bytesToHex(header.hash()))
    return header.hash()
  }

  /**
   * Send FINDCONTENT request for content corresponding to `key` to peer corresponding to `dstId`
   * @param dstId node id of peer
   * @param key content key defined by the subnetwork spec
   * @param networkId subnetwork ID on which content is being sought
   * @returns the value of the FOUNDCONTENT response or undefined
   */
  public sendFindContent = async (enr: ENR, key: Uint8Array) => {
    this.portal.metrics?.findContentMessagesSent.inc()
    const findContentMsg: FindContentMessage = { contentKey: key }
    const payload = PortalWireMessageType.serialize({
      selector: MessageCodes.FINDCONTENT,
      value: findContentMsg,
    })
    this.logger.extend('FINDCONTENT')(`Sending to ${shortId(enr.nodeId)}`)
    const res = await this.sendMessage(enr, payload, this.networkId)

    try {
      if (bytesToInt(res.slice(0, 1)) === MessageCodes.CONTENT) {
        this.portal.metrics?.contentMessagesReceived.inc()
        this.logger.extend('FOUNDCONTENT')(`Received from ${shortId(enr.nodeId)}`)
        const decoded = ContentMessageType.deserialize(res.subarray(1))
        const contentKey = decodeHistoryNetworkContentKey(key)
        const contentType = contentKey.contentType
        let response: ContentLookupResponse
        switch (decoded.selector) {
          case FoundContent.UTP: {
            this.streamingKey(key)
            const id = new DataView((decoded.value as Uint8Array).buffer).getUint16(0, false)
            this.logger.extend('FOUNDCONTENT')(`received uTP Connection ID ${id}`)
            response = await new Promise((resolve, _reject) => {
              // TODO: Figure out how to clear this listener
              this.on('ContentAdded', (contentKey: Uint8Array, value) => {
                if (equalsBytes(contentKey, key)) {
                  this.logger.extend('FOUNDCONTENT')(`received content for uTP Connection ID ${id}`)
                  resolve({ content: value, utp: true })
                }
              })
              void this.handleNewRequest({
                networkId: this.networkId,
                contentKeys: [key],
                enr,
                connectionId: id,
                requestCode: RequestCode.FINDCONTENT_READ,
              })
            })
            break
          }
          case FoundContent.CONTENT:
            this.logger.extend('FOUNDCONTENT')(
              `received ${HistoryNetworkContentType[contentType]} content corresponding to ${contentKey}`,
            )
            try {
              await this.store(key, decoded.value as Uint8Array)
            } catch {
              this.logger.extend('FOUNDCONTENT')('Error adding content to DB')
            }
            response = { content: decoded.value as Uint8Array, utp: false }
            break
          case FoundContent.ENRS: {
            this.logger.extend('FOUNDCONTENT')(`received ${decoded.value.length} ENRs`)
            response = { enrs: decoded.value as Uint8Array[] }
            break
          }
        }
        return response
      }
    } catch (err: any) {
      this.logger(`Error sending FINDCONTENT to ${shortId(enr.nodeId)} - ${err.message}`)
    }
  }

  /**
   * Convenience method to add content for the History Network to the DB
   * @param contentType - content type of the data item being stored
   * @param hashKey - hex string representation of blockHash or epochHash
   * @param value - hex string representing RLP encoded blockheader, block body, or block receipt
   * @throws if `blockHash` or `value` is not hex string
   */
  public store = async (contentKey: Uint8Array, value: Uint8Array): Promise<void> => {
    const contentType = contentKey[0]
    let keyOpt: Uint8Array | bigint = contentKey.slice(1)
    this.logger.extend('STORE')(`Storing ${bytesToHex(contentKey)} (${value.length} bytes)`)
    switch (contentType) {
      case HistoryNetworkContentType.BlockHeader: {
        try {
          await this.validateHeader(value, { blockHash: bytesToHex(keyOpt) })
          await this.put(contentKey, bytesToHex(value))
        } catch (err) {
          this.logger(`Error validating header: ${(err as any).message}`)
          throw err
        }
        break
      }
      case HistoryNetworkContentType.BlockBody: {
        await this.addBlockBody(value, keyOpt)
        break
      }
      case HistoryNetworkContentType.Receipt: {
        try {
          sszReceiptsListType.deserialize(value)
          await this.put(contentKey, bytesToHex(value))
        } catch (err: any) {
          this.logger(`Received invalid bytes as receipt data for ${bytesToHex(keyOpt)}`)
          return
        }
        break
      }
      case HistoryNetworkContentType.BlockHeaderByNumber: {
        const { blockNumber } = BlockNumberKey.deserialize(keyOpt)
        try {
          const blockHash = await this.validateHeader(value, { blockNumber })
          // Store block header using 0x00 key type
          const hashKey = getContentKey(HistoryNetworkContentType.BlockHeader, blockHash)
          await this.put(hashKey, bytesToHex(value))
          // Switch keyOpt to blockNumber for gossip purposes
          keyOpt = blockNumber
        } catch (err) {
          this.logger(`Error validating header: ${(err as any).message}`)
        }
        break
      }
    }

    this.emit('ContentAdded', contentKey, value)
    if (this.routingTable.values().length > 0) {
      // Gossip new content to network
      this.gossipManager.add(contentKey)
    }
    this.logger(
      `${HistoryNetworkContentType[contentType]} added for ${keyOpt instanceof Uint8Array ? bytesToHex(keyOpt) : keyOpt
      }`,
    )
  }

  public async saveReceipts(block: Block) {
    this.logger.extend('BLOCK_BODY')(`added for block #${block.header.number}`)
    const receipts = await saveReceipts(block)
    const contentKey = getContentKey(HistoryNetworkContentType.Receipt, block.hash())
    await this.store(contentKey, receipts)
    return decodeReceipts(receipts)
  }

  public async addBlockBody(bodyBytes: Uint8Array, hashKey: Uint8Array, header?: Uint8Array) {
    if (bodyBytes.length === 0) {
      // Occurs when `getBlockByHash` called `includeTransactions` === false
      return
    }
    let block: Block | undefined
    try {
      if (header === undefined) {
        block = await this.portal.ETH.getBlockByHash(hashKey, false)
      } else {
        // Verify we can construct a valid block from the header and body provided
        block = reassembleBlock(header, bodyBytes)
      }
    } catch (err: any) {
      this.logger(
        `Error: ${err?.message} while validating block body for ${shortId(bytesToHex(hashKey))}`,
      )
    }
    const bodyContentKey = getContentKey(HistoryNetworkContentType.BlockBody, hashKey)
    if (block instanceof Block) {
      await this.put(bodyContentKey, bytesToHex(bodyBytes))
      // TODO: Decide when and if to build and store receipts.
      //       Doing this here caused a bottleneck when same receipt is gossiped via uTP at the same time.
      // if (block.transactions.length > 0) {
      //   await this.saveReceipts(block)
      // }
    } else {
      this.logger(`Could not verify block content`)
      this.logger(`Adding anyway for testing...`)
      await this.put(bodyContentKey, bytesToHex(bodyBytes))
      // TODO: Decide what to do here.  We shouldn't be storing block bodies without a corresponding header
      // as it's against spec
      return
    }
  }

  public async getStateRoot(blockNumber: bigint): Promise<Uint8Array | undefined> {
    const block = await this.portal.ETH.getBlockByNumber(blockNumber, false)
    if (block === undefined) {
      this.logger.extend('getStateRoot')('Block not found')
      return undefined
    }
    return block.header.stateRoot
  }
}
