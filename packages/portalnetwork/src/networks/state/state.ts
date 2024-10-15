import { distance } from '@chainsafe/discv5'
import { ENR } from '@chainsafe/enr'
import { fromHexString, toHexString } from '@chainsafe/ssz'
import { BranchNode, ExtensionNode, Trie, decodeNode } from '@ethereumjs/trie'
import { bytesToHex, bytesToInt, bytesToUnprefixedHex, equalsBytes } from '@ethereumjs/util'
import debug from 'debug'

import { shortId } from '../../util/util.js'
import { RequestCode } from '../../wire/index.js'
import {
  ContentMessageType,
  FoundContent,
  MessageCodes,
  PortalWireMessageType,
} from '../../wire/types.js'
import { BaseNetwork } from '../network.js'
import { NetworkId } from '../types.js'

import { StateManager } from './manager.js'
import { packNibbles, unpackNibbles } from './nibbleEncoding.js'
import { AccountTrieNodeOffer, AccountTrieNodeRetrieval, StateNetworkContentType } from './types.js'
import { AccountTrieNodeContentKey, StateNetworkContentId, nextOffer } from './util.js'

import type { TNibbles } from './types.js'
import type { FindContentMessage } from '../../wire/types.js'
import type { BaseNetworkConfig, ContentLookupResponse } from '../index.js'
import type { Debugger } from 'debug'

export class StateNetwork extends BaseNetwork {
  networkId: NetworkId.StateNetwork
  networkName = 'StateNetwork'
  logger: Debugger
  stateroots: Map<bigint, Uint8Array> = new Map()
  manager: StateManager
  constructor({ client, db, radius, maxStorage }: BaseNetworkConfig) {
    super({ client, db, radius, maxStorage, networkId: NetworkId.StateNetwork })
    this.networkId = NetworkId.StateNetwork
    this.logger = debug(this.enr.nodeId.slice(0, 5)).extend('Portal').extend('StateNetwork')
    this.routingTable.setLogger(this.logger)
    this.manager = new StateManager(this)
  }

  public contentKeyToId = (contentKey: Uint8Array): string => {
    return bytesToUnprefixedHex(StateNetworkContentId.fromBytes(contentKey))
  }

  /**
   * Send FINDCONTENT request for content corresponding to `key` to peer corresponding to `dstId`
   * @param dstId node id of peer
   * @param key content key defined by the subnetwork spec
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
    if (res.length === 0) {
      return undefined
    }

    try {
      if (bytesToInt(res.slice(0, 1)) === MessageCodes.CONTENT) {
        this.portal.metrics?.contentMessagesReceived.inc()
        this.logger.extend('FOUNDCONTENT')(`Received from ${shortId(enr)}`)
        const decoded = ContentMessageType.deserialize(res.subarray(1))
        const contentType = key[0]
        let response: ContentLookupResponse
        switch (decoded.selector) {
          case FoundContent.UTP: {
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
                peerId: dstId,
                connectionId: id,
                requestCode: RequestCode.FINDCONTENT_READ,
              })
            })
            break
          }
          case FoundContent.CONTENT:
            this.logger.extend(`FOUNDCONTENT`)(
              `received ${StateNetworkContentType[contentType]} content corresponding to ${toHexString(key)}`,
            )
            try {
              await this.store(key, decoded.value as Uint8Array, false)
            } catch {
              this.logger('Error adding content to DB')
            }
            response = { content: decoded.value as Uint8Array, utp: false }
            break
          case FoundContent.ENRS: {
            this.logger.extend(`FOUNDCONTENT`)(`received ${decoded.value.length} ENRs`)
            response = { enrs: decoded.value as Uint8Array[] }
            break
          }
        }
        return response
      }
    } catch (err: any) {
      this.logger(`Error sending FINDCONTENT to ${shortId(enr)} - ${err.message}`)
    }
  }

  public findContentLocally = async (contentKey: Uint8Array): Promise<Uint8Array | undefined> => {
    try {
      const value = await this.db.get(contentKey)
      return value !== undefined ? fromHexString(value) : undefined
    } catch {
      return undefined
    }
  }

  public store = async (contentKey: Uint8Array, content: Uint8Array, offer: boolean = true) => {
    const contentType = contentKey[0]
    try {
      if (offer && contentType === StateNetworkContentType.AccountTrieNode) {
        await this.receiveAccountTrieNodeOffer(contentKey, content)
      } else {
        if (contentType === StateNetworkContentType.AccountTrieNode) {
          const { nodeHash } = AccountTrieNodeContentKey.decode(contentKey)
          this.manager.db.local.set(bytesToUnprefixedHex(nodeHash), bytesToHex(contentKey))
        }
        await this.db.put(contentKey, content)
      }
      this.logger(`content added for: ${bytesToHex(contentKey)}`)
      this.emit('ContentAdded', contentKey, content)
    } catch (err: any) {
      this.logger(`Error storing content: ${err.message}`)
    }
  }
  async receiveAccountTrieNodeOffer(
    contentKey: Uint8Array,
    content: Uint8Array,
  ): Promise<{
    stored: number
  }> {
    const { path } = AccountTrieNodeContentKey.decode(contentKey)
    const { proof, blockHash } = AccountTrieNodeOffer.deserialize(content)
    const interested = await this.storeInterestedAccountTrieNodes(path, proof)
    void this.forwardAccountTrieOffer(path, proof, blockHash)
    return { stored: interested.interested.length }
  }

  async storeInterestedAccountTrieNodes(path: TNibbles, proof: Uint8Array[]) {
    const nodes = [...proof]
    const nibbles = unpackNibbles(path)
    this.logger.extend('storeInterestedNodes')(`Nodes: ${proof.length}.  Path: [${nibbles}]`)
    const newpaths = [...nibbles]
    const interested: { contentKey: Uint8Array; dbContent: Uint8Array }[] = []
    const notInterested: { contentKey: Uint8Array; nodeHash: string }[] = []
    let curRlp = nodes.pop()
    let i = 0
    while (curRlp) {
      const curNode = decodeNode(curRlp)
      if (curNode instanceof BranchNode) {
        newpaths.pop()
      } else if (curNode instanceof ExtensionNode) {
        const consumed = newpaths.splice(-curNode._nibbles.length)
        this.logger.extend('storeInterestedNodes')(
          `Node nibbles (${curNode._nibbles.length}): [${consumed}].  Path: [${newpaths}]`,
        )
      }
      const nodeHash = new Trie({ useKeyHashing: true })['hash'](curRlp)
      this.logger.extend('storeInterestedNodes')(
        `${i} Path: [${newpaths}] - ${curNode.constructor.name}: ${bytesToHex(nodeHash).slice(0, 8)}...`,
      )
      i++
      const contentKey = AccountTrieNodeContentKey.encode({
        nodeHash,
        path: packNibbles(newpaths),
      })
      const contentId = StateNetworkContentId.fromBytes(contentKey)
      const in_radius = distance(bytesToUnprefixedHex(contentId), this.enr.nodeId) < this.nodeRadius
      if (in_radius) {
        const dbContent = AccountTrieNodeRetrieval.serialize({
          node: curRlp,
        })
        interested.push({ contentKey, dbContent })
        this.manager.db.local.set(bytesToUnprefixedHex(nodeHash), bytesToHex(contentKey))
      } else {
        notInterested.push({ contentKey, nodeHash: toHexString(nodeHash) })
      }

      curRlp = nodes.pop()
    }
    for (const { contentKey, dbContent } of interested) {
      await this.db.put(contentKey, dbContent)
    }
    return { interested, notInterested }
  }

  async forwardAccountTrieOffer(path: TNibbles, proof: Uint8Array[], blockHash: Uint8Array) {
    const { nodes, newpaths } = nextOffer(path, proof)
    const content = AccountTrieNodeOffer.serialize({ blockHash, proof: [...nodes] })
    const nodeHash = new Trie({ useKeyHashing: true })['hash'](nodes[nodes.length - 1])
    const contentKey = AccountTrieNodeContentKey.encode({
      nodeHash,
      path: packNibbles(newpaths),
    })
    await this.gossipContent(contentKey, content)
    return { content, contentKey }
  }
}
