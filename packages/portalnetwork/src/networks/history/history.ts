import { ENR } from '@chainsafe/enr'
import { Block, BlockHeader } from '@ethereumjs/block'
import { bytesToInt, hexToBytes } from '@ethereumjs/util'
import debug from 'debug'

import {
  ContentMessageType,
  FoundContent,
  MessageCodes,
  PortalWireMessageType,
  RequestCode,
  decodeHistoryNetworkContentKey,
  decodeReceipts,
  fromHexString,
  reassembleBlock,
  saveReceipts,
  shortId,
  toHexString,
} from '../../index.js'
import { BaseNetwork } from '../network.js'
import { NetworkId } from '../types.js'

import { GossipManager } from './gossip.js'
import {
  BlockHeaderWithProof,
  BlockNumberKey,
  HistoryNetworkContentType,
  MERGE_BLOCK,
  SHANGHAI_BLOCK,
  sszReceiptsListType,
} from './types.js'
import {
  BlockHeaderByNumberKey,
  getContentKey,
  verifyPreCapellaHeaderProof,
  verifyPreMergeHeaderProof,
} from './util.js'

import type { BaseNetworkConfig, FindContentMessage } from '../../index.js'
import type { Debugger } from 'debug'
export class HistoryNetwork extends BaseNetwork {
  networkId: NetworkId.HistoryNetwork
  networkName = 'HistoryNetwork'
  logger: Debugger
  gossipManager: GossipManager
  constructor({ client, db, radius, maxStorage }: BaseNetworkConfig) {
    super({ client, networkId: NetworkId.HistoryNetwork, db, radius, maxStorage })
    this.networkId = NetworkId.HistoryNetwork
    this.logger = debug(this.enr.nodeId.slice(0, 5)).extend('Portal').extend('HistoryNetwork')
    this.gossipManager = new GossipManager(this)
    this.routingTable.setLogger(this.logger)
  }

  /**
   *
   * @param decodedContentMessage content key to be found
   * @returns content if available locally
   */
  public findContentLocally = async (contentKey: Uint8Array): Promise<Uint8Array | undefined> => {
    const contentType = contentKey[0]
    if (contentType === HistoryNetworkContentType.BlockHeaderByNumber) {
      const blockNumber = decodeHistoryNetworkContentKey(contentKey).keyOpt.toString()
      const index = await this.blockIndex()
      const blockHash = index.get(blockNumber)
      if (blockHash === undefined) {
        return undefined
      }
      const hashKey = getContentKey(HistoryNetworkContentType.BlockHeader, fromHexString(blockHash))
      const value = await this.retrieve(hashKey)
      return value !== undefined ? hexToBytes(value) : undefined
    }

    const value = await this.retrieve(toHexString(contentKey))
    return value !== undefined ? hexToBytes(value) : undefined
  }

  public indexBlockhash = async (number: bigint, blockHash: string) => {
    const blockNumber = '0x' + number.toString(16)
    const blockindex = await this.blockIndex()
    blockindex.set(blockNumber, blockHash)
    blockindex.set(blockHash, blockNumber)
    await this.setBlockIndex(blockindex)
  }

  /**
   * Retrieve a blockheader from the DB by hash
   * @param blockHash the hash of the blockheader sought
   * @param asBytes return the header as RLP encoded bytes or as an @ethereumjs/block BlockHeader
   * @returns the bytes or Blockheader if found or else undefined
   */
  public getBlockHeaderFromDB = async (
    opt: { blockHash: Uint8Array } | { blockNumber: bigint },
    asBytes = true,
  ): Promise<undefined | (Uint8Array | BlockHeader)> => {
    let value: string | undefined
    if ('blockHash' in opt) {
      // Check for block header by hash
      const contentKey = getContentKey(HistoryNetworkContentType.BlockHeader, opt.blockHash)
      value = await this.retrieve(contentKey)
      if (value === undefined) {
        // Header not stored by hash, check block index for known block number
        const blockNumber = (await this.blockIndex()).get(toHexString(opt.blockHash))
        if (blockNumber !== undefined) {
          // Block number known, look for header by number
          const blockHeaderKey = BlockHeaderByNumberKey(BigInt(blockNumber))
          value = await this.retrieve(toHexString(blockHeaderKey))
        }
      }
    } else {
      // Check for block header by number
      const blockHeaderKey = BlockHeaderByNumberKey(opt.blockNumber)
      value = await this.retrieve(toHexString(blockHeaderKey))
      if (value === undefined) {
        // Header not stored by number, check block index for known block hash
        const blockHash = (await this.blockIndex()).get('0x' + opt.blockNumber.toString(16))
        if (blockHash !== undefined) {
          // Block hash known, look for header by hash
          const contentKey = getContentKey(
            HistoryNetworkContentType.BlockHeader,
            fromHexString(blockHash),
          )
          value = await this.retrieve(contentKey)
        }
      }
    }
    if (value === undefined) return undefined
    const header = BlockHeaderWithProof.deserialize(fromHexString(value)).header
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
    const proof = headerProof.proof

    if (header.number < MERGE_BLOCK) {
      // Only check for proof if pre-merge block header
      if (proof.value === null) {
        throw new Error('Received block header without proof')
      }
      if (Array.isArray(proof.value)) {
        try {
          if ('blockHash' in validation) {
            verifyPreMergeHeaderProof(proof.value, validation.blockHash, header.number)
          } else {
            verifyPreMergeHeaderProof(
              proof.value,
              toHexString(header.hash()),
              validation.blockNumber,
            )
          }
        } catch {
          throw new Error('Received pre-merge block header with invalid proof')
        }
      }
    } else {
      if (header.number < SHANGHAI_BLOCK) {
        if (proof.value === null) {
          this.logger('Received post-merge block without proof')
        }
        try {
          verifyPreCapellaHeaderProof(proof.value as any, header.hash())
        } catch {
          this.logger('Received post-merge block header with invalid proof')
          // TODO: throw new Error('Received post-merge block header with invalid proof')
        }
      }
    }
    await this.indexBlockhash(header.number, toHexString(header.hash()))
    return header.hash()
  }

  /**
   * Send FINDCONTENT request for content corresponding to `key` to peer corresponding to `dstId`
   * @param dstId node id of peer
   * @param key content key defined by the subnetwork spec
   * @param networkId subnetwork ID on which content is being sought
   * @returns the value of the FOUNDCONTENT response or undefined
   */
  public sendFindContent = async (dstId: string, key: Uint8Array) => {
    const enr = dstId.startsWith('enr:')
      ? ENR.decodeTxt(dstId)
      : this.routingTable.getWithPending(dstId)?.value
        ? this.routingTable.getWithPending(dstId)?.value
        : this.routingTable.getWithPending(dstId.slice(2))?.value
    if (!enr) {
      this.logger(`No ENR found for ${shortId(dstId)}.  FINDCONTENT aborted.`)
      return
    }
    this.portal.metrics?.findContentMessagesSent.inc()
    const findContentMsg: FindContentMessage = { contentKey: key }
    const payload = PortalWireMessageType.serialize({
      selector: MessageCodes.FINDCONTENT,
      value: findContentMsg,
    })
    this.logger.extend('FINDCONTENT')(`Sending to ${shortId(enr)}`)
    const res = await this.sendMessage(enr, payload, this.networkId)

    try {
      if (bytesToInt(res.slice(0, 1)) === MessageCodes.CONTENT) {
        this.portal.metrics?.contentMessagesReceived.inc()
        this.logger.extend('FOUNDCONTENT')(`Received from ${shortId(enr)}`)
        const decoded = ContentMessageType.deserialize(res.subarray(1))
        const contentKey = decodeHistoryNetworkContentKey(key)
        const contentType = contentKey.contentType

        switch (decoded.selector) {
          case FoundContent.UTP: {
            this.streamingKey(toHexString(key))
            const id = new DataView((decoded.value as Uint8Array).buffer).getUint16(0, false)
            this.logger.extend('FOUNDCONTENT')(`received uTP Connection ID ${id}`)
            await this.handleNewRequest({
              networkId: this.networkId,
              contentKeys: [key],
              peerId: dstId,
              connectionId: id,
              requestCode: RequestCode.FINDCONTENT_READ,
              contents: [],
            })
            break
          }
          case FoundContent.CONTENT:
            this.logger(
              `received ${HistoryNetworkContentType[contentType]} content corresponding to ${contentKey}`,
            )
            try {
              await this.store(toHexString(key), decoded.value as Uint8Array)
            } catch {
              this.logger('Error adding content to DB')
            }
            break
          case FoundContent.ENRS: {
            this.logger(`received ${decoded.value.length} ENRs`)
            break
          }
        }
        return decoded
      }
    } catch (err: any) {
      this.logger(`Error sending FINDCONTENT to ${shortId(enr)} - ${err.message}`)
    }
  }

  /**
   * Convenience method to add content for the History Network to the DB
   * @param contentType - content type of the data item being stored
   * @param hashKey - hex string representation of blockHash or epochHash
   * @param value - hex string representing RLP encoded blockheader, block body, or block receipt
   * @throws if `blockHash` or `value` is not hex string
   */
  public store = async (contentKey: string, value: Uint8Array): Promise<void> => {
    const _contentKey = fromHexString(contentKey)
    const contentType = _contentKey[0]
    const keyOpt = _contentKey.slice(1)
    this.logger.extend('STORE')(`Storing ${contentKey} (${value.length} bytes)`)
    switch (contentType) {
      case HistoryNetworkContentType.BlockHeader: {
        try {
          await this.validateHeader(value, { blockHash: toHexString(keyOpt) })
          await this.put(contentKey, toHexString(value))
        } catch (err) {
          this.logger(`Error validating header: ${(err as any).message}`)
        }
        break
      }
      case HistoryNetworkContentType.BlockBody: {
        await this.addBlockBody(value, toHexString(keyOpt))
        break
      }
      case HistoryNetworkContentType.Receipt: {
        try {
          sszReceiptsListType.deserialize(value)
          await this.put(contentKey, toHexString(value))
        } catch (err: any) {
          this.logger(`Received invalid bytes as receipt data for ${keyOpt}`)
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
          await this.put(hashKey, toHexString(value))
          this.emit('ContentAdded', hashKey, value)
          if (this.routingTable.values().length > 0) {
            // Gossip new content to network
            this.gossipManager.add(fromHexString(hashKey), contentType)
          }
        } catch (err) {
          this.logger(`Error validating header: ${(err as any).message}`)
        }
        break
      }
    }

    this.emit('ContentAdded', contentKey, value)
    if (this.routingTable.values().length > 0) {
      // Gossip new content to network
      this.gossipManager.add(keyOpt, contentType)
    }
    this.logger(`${HistoryNetworkContentType[contentType]} added for ${keyOpt}`)
  }

  public async saveReceipts(block: Block) {
    this.logger.extend('BLOCK_BODY')(`added for block #${block.header.number}`)
    const receipts = await saveReceipts(block)
    const contentKey = getContentKey(HistoryNetworkContentType.Receipt, block.hash())
    await this.store(contentKey, receipts)
    return decodeReceipts(receipts)
  }

  public async addBlockBody(value: Uint8Array, hashKey: string, header?: Uint8Array) {
    if (value.length === 0) {
      // Occurs when `getBlockByHash` called `includeTransactions` === false
      return
    }
    let block: Block | undefined
    try {
      if (header) {
        block = reassembleBlock(header, value)
      } else {
        const headerBytes = (await this.getBlockHeaderFromDB({
          blockHash: fromHexString(hashKey),
        })) as Uint8Array
        // Verify we can construct a valid block from the header and body provided
        block = reassembleBlock(headerBytes!, value)
      }
    } catch (err: any) {
      this.logger(`Block Header for ${shortId(hashKey)} not found locally.  Querying network...`)
      block = await this.portal.ETH.getBlockByHash(hashKey, false)
    }
    const bodyContentKey = getContentKey(HistoryNetworkContentType.BlockBody, hexToBytes(hashKey))
    if (block instanceof Block) {
      await this.put(bodyContentKey, toHexString(value))
      // TODO: Decide when and if to build and store receipts.
      //       Doing this here caused a bottleneck when same receipt is gossiped via uTP at the same time.
      // if (block.transactions.length > 0) {
      //   await this.saveReceipts(block)
      // }
    } else {
      this.logger(`Could not verify block content`)
      this.logger(`Adding anyway for testing...`)
      await this.put(bodyContentKey, toHexString(value))
      // TODO: Decide what to do here.  We shouldn't be storing block bodies without a corresponding header
      // as it's against spec
      return
    }
  }

  public async getStateRoot(blockNumber: bigint) {
    const block = await this.portal.ETH.getBlockByNumber(blockNumber, false)
    if (block === undefined) {
      throw new Error('Block not found')
    }
    return toHexString(block.header.stateRoot)
  }
}
