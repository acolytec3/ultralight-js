import { toHexString, fromHexString } from '@chainsafe/ssz'
import { BlockHeader, Block } from '@ethereumjs/block'
import { Debugger } from 'debug'
import {
  getHistoryNetworkContentKey,
  HistoryNetworkContentTypes,
  HistoryProtocol,
  reassembleBlock,
  BlockHeaderWithProof,
} from './index.js'
import { ContentLookup } from '../index.js'
import { shortId } from '../../index.js'

export class ContentManager {
  history: HistoryProtocol
  logger: Debugger
  radius: bigint
  constructor(history: HistoryProtocol, radius: bigint) {
    this.history = history
    this.logger = this.history.logger.extend('DB')
    this.radius = radius
  }

  /**
   * Convenience method to add content for the History Network to the DB
   * @param contentType - content type of the data item being stored
   * @param hashKey - hex string representation of blockHash or epochHash
   * @param value - hex string representing RLP encoded blockheader, block body, or block receipt
   * @throws if `blockHash` or `value` is not hex string
   */
  public addContentToHistory = async (
    contentType: HistoryNetworkContentTypes,
    hashKey: string,
    value: Uint8Array
  ) => {
    this.logger.extend(`ADDING ${HistoryNetworkContentTypes[contentType]} to History DB`)
    const contentKey = getHistoryNetworkContentKey(contentType, fromHexString(hashKey))

    switch (contentType) {
      case HistoryNetworkContentTypes.BlockHeader: {
        const headerWithProof = BlockHeaderWithProof.deserialize(value)
        try {
          const header = BlockHeader.fromRLPSerializedHeader(Buffer.from(headerWithProof.header), {
            hardforkByBlockNumber: true,
          })
          if (toHexString(header.hash()) !== hashKey) {
            this.logger(`Block header content doesn't match header hash ${hashKey}`)
            return
          }

          this.history.client.db.put(contentKey, toHexString(value))
          this.logger.extend('HEADER')(`added for block #${header.number}`)
        } catch (err: any) {
          this.logger(`Invalid value provided for block header: ${err.toString()}`)
          return
        }
        break
      }
      case HistoryNetworkContentTypes.BlockBody: {
        if (value.length === 0) {
          // Occurs when `getBlockByHash` called `includeTransactions` === false
          return
        }
        let block: Block | undefined
        try {
          const headerContentKey = getHistoryNetworkContentKey(
            HistoryNetworkContentTypes.BlockHeader,
            fromHexString(hashKey)
          )

          const headerWith = await this.history.client.db.get(headerContentKey)
          const hexHeader = BlockHeaderWithProof.deserialize(fromHexString(headerWith)).header
          // Verify we can construct a valid block from the header and body provided
          block = reassembleBlock(hexHeader, value)
        } catch {
          this.logger(
            `Block Header for ${shortId(hashKey)} not found locally.  Querying network...`
          )
          block = await this.history.ETH.getBlockByHash(hashKey, false)
        }
        if (block instanceof Block) {
          try {
            this.history.client.db.put(contentKey, toHexString(value))
            this.logger.extend('BLOCK_BODY')(`added for block #${block!.header.number}`)
            block.transactions.length > 0 &&
              (await this.history.receiptManager.saveReceipts(block!))
          } catch (err) {
            this.logger(`Error: ${(err as any).message}`)
          }
        } else {
          this.logger(`Could not verify block content`)
          // Don't store block body where we can't assemble a valid block
          return
        }
        break
      }
      case HistoryNetworkContentTypes.Receipt:
        this.history.client.db.put(
          getHistoryNetworkContentKey(HistoryNetworkContentTypes.Receipt, fromHexString(hashKey)),
          toHexString(value)
        )
        break
      case HistoryNetworkContentTypes.EpochAccumulator:
        this.history.client.db.put(
          getHistoryNetworkContentKey(
            HistoryNetworkContentTypes.EpochAccumulator,
            fromHexString(hashKey)
          ),
          toHexString(value)
        )
        break
      default:
        throw new Error('unknown data type provided')
    }
    this.history.client.emit('ContentAdded', hashKey, contentType, toHexString(value))
    this.logger(
      `added ${
        Object.keys(HistoryNetworkContentTypes)[
          Object.values(HistoryNetworkContentTypes).indexOf(contentType)
        ]
      } for ${hashKey}`
    )
    if (this.history.routingTable.values().length > 0) {
      // Gossip new content to network (except header accumulators)
      this.history.gossipManager.add(hashKey, contentType)
    }
  }

  private async autoLookup(key: Uint8Array, hash: string, type: HistoryNetworkContentTypes) {
    const lookup = new ContentLookup(this.history, key)
    try {
      const content = await lookup.startLookup()
      this.addContentToHistory(type, hash, content as Uint8Array)
    } catch {}
  }
}
