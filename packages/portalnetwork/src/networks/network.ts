import { EventEmitter } from 'eventemitter3'
import { digest } from '@chainsafe/as-sha256'
import { EntryStatus, MAX_NODES_PER_BUCKET, distance } from '@chainsafe/discv5'
import { ENR } from '@chainsafe/enr'
import { BitArray } from '@chainsafe/ssz'
import {
  bytesToHex,
  bytesToInt,
  bytesToUnprefixedHex,
  concatBytes,
  fromAscii,
  hexToBytes,
  randomBytes,
} from '@ethereumjs/util'

import type {
  AcceptMessage,
  BaseNetworkConfig,
  ContentLookupResponse,
  ContentRequest,
  FindContentMessage,
  FindNodesMessage,
  INewRequest,
  INodeAddress,
  NodesMessage,
  OfferMessage,
  PingMessage,
  PongMessage,
  PortalNetwork,
} from '../index.js'
import {
  BasicRadius,
  ClientInfoAndCapabilities,
  ContentMessageType,
  ErrorPayload,
  HistoryRadius,
  MAX_PACKET_SIZE,
  MessageCodes,
  NetworkId,
  NodeLookup,
  PingPongErrorCodes,
  PingPongPayloadExtensions,
  PortalNetworkRoutingTable,
  PortalWireMessageType,
  RequestCode,
  arrayByteLength,
  decodeClientInfo,
  encodeClientInfo,
  encodeWithVariantPrefix,
  generateRandomNodeIdAtDistance,
  randUint16,
  shortId,
} from '../index.js'
import { FoundContent } from '../wire/types.js'

import { NetworkDB } from './networkDB.js'

import type { ITalkReqMessage } from '@chainsafe/discv5/message'
import type { SignableENR } from '@chainsafe/enr'
import type { Debugger } from 'debug'
import type * as PromClient from 'prom-client'
import { GossipManager } from './gossip.js'

export abstract class BaseNetwork extends EventEmitter {
  public capabilities: number[] = [
    PingPongPayloadExtensions.CLIENT_INFO_RADIUS_AND_CAPABILITIES,
    PingPongPayloadExtensions.BASIC_RADIUS_PAYLOAD,
  ]
  static MAX_CONCURRENT_UTP_STREAMS = 50
  public routingTable: PortalNetworkRoutingTable
  public nodeRadius: bigint
  public db: NetworkDB
  public maxStorage: number
  private checkIndex: number
  public logger: Debugger
  public networkId: NetworkId
  abstract networkName: string
  public enr: SignableENR
  public bridge: boolean
  public gossipManager: GossipManager
  portal: PortalNetwork
  private lastRefreshTime: number = 0
  private nextRefreshTimeout: ReturnType<typeof setTimeout> | null = null
  private refreshInterval: number = 30000 // Start with 30s
  public ephemeralHeadersCount: number = 0

  constructor({
    client,
    networkId,
    db,
    radius,
    maxStorage,
    bridge,
    gossipCount,
  }: BaseNetworkConfig) {
    super()
    this.bridge = bridge ?? false
    this.networkId = networkId
    this.logger = client.logger.extend(this.constructor.name)
    this.enr = client.discv5.enr
    this.checkIndex = 0
    this.nodeRadius = radius ?? 2n ** 256n - 1n
    this.maxStorage = maxStorage ?? 1024
    this.routingTable = new PortalNetworkRoutingTable(this.enr.nodeId)
    this.portal = client
    this.db = new NetworkDB({
      networkId: this.networkId,
      nodeId: this.enr.nodeId,
      contentId: this.contentKeyToId,
      db,
      logger: this.logger,
    })
    if (this.portal.metrics) {
      this.portal.metrics.knownHistoryNodes.collect = () => {
        this.portal.metrics?.knownHistoryNodes.set(this.routingTable.size)
      }
    }
    this.gossipManager = new GossipManager(this, gossipCount)
  }

  public routingTableInfo = async () => {
    return {
      nodeId: this.enr.nodeId,
      buckets: this.routingTable.buckets,
    }
  }

  async handleNewRequest(request: INewRequest): Promise<ContentRequest> {
    return this.portal.uTP.handleNewRequest(request)
  }

  /**
   * Send a properly formatted Portal Network message to another node
   * @param dstId `NodeId` of message recipient
   * @param payload `Uint8Array` serialized payload of message
   * @param networkId subnetwork ID of subnetwork message is being sent on
   * @returns response from `dstId` as `Buffer` or null `Buffer`
   */
  async sendMessage(
    enr: ENR,
    payload: Uint8Array,
    networkId: NetworkId,
    utpMessage?: boolean,
  ): Promise<Uint8Array> {
    try {
      const res = await this.portal.sendPortalNetworkMessage(enr, payload, networkId, utpMessage)
      return res
    } catch (err: any) {
      this.logger.extend('error')(`${err.message}`)
      return new Uint8Array()
    }
  }

  sendResponse(src: INodeAddress, requestId: bigint, payload: Uint8Array): Promise<void> {
    return this.portal.sendPortalNetworkResponse(src, requestId, payload)
  }
  findEnr(nodeId: string): ENR | undefined {
    return this.portal.findENR(nodeId) ?? this.routingTable.getWithPending(nodeId)?.value
  }

  public async put(contentKey: Uint8Array, content: string) {
    await this.db.put(contentKey, content)
  }

  public async del(contentKey: Uint8Array) {
    await this.db.del(contentKey)
  }

  public async get(key: Uint8Array) {
    return this.db.get(key)
  }

  async setRadius(radius: bigint) {
    this.nodeRadius = radius
    await this.db.db.put('radius', radius.toString())
  }

  public async prune(newMaxStorage?: number) {
    const MB = 1000000
    try {
      if (newMaxStorage !== undefined) {
        this.maxStorage = newMaxStorage
      }
      let size = await this.db.size()
      const toDelete: [string, string][] = []
      while (size > this.maxStorage * MB) {
        const radius = this.nodeRadius / 2n
        const pruned = await this.db.prune(radius)
        toDelete.push(...pruned)
        await this.setRadius(radius)
        size = await this.db.size()
      }
      for (const [key, val] of toDelete) {
        void this.gossipContent(hexToBytes(key), hexToBytes(val))
      }
    } catch (err: any) {
      this.logger(`Error pruning content: ${err.message}`)
      return `Error pruning content: ${err.message}`
    }
    return this.db.size()
  }

  public streamingKey(contentKey: Uint8Array) {
    this.db.addToStreaming(contentKey)
  }

  public contentKeyToId(contentKey: Uint8Array): string {
    return bytesToUnprefixedHex(digest(contentKey))
  }

  abstract store(contentKey: Uint8Array, value: Uint8Array): Promise<void>

  public async handle(message: ITalkReqMessage, src: INodeAddress) {
    const id = message.id
    const network = message.protocol
    const request = message.request
    const deserialized = PortalWireMessageType.deserialize(request)
    const decoded = deserialized.value
    const messageType = deserialized.selector
    this.logger.extend(MessageCodes[messageType])(
      `Received from ${shortId(src.nodeId, this.routingTable)}`,
    )
    switch (messageType) {
      case MessageCodes.PING:
        await this.handlePing(src, id, decoded as PingMessage)
        break
      case MessageCodes.PONG:
        this.logger(`PONG message not expected in TALKREQ`)
        break
      case MessageCodes.FINDNODES:
        this.portal.metrics?.findNodesMessagesReceived.inc()
        await this.handleFindNodes(src, id, decoded as FindNodesMessage)
        break
      case MessageCodes.FINDCONTENT:
        this.portal.metrics?.findContentMessagesReceived.inc()
        await this.handleFindContent(src, id, network, decoded as FindContentMessage)
        break
      case MessageCodes.OFFER:
        this.portal.metrics?.offerMessagesReceived.inc()
        void this.handleOffer(src, id, decoded as OfferMessage)
        break
      case MessageCodes.NODES:
      case MessageCodes.CONTENT:
      case MessageCodes.ACCEPT:
      default:
        this.logger(`${messageType} message not expected in TALKREQ`)
    }
  }

  public pingPongPayload(extensionType: number) {
    let payload: Uint8Array
    switch (extensionType) {
      case PingPongPayloadExtensions.CLIENT_INFO_RADIUS_AND_CAPABILITIES: {
        payload = ClientInfoAndCapabilities.serialize({
          ClientInfo: encodeClientInfo(this.portal.clientInfo),
          DataRadius: this.nodeRadius,
          Capabilities: this.capabilities,
        })
        break
      }
      case PingPongPayloadExtensions.BASIC_RADIUS_PAYLOAD: {
        payload = BasicRadius.serialize({ dataRadius: this.nodeRadius })
        break
      }
      case PingPongPayloadExtensions.HISTORY_RADIUS_PAYLOAD: {
        if (this.networkId !== NetworkId.HistoryNetwork) {
          throw new Error('HISTORY_RADIUS extension not supported on this network')
        }
        payload = HistoryRadius.serialize({
          dataRadius: this.nodeRadius,
          ephemeralHeadersCount: this.ephemeralHeadersCount ?? 0,
        })
        break
      }
      default: {
        throw new Error(`Unsupported PING extension type: ${extensionType}`)
      }
    }
    return payload
  }

  /**
   * Sends a Portal Network Wire Network PING message to a specified node
   * @param dstId the nodeId of the peer to send a ping to
   * @param payload custom payload to be sent in PING message
   * @param networkId subnetwork ID
   * @returns the PING payload specified by the subnetwork or undefined
   */
  public sendPing = async (enr: ENR, extensionType: number = 0) => {
    if (enr.nodeId === this.portal.discv5.enr.nodeId) {
      // Don't ping ourselves
      return undefined
    }
    // 3000ms tolerance for ping timeout
    if (!enr.nodeId) {
      this.logger(`Invalid ENR provided. PING aborted`)
      return
    }
    const peerCapabilities = this.portal.enrCache.getPeerCapabilities(enr.nodeId)
    if (peerCapabilities.has(extensionType) === false) {
      throw new Error(`Peer is not know to support extension type: ${extensionType}`)
    }
    const timeout = setTimeout(() => {
      return undefined
    }, 3000)
    try {
      const pingMsg = PortalWireMessageType.serialize({
        selector: MessageCodes.PING,
        value: {
          enrSeq: this.enr.seq,
          payloadType: extensionType,
          customPayload: this.pingPongPayload(extensionType),
        },
      })
      this.logger.extend(`PING`)(`Sent to ${shortId(enr)}`)
      const res = await this.sendMessage(enr, pingMsg, this.networkId)
      if (bytesToInt(res.subarray(0, 1)) === MessageCodes.PONG) {
        this.logger.extend('PONG')(`Received from ${shortId(enr)}`)
        const decoded = PortalWireMessageType.deserialize(res)
        const pongMessage = decoded.value as PongMessage
        // Received a PONG message so node is reachable, add to routing table
        this.updateRoutingTable(enr)
        switch (pongMessage.payloadType) {
          case PingPongPayloadExtensions.CLIENT_INFO_RADIUS_AND_CAPABILITIES: {
            const { ClientInfo, Capabilities, DataRadius } = ClientInfoAndCapabilities.deserialize(
              pongMessage.customPayload,
            )
            this.logger.extend('PONG')(
              `Client ${shortId(enr.nodeId)} is ${decodeClientInfo(ClientInfo).clientName} node with capabilities: ${Capabilities}`,
            )
            this.routingTable.updateRadius(enr.nodeId, DataRadius)
            this.portal.enrCache.updateNodeFromPong(enr, this.networkId, {
              capabilities: Capabilities,
              clientInfo: decodeClientInfo(ClientInfo),
              radius: DataRadius,
            })
            break
          }
          case PingPongPayloadExtensions.BASIC_RADIUS_PAYLOAD: {
            const { dataRadius } = BasicRadius.deserialize(pongMessage.customPayload)
            this.routingTable.updateRadius(enr.nodeId, dataRadius)
            this.portal.enrCache.updateNodeFromPong(enr, this.networkId, {
              radius: dataRadius,
            })
            break
          }
          case PingPongPayloadExtensions.HISTORY_RADIUS_PAYLOAD: {
            const { dataRadius } = HistoryRadius.deserialize(pongMessage.customPayload)
            this.routingTable.updateRadius(enr.nodeId, dataRadius)
            this.portal.enrCache.updateNodeFromPong(enr, this.networkId, {
              radius: dataRadius,
            })
            break
          }
          case PingPongPayloadExtensions.ERROR_RESPONSE: {
            const { errorCode, message } = ErrorPayload.deserialize(pongMessage.customPayload)
            this.logger.extend('PONG')(
              `Received error response from ${shortId(enr.nodeId)}: ${errorCode} - ${message}`,
            )
            break
          }
          default: {
            // Do nothing
          }
        }
        clearTimeout(timeout)
        return pongMessage
      } else {
        clearTimeout(timeout)
        this.routingTable.evictNode(enr.nodeId)
      }
    } catch (err: any) {
      this.logger(`Error during PING request: ${err.toString()}`)
      enr.nodeId && this.routingTable.evictNode(enr.nodeId)
      clearTimeout(timeout)
      return
    }
  }

  handlePing = async (src: INodeAddress, id: bigint, pingMessage: PingMessage) => {
    if (!this.routingTable.getWithPending(src.nodeId)?.value) {
      // Check to see if node is already in corresponding network routing table and add if not
      const enr = this.findEnr(src.nodeId)
      if (enr !== undefined) {
        this.updateRoutingTable(enr)
      }
    }
    let pongPayload: Uint8Array
    if (this.capabilities.includes(pingMessage.payloadType)) {
      switch (pingMessage.payloadType) {
        case PingPongPayloadExtensions.CLIENT_INFO_RADIUS_AND_CAPABILITIES: {
          const { DataRadius, Capabilities, ClientInfo } = ClientInfoAndCapabilities.deserialize(pingMessage.customPayload)
          this.routingTable.updateRadius(src.nodeId, DataRadius)
          this.portal.enrCache.updateNodeFromPing(src, this.networkId, {
            capabilities: Capabilities,
            clientInfo: decodeClientInfo(ClientInfo),
            radius: DataRadius,
          })
          pongPayload = this.pingPongPayload(pingMessage.payloadType)
          break
        }
        case PingPongPayloadExtensions.BASIC_RADIUS_PAYLOAD: {
          const { dataRadius } = BasicRadius.deserialize(pingMessage.customPayload)
          this.routingTable.updateRadius(src.nodeId, dataRadius)
          this.portal.enrCache.updateNodeFromPing(src, this.networkId, {
            radius: dataRadius,
          })
          pongPayload = this.pingPongPayload(pingMessage.payloadType)
          break
        }
        case PingPongPayloadExtensions.HISTORY_RADIUS_PAYLOAD: {
          const { dataRadius } = HistoryRadius.deserialize(pingMessage.customPayload)
          this.routingTable.updateRadius(src.nodeId, dataRadius)
          this.portal.enrCache.updateNodeFromPing(src, this.networkId, {
            radius: dataRadius,
          })
          pongPayload = this.pingPongPayload(pingMessage.payloadType)
          break
        }
        default: {
          pongPayload = ErrorPayload.serialize({
            errorCode: 0,
            message: hexToBytes(
              fromAscii(
                `${this.constructor.name} does not support PING extension type: ${pingMessage.payloadType}`,
              ),
            ),
          })
        }
      }
    } else {
      pongPayload = ErrorPayload.serialize({
        errorCode: PingPongErrorCodes.EXTENSION_NOT_SUPPORTED,
        message: hexToBytes(
          fromAscii(
            `${this.constructor.name} does not support PING extension type: ${pingMessage.payloadType}`,
          ),
        ),
      })
      return this.sendPong(src, id, pongPayload, PingPongPayloadExtensions.ERROR_RESPONSE)
    }
    return this.sendPong(src, id, pongPayload, pingMessage.payloadType)
  }

  sendPong = async (
    src: INodeAddress,
    requestId: bigint,
    customPayload: Uint8Array,
    payloadType: number,
  ) => {
    const payload = {
      enrSeq: this.enr.seq,
      payloadType,
      customPayload,
    }
    const pongMsg = PortalWireMessageType.serialize({
      selector: MessageCodes.PONG,
      value: payload,
    })
    this.logger.extend('PONG')(`Sent to ${shortId(src.nodeId, this.routingTable)}`)
    await this.sendResponse(src, requestId, pongMsg)
    return pongMsg
  }

  /**
   *
   * Sends a Portal Network FINDNODES request to a peer requesting other node ENRs
   * @param dstId node id or enr of peer
   * @param distances distances as defined by subnetwork for node ENRs being requested
   * @param networkId subnetwork id for message being
   * @returns a {@link `NodesMessage`} or undefined
   */
  public sendFindNodes = async (enr: ENR, distances: number[]) => {
    this.portal.metrics?.findNodesMessagesSent.inc()
    const findNodesMsg: FindNodesMessage = { distances }
    const payload = PortalWireMessageType.serialize({
      selector: MessageCodes.FINDNODES,
      value: findNodesMsg,
    })
    const res = await this.sendMessage(enr, payload, this.networkId)
    if (bytesToInt(res.slice(0, 1)) === MessageCodes.NODES) {
      this.portal.metrics?.nodesMessagesReceived.inc()
      const decoded = PortalWireMessageType.deserialize(res).value as NodesMessage
      const enrs = decoded.enrs ?? []
      try {
        if (enrs.length > 0) {
          const notIgnored = enrs.filter((e) => !this.routingTable.isIgnored(ENR.decode(e).nodeId))
          // Ping node if not currently ignored by subnetwork routing table
          await Promise.allSettled(
            notIgnored.map((e) => {
              const decodedEnr = ENR.decode(e)
              return this.sendPing(decodedEnr)
            }),
          )

          this.logger.extend(`NODES`)(`Received ${enrs.length} ENRs from ${shortId(enr.nodeId)}`)
        }
      } catch (err: any) {
        this.logger(`Error processing NODES message: ${err.toString()}`)
      }

      return decoded
    }
  }

  private handleFindNodes = async (
    src: INodeAddress,
    requestId: bigint,
    payload: FindNodesMessage,
  ) => {
    if (payload.distances.length > 0) {
      const nodesPayload: NodesMessage = {
        total: 0,
        enrs: [],
      }

      for (const distance of payload.distances) {
        this.logger.extend(`FINDNODES`)(
          `Gathering ENRs at distance ${distance} from ${shortId(src.nodeId, this.routingTable)}`,
        )
        if (distance === 0) {
          // Send the client's ENR if a node at distance 0 is requested
          nodesPayload.total++
          nodesPayload.enrs.push(this.enr.toENR().encode())
        } else {
          for (const enr of this.routingTable.valuesOfDistance(distance)) {
            // Exclude ENR from response if it matches the requesting node
            if (enr.nodeId === src.nodeId) continue
            // Break from loop if total size of NODES payload would exceed 1200 bytes
            // TODO: Decide what to do about case where we have more ENRs we could send

            if (arrayByteLength(nodesPayload.enrs) + enr.encode().length < 1200) {
              nodesPayload.total++
              nodesPayload.enrs.push(enr.encode())
            }
          }
        }
      }

      const encodedPayload = PortalWireMessageType.serialize({
        selector: MessageCodes.NODES,
        value: nodesPayload,
      })
      if (nodesPayload.enrs.length > 0) {
        this.logger.extend(`NODES`)(
          `Sending`,
          nodesPayload.enrs.length.toString(),
          `ENRs to `,
          shortId(src.nodeId, this.routingTable),
        )
      }
      await this.sendResponse(src, requestId, encodedPayload)
      this.portal.metrics?.nodesMessagesSent.inc()
    } else {
      await this.sendResponse(src, requestId, new Uint8Array())
    }
  }

  /**
   * Offers content corresponding to `contentKeys` to peer corresponding to `dstId`
   * @param dstId node ID of a peer
   * @param contentKeys content keys being offered as specified by the subnetwork
   * @param networkId network ID of subnetwork being used
   */
  public sendOffer = async (enr: ENR, contentKeys: Uint8Array[], content?: Uint8Array[]) => {
    if (content && content.length !== contentKeys.length) {
      throw new Error('Must provide all content or none')
    }
    if (contentKeys.length > 0) {
      this.portal.metrics?.offerMessagesSent.inc()
      const offerMsg: OfferMessage = {
        contentKeys,
      }
      const payload = PortalWireMessageType.serialize({
        selector: MessageCodes.OFFER,
        value: offerMsg,
      })
      this.logger.extend(`OFFER`)(
        `Sent to ${shortId(enr.nodeId)} with ${contentKeys.length} pieces of content`,
      )
      const res = await this.sendMessage(enr, payload, this.networkId)
      this.logger.extend(`OFFER`)(`Response from ${shortId(enr.nodeId)}`)
      if (res.length > 0) {
        try {
          const decoded = PortalWireMessageType.deserialize(res)
          if (decoded.selector === MessageCodes.ACCEPT) {
            this.portal.metrics?.acceptMessagesReceived.inc()
            const msg = decoded.value as AcceptMessage
            const id = new DataView(msg.connectionId.buffer).getUint16(0, false)
            // Initiate uTP streams with serving of requested content
            const requestedKeys: Uint8Array[] = contentKeys.filter(
              (n, idx) => msg.contentKeys.get(idx) === true,
            )
            if (requestedKeys.length === 0) {
              // Don't start uTP stream if no content ACCEPTed
              this.logger.extend('ACCEPT')(`No content ACCEPTed by ${shortId(enr.nodeId)}`)
              return []
            }
            this.logger.extend(`OFFER`)(`ACCEPT message received with uTP id: ${id}`)

            const requestedData: Uint8Array[] = []
            if (content) {
              for (const [idx, _] of requestedKeys.entries()) {
                if (msg.contentKeys.get(idx) === true) {
                  requestedData.push(content[idx])
                }
              }
            } else {
              for await (const key of requestedKeys) {
                let value = Uint8Array.from([])
                try {
                  value = hexToBytes(await this.get(key))
                  requestedData.push(value)
                } catch (err: any) {
                  this.logger(`Error retrieving content -- ${err.toString()}`)
                  requestedData.push(value)
                }
              }
            }
            const contents = encodeWithVariantPrefix(requestedData)
            await this.handleNewRequest({
              networkId: this.networkId,
              contentKeys: requestedKeys,
              enr,
              connectionId: id,
              requestCode: RequestCode.OFFER_WRITE,
              contents,
            })

            return msg.contentKeys
          }
        } catch (err: any) {
          this.logger(`Error sending to ${shortId(enr.nodeId)} - ${err.message}`)
        }
      }
    }
  }

  protected handleOffer = async (src: INodeAddress, requestId: bigint, msg: OfferMessage) => {
    this.logger.extend('OFFER')(
      `Received from ${shortId(src.nodeId, this.routingTable)} with ${
        msg.contentKeys.length
      } pieces of content.`,
    )
    const contentIds: boolean[] = Array(msg.contentKeys.length).fill(false)
    if (this.portal.uTP.openRequests() > BaseNetwork.MAX_CONCURRENT_UTP_STREAMS) {
      this.logger.extend('OFFER')(`Too many open UTP streams - rejecting offer`)
      return this.sendAccept(src, requestId, contentIds, [])
    }
    try {
      let offerAccepted = false
      try {
        for (let x = 0; x < msg.contentKeys.length; x++) {
          const cid = this.contentKeyToId(msg.contentKeys[x])
          const d = distance(cid, this.enr.nodeId)
          if (d >= this.nodeRadius) {
            this.logger.extend('OFFER')(
              `Content key: ${bytesToHex(msg.contentKeys[x])} is outside radius.\ndistance=${d}\nradius=${this.nodeRadius}`,
            )
            continue
          }
          try {
            await this.get(msg.contentKeys[x])
            this.logger.extend('OFFER')(`Already have this content ${msg.contentKeys[x]}`)
          } catch (err) {
            offerAccepted = true
            contentIds[x] = true
            this.logger.extend('OFFER')(
              `Found some interesting content ${shortId(bytesToHex(msg.contentKeys[x]))} from ${shortId(src.nodeId, this.routingTable)}`,
            )
          }
        }
        if (offerAccepted) {
          this.logger(`Accepting an OFFER`)
          const desiredKeys = msg.contentKeys.filter((k, i) => contentIds[i] === true)
          this.logger(bytesToHex(msg.contentKeys[0]))
          for (const k of desiredKeys) {
            this.streamingKey(k)
          }
          await this.sendAccept(src, requestId, contentIds, desiredKeys)
        } else {
          await this.sendAccept(src, requestId, contentIds, [])
        }
      } catch (err: any) {
        this.logger(`Something went wrong handling offer message: ${err.toString()}`)
        // Send empty response if something goes wrong parsing content keys
        await this.sendAccept(src, requestId, contentIds, [])
      }
    } catch {
      this.logger(`Error Processing OFFER msg`)
    }
    if (this.portal.metrics !== undefined) {
      const totalOffers = (
        await (this.portal.metrics.offerMessagesReceived as PromClient.Counter).get()
      ).values[0]
      this.logger.extend('METRICS')({ totalOffers })
      if (totalOffers.value % 50 === 0) {
        void this.prune()
      }
    } else if (Math.random() * 50 <= 1) {
      const size = await this.db.size()
      if (size > this.maxStorage) {
        void this.prune()
      }
    }
  }

  protected sendAccept = async (
    src: INodeAddress,
    requestId: bigint,
    desiredContentAccepts: boolean[],
    desiredContentKeys: Uint8Array[],
  ) => {
    if (desiredContentKeys.length === 0) {
      // Send ACCEPT message with only 0s if no interesting content found
      const payload: AcceptMessage = {
        connectionId: randomBytes(2),
        contentKeys: BitArray.fromBoolArray(desiredContentAccepts),
      }
      const encodedPayload = PortalWireMessageType.serialize({
        selector: MessageCodes.ACCEPT,
        value: payload,
      })
      await this.sendResponse(src, requestId, encodedPayload)
      return
    }
    const id = randUint16()
    this.logger.extend('ACCEPT')(
      `Accepting: ${desiredContentKeys.length} pieces of content.  connectionId: ${id}`,
    )
    this.portal.metrics?.acceptMessagesSent.inc()
    const idBuffer = new Uint8Array(2)
    new DataView(idBuffer.buffer).setUint16(0, id, false)

    const payload: AcceptMessage = {
      connectionId: idBuffer,
      contentKeys: BitArray.fromBoolArray(desiredContentAccepts),
    }
    const encodedPayload = PortalWireMessageType.serialize({
      selector: MessageCodes.ACCEPT,
      value: payload,
    })
    await this.sendResponse(src, requestId, encodedPayload)
    this.logger.extend('ACCEPT')(
      `Sent to ${shortId(src.nodeId, this.routingTable)} for ${
        desiredContentKeys.length
      } pieces of content.  connectionId: ${id}`,
    )
    const enr = this.findEnr(src.nodeId) ?? src
    await this.handleNewRequest({
      networkId: this.networkId,
      contentKeys: desiredContentKeys,
      enr,
      connectionId: id,
      requestCode: RequestCode.ACCEPT_READ,
    })
  }

  protected handleFindContent = async (
    src: INodeAddress,
    requestId: bigint,
    network: Uint8Array,
    decodedContentMessage: FindContentMessage,
  ) => {
    this.portal.metrics?.contentMessagesSent.inc()

    this.logger(
      `Received FindContent request for contentKey: ${bytesToHex(
        decodedContentMessage.contentKey,
      )}`,
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))
    const value = await this.findContentLocally(decodedContentMessage.contentKey)
    if (!value) {
      await this.enrResponse(decodedContentMessage.contentKey, src, requestId)
    } else if (value instanceof Uint8Array && value.length < MAX_PACKET_SIZE) {
      this.logger(
        'Found value for requested content ' +
          bytesToHex(decodedContentMessage.contentKey) +
          ' ' +
          bytesToHex(value.slice(0, 10)) +
          `...`,
      )
      const payload = ContentMessageType.serialize({
        selector: 1,
        value,
      })
      this.logger.extend('CONTENT')(`Sending requested content to ${src.nodeId}`)
      await this.sendResponse(
        src,
        requestId,
        concatBytes(Uint8Array.from([MessageCodes.CONTENT]), payload),
      )
    } else {
      this.logger.extend('FOUNDCONTENT')(
        'Found value for requested content.  Larger than 1 packet.  uTP stream needed.',
      )
      const _id = randUint16()
      const enr = this.findEnr(src.nodeId) ?? src
      await this.handleNewRequest({
        networkId: this.networkId,
        contentKeys: [decodedContentMessage.contentKey],
        enr,
        connectionId: _id,
        requestCode: RequestCode.FOUNDCONTENT_WRITE,
        contents: value,
      })

      const id = new Uint8Array(2)
      new DataView(id.buffer).setUint16(0, _id, false)
      this.logger.extend('FOUNDCONTENT')(`Sent message with CONNECTION ID: ${_id}.`)
      const payload = ContentMessageType.serialize({ selector: FoundContent.UTP, value: id })
      await this.sendResponse(
        src,
        requestId,
        concatBytes(Uint8Array.from([MessageCodes.CONTENT]), payload),
      )
    }
  }

  protected enrResponse = async (contentKey: Uint8Array, src: INodeAddress, requestId: bigint) => {
    const lookupKey = this.contentKeyToId(contentKey)
    // Discv5 calls for maximum of 16 nodes per NODES message
    const ENRs = this.routingTable.nearest(lookupKey, 16)

    const encodedEnrs = ENRs.filter((enr) => enr.nodeId !== src.nodeId).map((enr) => {
      return enr.encode()
    })
    if (encodedEnrs.length > 0) {
      this.logger.extend('FINDCONTENT')(`Found ${encodedEnrs.length} closer to content`)
      // TODO: Add capability to send multiple TALKRESP messages if # ENRs exceeds packet size
      while (encodedEnrs.length > 0 && arrayByteLength(encodedEnrs) > MAX_PACKET_SIZE) {
        // Remove ENRs until total ENRs less than 1200 bytes
        encodedEnrs.pop()
      }
      const payload = ContentMessageType.serialize({
        selector: FoundContent.ENRS,
        value: encodedEnrs as Uint8Array[],
      })
      await this.sendResponse(
        src,
        requestId,
        concatBytes(Uint8Array.from([MessageCodes.CONTENT]), payload),
      )
    } else {
      const payload = ContentMessageType.serialize({
        selector: FoundContent.ENRS,
        value: [],
      })
      this.logger(`Found no ENRs closer to content`)
      await this.sendResponse(
        src,
        requestId,
        concatBytes(Uint8Array.from([MessageCodes.CONTENT]), payload),
      )
    }
  }

  /**
   *
   * This method maintains the liveness of peers in the subnetwork routing tables.
   * @param srcId nodeId of peer being updated in subnetwork routing table
   * @param networkId subnetwork Id of routing table being updated
   * @param customPayload payload of the PING/PONG message being decoded
   */
  private updateRoutingTable = (enr: ENR) => {
    try {
      const nodeId = enr.nodeId
      // Only add node to the routing table if we have an ENR
      this.routingTable.getWithPending(enr.nodeId)?.value === undefined &&
        this.logger.extend('RoutingTable')(`adding ${shortId(nodeId)}`)
      this.routingTable.insertOrUpdate(enr, EntryStatus.Connected)

      this.portal.emit('NodeAdded', enr.nodeId, this.networkId)
    } catch (err) {
      this.logger(`Something went wrong: ${(err as any).message}`)
      try {
        this.routingTable.getWithPending(enr as any)?.value === undefined &&
          this.logger(`adding ${enr as any} to ${this.networkName} routing table`)
        this.routingTable.insertOrUpdate(enr, EntryStatus.Connected)
        this.portal.emit('NodeAdded', enr.nodeId, this.networkId)
      } catch (e) {
        this.logger(`Something went wrong : ${(e as any).message}`)
      }
    }
    return
  }

  abstract findContentLocally: (contentKey: Uint8Array) => Promise<Uint8Array | undefined>

  abstract sendFindContent?: (
    enr: ENR,
    key: Uint8Array,
  ) => Promise<ContentLookupResponse | undefined>

  /**
   * Pings each node in a 20% sample of the routing table.
   * Uses the existing PING/PONG liveness logic to evict nodes that do not respond.
   */
  private livenessCheck = async () => {
    let peers: ENR[] = this.routingTable.values()
    const sample = Math.ceil(peers.length / 5)
    peers = peers.slice(this.checkIndex, this.checkIndex + sample)
    this.checkIndex = (this.checkIndex + sample) % peers.length
    const flagged = []
    for (const peer of peers) {
      const res = await this.sendPing(peer)
      if (res === undefined) {
        flagged.push(peer.nodeId)
      }
    }
    if (flagged.length > 0) {
      this.logger.extend('livenessCheck')(`Flagged ${flagged.length} peers from routing table`)
    } else if (peers.length > 0) {
      this.logger.extend('livenessCheck')(`${peers.length} peers passed liveness check`)
    }
    this.routingTable.clearIgnored()
  }

  /**
   * Follows below algorithm to refresh a bucket in the routing table
   * 1. Select 4 closest non-full buckets to refresh
   * 2. Select a random node at the distance of each bucket
   * 3. Perform a NodeLookup for the random node
   * 4. NodeLookup will recursively query peers for new nodes at the distance of the bucket
   * 5. New nodes will be added to the routing table
   */
  public bucketRefresh = async () => {
    const now = Date.now()
    if (now - this.lastRefreshTime < this.getRefreshInterval()) {
      return
    }
    this.lastRefreshTime = now
    await this.livenessCheck()
    const size = this.routingTable.size
    if (size === 0) {
      return
    }
    this.logger.extend('bucketRefresh')(`Starting bucket refresh with ${size} peers`)
    const bucketsToRefresh = this.routingTable.buckets
      .map((bucket, idx) => {
        return { bucket, distance: idx }
      })
      .reverse()
      .slice(0, 16)
      .filter((pair) => pair.bucket.size() < MAX_NODES_PER_BUCKET)
      .slice(0, 4)
    this.logger.extend('bucketRefresh')(
      `Refreshing buckets: ${bucketsToRefresh.map((b) => b.distance).join(', ')}`,
    )

    await Promise.allSettled(
      bucketsToRefresh.map(async (bucket) => {
        const randomNodeId = generateRandomNodeIdAtDistance(this.enr.nodeId, bucket.distance)
        const lookup = new NodeLookup(this, randomNodeId, true)
        return lookup.startLookup()
      }),
    )
    const newSize = this.routingTable.size
    this.logger.extend('bucketRefresh')(
      `Finished bucket refresh with ${newSize} peers (${newSize - size} new peers)`,
    )
  }

  /**
   * Adds a bootnode which triggers a `findNodes` request to the Bootnode to populate the routing table
   * @param bootnode `string` encoded ENR of a bootnode
   * @param networkId network ID of the subnetwork routing table to add the bootnode to
   */
  public addBootNode = async (bootnode: string) => {
    const enr = ENR.decodeTxt(bootnode)
    if (enr.nodeId === this.enr.nodeId) {
      // Disregard attempts to add oneself as a bootnode
      return
    }
    const pong = await this.sendPing(enr)
    if (pong !== undefined) {
      for (let x = 239; x < 256; x++) {
        // Ask for nodes in all log2distances 239 - 256
        if (this.routingTable.valuesOfDistance(x).length < 16) {
          await this.sendFindNodes(enr, [x])
        }
      }
    }
  }

  // Gossip (OFFER) content to any interested peers.
  // Returns the number of peers that accepted the gossip.
  public async gossipContent(contentKey: Uint8Array, content: Uint8Array): Promise<number> {
    const peers = this.routingTable
      .values()
      .filter((e) => !this.routingTable.contentKeyKnownToPeer(e.nodeId, contentKey))
    const offerMsg: OfferMessage = {
      contentKeys: [contentKey],
    }
    const payload = PortalWireMessageType.serialize({
      selector: MessageCodes.OFFER,
      value: offerMsg,
    })
    const offered = await Promise.allSettled(
      peers.map(async (peer) => {
        this.logger.extend(`gossipContent`)(
          `Offering ${bytesToHex(contentKey)} to ${shortId(peer.nodeId)}`,
        )
        const res = await this.sendMessage(peer, payload, this.networkId)
        this.routingTable.markContentKeyAsKnownToPeer(peer.nodeId, contentKey)
        return [peer, res]
      }),
    )
    let accepted = 0
    for (const offer of offered) {
      if (offer.status === 'fulfilled') {
        const [enr, res] = offer.value as [ENR, Uint8Array]
        if (res.length > 0) {
          try {
            const decoded = PortalWireMessageType.deserialize(res)
            if (decoded.selector === MessageCodes.ACCEPT) {
              const msg = decoded.value as AcceptMessage
              if (msg.contentKeys.get(0) === true) {
                this.logger.extend(`gossipContent`)(
                  `${bytesToHex(contentKey)} accepted by ${shortId(enr.nodeId)}`,
                )
                accepted++
                this.logger.extend(`gossipContent`)(`accepted: ${accepted}`)
                const id = new DataView(msg.connectionId.buffer).getUint16(0, false)
                void this.handleNewRequest({
                  networkId: this.networkId,
                  contentKeys: [contentKey],
                  enr,
                  connectionId: id,
                  requestCode: RequestCode.OFFER_WRITE,
                  contents: encodeWithVariantPrefix([content]),
                })
              }
            }
          } catch {
            /** Noop */
          }
        }
      }
    }
    this.logger.extend(`gossipContent`)(`total: accepted: ${accepted}`)
    return accepted
  }

  public async retrieve(contentKey: Uint8Array): Promise<string | undefined> {
    try {
      const content = await this.get(contentKey)
      return content
    } catch (err: any) {
      this.logger(`Error retrieving content from DB -- ${err.message}`)
    }
  }

  private scheduleNextRefresh() {
    if (this.nextRefreshTimeout !== null) {
      clearTimeout(this.nextRefreshTimeout)
    }

    const interval = this.getRefreshInterval()
    this.nextRefreshTimeout = setTimeout(async () => {
      await this.bucketRefresh()
      this.scheduleNextRefresh()
    }, interval)
  }

  public startRefresh() {
    this.scheduleNextRefresh()
  }

  public stopRefresh() {
    if (this.nextRefreshTimeout !== null) {
      clearTimeout(this.nextRefreshTimeout)
      this.nextRefreshTimeout = null
    }
  }

  private getRefreshInterval() {
    const tableHealth = this.routingTable.size / 256 // Percentage of ideal size
    if (tableHealth > 0.8) {
      return 60000 // Healthy table = longer interval
    } else if (tableHealth < 0.3) {
      return 10000 // Unhealthy table = shorter interval
    }
    return 30000
  }
}
