import debug, { Debugger } from 'debug'
import {
  PortalNetwork,
  getHistoryNetworkContentId,
  ProtocolId,
  reassembleBlock,
  HistoryNetworkContentKeyUnionType,
  ENR,
  fromHexString,
} from 'portalnetwork'
import * as rlp from 'rlp'
import { addRLPSerializedBlock } from 'portalnetwork'
import { isValidId } from './util'
import { HistoryProtocol } from 'portalnetwork/src/subprotocols/history/history'

export class RPCManager {
  public _client: PortalNetwork
  public protocol: HistoryProtocol
  private log: Debugger
  private _methods: { [key: string]: Function } = {
    discv5_nodeInfo: async () => {
      this.log('discv5_nodeInfo request received')
      return 'Ultralight-CLI: v0.0.1'
    },
    eth_getBlockByHash: async (params: [string, boolean]) => {
      const [blockHash, includeTransactions] = params
      this.log(
        `eth_getBlockByHash request received. blockHash: ${blockHash} includeTransactions: ${includeTransactions}`
      )
      // lookup block header in DB and return if found
      const headerlookupKey = getHistoryNetworkContentId(1, blockHash, 0)
      const bodylookupKey = includeTransactions && getHistoryNetworkContentId(1, blockHash, 1)
      let header
      let body
      let block
      try {
        header = await this._client.db.get(headerlookupKey)
        body = includeTransactions ? await this._client.db.get(bodylookupKey) : rlp.encode([[], []])
        block = reassembleBlock(
          fromHexString(header),
          typeof body === 'string' ? fromHexString(body) : body
        )
        this._client.metrics?.successfulContentLookups.inc()
        return block
      } catch (err: any) {
        this.log(err.message)
      }
      // If block isn't in local DB, request block from network
      try {
        header = await this.protocol.historyNetworkContentLookup(0, blockHash)
        if (!header) {
          return 'Block not found'
        }
        body = includeTransactions
          ? (await this.protocol.historyNetworkContentLookup(1, blockHash)) ?? rlp.encode([[], []])
          : rlp.encode([[], []])
        // TODO: Figure out why block body isn't coming back as Uint8Array
        //@ts-ignore
        block = reassembleBlock(header as Uint8Array, body)
        return block
      } catch {
        return 'Block not found'
      }
    },
    portal_addBootNode: async (params: [string]) => {
      const [enr] = params
      const encodedENR = ENR.decodeTxt(enr)
      this.log(
        `portal_addBootNode request received for NodeID: ${encodedENR.nodeId.slice(0, 15)}...`
      )
      await this.protocol.addBootNode(enr)
      return `Bootnode added for ${encodedENR.nodeId.slice(0, 15)}...`
    },
    portal_addBlockToHistory: async (params: [string, string]) => {
      const [blockHash, rlpHex] = params
      try {
        addRLPSerializedBlock(rlpHex, blockHash, this.protocol)
        return `blockheader for ${blockHash} added to content DB`
      } catch (err: any) {
        this.log(`Error trying to load block to DB. ${err.message.toString()}`)
        return `internal error`
      }
    },
    portal_nodeEnr: async () => {
      this.log(`portal_nodeEnr request received`)
      try {
        const enr = this._client.discv5.enr.encodeTxt()
        return enr
      } catch (err) {
        return 'Unable to generate ENR'
      }
    },
    portal_findNodes: async (params: [string, number[]]) => {
      const [dstId, distances] = params
      if (!isValidId(dstId)) {
        return 'invalid node id'
      }
      this.log(`portal_findNodes request received with these distances ${distances.toString()}`)
      const res = await this.protocol.sendFindNodes(dstId, distances)
      this.log(`response received to findNodes ${res?.toString()}`)
      return `${res?.total ?? 0} nodes returned`
    },
    portal_ping: async (params: [string]) => {
      const [enr] = params
      const encodedENR = ENR.decodeTxt(enr)
      this.log(`portal_ping request received`)
      await this.protocol.sendPing(enr)
      this.log(`TEST PONG received from ${encodedENR.nodeId}`)
      return `PING/PONG successful with ${encodedENR.nodeId}`
    },
    portal_history_findContent: async (params: [string, Uint8Array]) => {
      const [enr, contentKey] = params
      const res = await this.protocol.sendFindContent(enr, contentKey)
      return res
    },
    portal_history_offer: async (params: [string, string[], number[]]) => {
      const [dstId, blockHashes, contentTypes] = params
      contentTypes.forEach((contentType) => {
        try {
          isValidId(dstId)
          contentType > 0
          contentType < 2
        } catch {
          throw new Error('invalid parameters')
        }
      })
      const contentKeys = blockHashes.map((blockHash, idx) => {
        return HistoryNetworkContentKeyUnionType.serialize({
          selector: contentTypes[idx],
          value: {
            chainId: 1,
            blockHash: fromHexString(blockHash),
          },
        })
      })
      const res = await this.protocol.sendOffer(dstId, contentKeys)
      return res
    },
    portal_utp_find_content_test: async (params: [string]) => {
      this.log(`portal_utp_get_test request received`)
      const [enr] = params
      const encodedENR = ENR.decodeTxt(enr)
      await this.protocol.sendFindContent(
        encodedENR.nodeId,
        HistoryNetworkContentKeyUnionType.serialize({
          selector: 0,
          value: {
            chainId: 1,
            blockHash: Uint8Array.from(
              fromHexString('0x46b332ceda6777098fe7943929e76a5fcea772a866c0fb1d170ec65c46c7e3ae')
            ),
          },
        })
      )
      await this.protocol.sendFindContent(
        encodedENR.nodeId,
        HistoryNetworkContentKeyUnionType.serialize({
          selector: 1,
          value: {
            chainId: 1,
            blockHash: Uint8Array.from(
              fromHexString('0x0c1cf9b3d4aa3e20e12b355416a4e3202da53f54eaaafc882a7644e3e68127ec')
            ),
          },
        })
      )
      await this.protocol.sendFindContent(
        encodedENR.nodeId,
        HistoryNetworkContentKeyUnionType.serialize({
          selector: 1,
          value: {
            chainId: 1,
            blockHash: Uint8Array.from(
              fromHexString('0xca6063e4d9b37c2777233b723d9b08cf248e34a5ebf7f5720d59323a93eec14f')
            ),
          },
        })
      )
      return `Some uTP happened`
    },
    portal_utp_offer_test: async (params: [string, string[], number[]]) => {
      this.log(`portal_utp_offer_test request received`)
      const [enr, blockhashes, contentTypes] = params
      const encodedENR = ENR.decodeTxt(enr)
      const contentKeys = blockhashes.map((blockhash, idx) => {
        return HistoryNetworkContentKeyUnionType.serialize({
          selector: contentTypes[idx],
          value: {
            chainId: 1,
            blockHash: Uint8Array.from(fromHexString(blockhash)),
          },
        })
      })

      await this.protocol.sendOffer(encodedENR.nodeId, contentKeys)
      return `Some uTP happened`
    },
  }

  constructor(client: PortalNetwork) {
    this._client = client
    this.protocol = client.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
    this.log = debug(this._client.discv5.enr.nodeId.slice(0, 5)).extend('ultralight:RPC')
  }

  public getMethods() {
    return this._methods
  }
}
