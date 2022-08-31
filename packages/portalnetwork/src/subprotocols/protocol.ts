import { distance, ENR, EntryStatus, NodeId } from '@chainsafe/discv5'
import { ITalkReqMessage } from '@chainsafe/discv5/message'
import { INodeAddress } from '@chainsafe/discv5/lib/session/nodeInfo.js'
import { toHexString, fromHexString, BitArray } from '@chainsafe/ssz'
import { Union } from '@chainsafe/ssz/lib/interface.js'
import { Debugger } from 'debug'
import {
  randUint16,
  MAX_PACKET_SIZE,
  arrayByteLength,
  PortalNetworkMetrics,
  ProtocolId,
  PortalNetwork,
  PortalNetworkRoutingTable,
  shortId,
  serializedContentKeyToContentId,
  generateRandomNodeIdAtDistance,
  AcceptMessage,
  ContentMessageType,
  FindContentMessage,
  FindNodesMessage,
  MessageCodes,
  NodesMessage,
  OfferMessage,
  PingMessage,
  PingPongCustomDataType,
  PongMessage,
  PortalWireMessageType,
  connectionIdType,
  RequestCode,
  NodeLookup,
  StateNetworkRoutingTable,
} from '../index.js'
export abstract class BaseProtocol {
  public routingTable: PortalNetworkRoutingTable | StateNetworkRoutingTable
  protected metrics: PortalNetworkMetrics | undefined
  private nodeRadius: bigint
  protected abstract logger: Debugger
  abstract protocolId: ProtocolId
  abstract protocolName: string
  public client: PortalNetwork
  constructor(client: PortalNetwork, nodeRadius?: bigint, metrics?: PortalNetworkMetrics) {
    this.client = client
    this.nodeRadius = nodeRadius ?? 2n ** 256n - 1n
    this.routingTable = new PortalNetworkRoutingTable(client.discv5.enr.nodeId)
    this.metrics = metrics
    if (this.metrics) {
      this.metrics.knownHistoryNodes.collect = () => {
        this.metrics?.knownHistoryNodes.set(this.routingTable.size)
      }
    }
  }

  abstract init(): Promise<void>

  public handle(message: ITalkReqMessage, src: INodeAddress) {
    const id = message.id
    const protocol = message.protocol
    const request = message.request
    const deserialized = PortalWireMessageType.deserialize(request)
    const decoded = deserialized.value
    const messageType = deserialized.selector
    this.logger.extend(MessageCodes[messageType])(`Received from ${shortId(src.nodeId)}`)
    switch (messageType) {
      case MessageCodes.PING:
        this.handlePing(src, id, decoded as PingMessage)
        break
      case MessageCodes.PONG:
        this.logger(`PONG message not expected in TALKREQ`)
        break
      case MessageCodes.FINDNODES:
        this.metrics?.findNodesMessagesReceived.inc()
        this.handleFindNodes(src, id, decoded as FindNodesMessage)
        break
      case MessageCodes.NODES:
        this.logger(`NODES message not expected in TALKREQ`)
        break
      case MessageCodes.FINDCONTENT:
        this.metrics?.findContentMessagesReceived.inc()
        this.handleFindContent(src, id, protocol, decoded as FindContentMessage)
        break
      case MessageCodes.CONTENT:
        this.logger(`ACCEPT message not expected in TALKREQ`)
        break
      case MessageCodes.OFFER:
        this.metrics?.offerMessagesReceived.inc()
        this.handleOffer(src, id, decoded as OfferMessage)
        break
      case MessageCodes.ACCEPT:
        this.logger(`ACCEPT message not expected in TALKREQ`)
        break
      default:
        this.logger(`Unrecognized message type received`)
    }
  }
  /**
   * Sends a Portal Network Wire Protocol PING message to a specified node
   * @param dstId the nodeId of the peer to send a ping to
   * @param payload custom payload to be sent in PING message
   * @param protocolId subprotocol ID
   * @returns the PING payload specified by the subprotocol or undefined
   */
  public sendPing = async (nodeId: string | ENR) => {
    let enr: ENR | undefined = undefined
    if (nodeId instanceof ENR) {
      enr = nodeId
    } else if (typeof nodeId === 'string' && nodeId.startsWith('enr')) {
      enr = ENR.decodeTxt(nodeId)
    }
    if (!enr) {
      this.logger(`Invalid node ID provided. PING aborted`)
      return
    }
    const pingMsg = PortalWireMessageType.serialize({
      selector: MessageCodes.PING,
      value: {
        enrSeq: this.client.discv5.enr.seq,
        customPayload: PingPongCustomDataType.serialize({ radius: BigInt(this.nodeRadius) }),
      },
    })
    try {
      this.logger.extend(`PING`)(`Sent to ${shortId(enr.nodeId)}`)
      const res = await this.client.sendPortalNetworkMessage(
        enr,
        Buffer.from(pingMsg),
        this.protocolId
      )
      if (parseInt(res.slice(0, 1).toString('hex')) === MessageCodes.PONG) {
        this.logger.extend('PONG')(`Received from ${shortId(enr.nodeId)}`)
        const decoded = PortalWireMessageType.deserialize(res)
        const pongMessage = decoded.value as PongMessage
        // Received a PONG message so node is reachable, add to routing table
        this.updateRoutingTable(enr, true, pongMessage.customPayload)
        return pongMessage
      } else {
        this.updateRoutingTable(enr.nodeId, false)
      }
    } catch (err: any) {
      this.logger(`Error during PING request to ${shortId(enr.nodeId)}: ${err.toString()}`)
      if (this.routingTable.getValue(enr.nodeId)) {
        this.updateRoutingTable(enr, false)
      }
    }
  }

  private handlePing = (src: INodeAddress, id: bigint, pingMessage: PingMessage) => {
    if (!this.routingTable.getValue(src.nodeId)) {
      // Check to see if node is already in corresponding network routing table and add if not
      this.updateRoutingTable(src.nodeId, true, pingMessage.customPayload)
    } else {
      const radius = PingPongCustomDataType.deserialize(pingMessage.customPayload).radius
      this.routingTable.updateRadius(src.nodeId, radius)
    }
    this.sendPong(src, id)
  }

  private sendPong = async (src: INodeAddress, requestId: bigint) => {
    const payload = {
      enrSeq: this.client.discv5.enr.seq,
      customPayload: PingPongCustomDataType.serialize({ radius: this.nodeRadius }),
    }
    const pongMsg = PortalWireMessageType.serialize({
      selector: MessageCodes.PONG,
      value: payload,
    })
    this.logger.extend('PONG')(`Sent to ${shortId(src.nodeId)}`)
    this.client.sendPortalNetworkResponse(src, requestId, Buffer.from(pongMsg))
  }

  /**
   *
   * Sends a Portal Network FINDNODES request to a peer requesting other node ENRs
   * @param dstId node id of peer
   * @param distances distances as defined by subprotocol for node ENRs being requested
   * @param protocolId subprotocol id for message being
   * @returns a {@link `NodesMessage`} or undefined
   */
  public sendFindNodes = async (dstId: string, distances: number[]) => {
    this.metrics?.findNodesMessagesSent.inc()
    const findNodesMsg: FindNodesMessage = { distances: distances }
    const payload = PortalWireMessageType.serialize({
      selector: MessageCodes.FINDNODES,
      value: findNodesMsg,
    })

    try {
      this.logger.extend(`FINDNODES`)(`Sending to ${shortId(dstId)}`)
      const enr = this.routingTable.getValue(dstId)
      if (!enr) {
        this.logger(`Invalid node ID provided. FINDNODES aborted`)
        return
      }
      const res = await this.client.sendPortalNetworkMessage(
        enr,
        Buffer.from(payload),
        this.protocolId
      )
      if (parseInt(res.slice(0, 1).toString('hex')) === MessageCodes.NODES) {
        this.metrics?.nodesMessagesReceived.inc()
        const decoded = PortalWireMessageType.deserialize(res).value as NodesMessage
        if (decoded) {
          let counter = 0
          decoded.enrs.forEach((enr) => {
            const decodedEnr = ENR.decode(Buffer.from(enr))
            if (!this.routingTable.getValue(decodedEnr.nodeId)) {
              // Ping node if not currently in subprotocol routing table
              this.logger(`Discovered an unknown node: `, shortId(decodedEnr.nodeId))
              this.sendPing(decodedEnr)
            } else {
              counter++
            }
          })
          this.logger.extend(`NODES`)(
            `Received ${decoded.total} ENRs from ${shortId(dstId)} with ${
              decoded.enrs.length - counter
            } unknown.`
          )

          return decoded
        }
      }
    } catch (err: any) {
      this.logger(`Error sending FINDNODES to ${shortId(dstId)} - ${err}`)
    }
  }

  private handleFindNodes = (src: INodeAddress, requestId: bigint, payload: FindNodesMessage) => {
    if (payload.distances.length > 0) {
      const nodesPayload: NodesMessage = {
        total: 0,
        enrs: [],
      }
      payload.distances.every((distance) => {
        if (distance === 0 && arrayByteLength(nodesPayload.enrs) < 1200) {
          // Send the client's ENR if a node at distance 0 is requested
          nodesPayload.total++
          nodesPayload.enrs.push(this.client.discv5.enr.encode())
        } else {
          return this.routingTable.valuesOfDistance(distance).every((enr) => {
            // Exclude ENR from response if it matches the requesting node
            if (enr.nodeId === src.nodeId) return true
            // Break from loop if total size of NODES payload would exceed 1200 bytes
            // TODO: Decide what to do about case where we have more ENRs we could send

            if (arrayByteLength(nodesPayload.enrs) + enr.encode().length > 1200) return false
            nodesPayload.total++
            nodesPayload.enrs.push(enr.encode())
            return true
          })
        }
        return true
      })

      const encodedPayload = PortalWireMessageType.serialize({
        selector: MessageCodes.NODES,
        value: nodesPayload,
      })
      this.logger.extend(`NODES`)(
        `Sending`,
        nodesPayload.enrs.length.toString(),
        `ENRs to `,
        shortId(src.nodeId)
      )
      this.client.sendPortalNetworkResponse(src, requestId, encodedPayload)
      this.metrics?.nodesMessagesSent.inc()
    } else {
      this.client.sendPortalNetworkResponse(src, requestId, Buffer.from([]))
    }
  }

  /**
   * Offers content corresponding to `contentKeys` to peer corresponding to `dstId`
   * @param dstId node ID of a peer
   * @param contentKeys content keys being offered as specified by the subprotocol
   * @param protocolId network ID of subprotocol being used
   */
  public sendOffer = async (dstId: string, contentKeys: Uint8Array[]) => {
    if (contentKeys.length > 0) {
      this.metrics?.offerMessagesSent.inc()
      const offerMsg: OfferMessage = {
        contentKeys,
      }
      const payload = PortalWireMessageType.serialize({
        selector: MessageCodes.OFFER,
        value: offerMsg,
      })
      const enr = this.routingTable.getValue(dstId)
      if (!enr) {
        this.logger(`No ENR found for ${shortId(dstId)}. OFFER aborted.`)
        return
      }
      this.logger.extend(`OFFER`)(
        `Sent to ${shortId(dstId)} with ${contentKeys.length} pieces of content`
      )
      const res = await this.client.sendPortalNetworkMessage(
        enr,
        Buffer.from(payload),
        this.protocolId
      )
      if (res.length > 0) {
        try {
          const decoded = PortalWireMessageType.deserialize(res)
          if (decoded.selector === MessageCodes.ACCEPT) {
            this.metrics?.acceptMessagesReceived.inc()
            const msg = decoded.value as AcceptMessage
            const id = Buffer.from(msg.connectionId).readUInt16BE(0)
            // Initiate uTP streams with serving of requested content
            const requestedKeys: Uint8Array[] = contentKeys.filter(
              (n, idx) => msg.contentKeys.get(idx) === true
            )
            if (requestedKeys.length === 0) {
              // Don't start uTP stream if no content ACCEPTed
              this.logger.extend('ACCEPT')(`Received no desired content`)
              return []
            }

            const requestedData: Uint8Array[] = []
            await Promise.all(
              requestedKeys.map(async (key) => {
                let value = Uint8Array.from([])
                const lookupKey = serializedContentKeyToContentId(key)
                try {
                  value = fromHexString(await this.client.db.get(lookupKey))
                  requestedData.push(value)
                } catch (err: any) {
                  this.logger(`Error retrieving content -- ${err.toString()}`)
                  requestedData.push(value)
                }
              })
            )

            await this.client.uTP.handleNewRequest({
              contentKeys: requestedKeys,
              peerId: dstId,
              connectionId: id,
              requestCode: RequestCode.OFFER_WRITE,
              contents: requestedData,
            })

            return msg.contentKeys
          }
        } catch (err: any) {
          this.logger(`Error sending to ${shortId(dstId)} - ${err.message}`)
        }
      }
    }
  }

  private handleOffer = async (src: INodeAddress, requestId: bigint, msg: OfferMessage) => {
    this.logger.extend('OFFER')(
      `Received from ${shortId(src.nodeId)} with ${msg.contentKeys.length} pieces of content.`
    )
    try {
      if (msg.contentKeys.length > 0) {
        let offerAccepted = false
        try {
          const contentIds: boolean[] = Array(msg.contentKeys.length).fill(false)

          for (let x = 0; x < msg.contentKeys.length; x++) {
            try {
              await this.client.db.get(serializedContentKeyToContentId(msg.contentKeys[x]))
              this.logger.extend('OFFER')(`Already have this content ${msg.contentKeys[x]}`)
            } catch (err) {
              offerAccepted = true
              contentIds[x] = true
              this.logger.extend('OFFER')(
                `Found some interesting content from ${shortId(src.nodeId)}`
              )
            }
          }
          if (offerAccepted) {
            this.logger(`Accepting an OFFER`)
            const desiredKeys = msg.contentKeys.filter((k, i) => contentIds[i] === true)
            this.sendAccept(src, requestId, contentIds, desiredKeys)
          } else {
            this.logger(`Declining an OFFER since no interesting content`)
            this.client.sendPortalNetworkResponse(src, requestId, Buffer.from([]))
          }
        } catch {
          this.logger(`Something went wrong handling offer message`)
          // Send empty response if something goes wrong parsing content keys
          this.client.sendPortalNetworkResponse(src, requestId, Buffer.from([]))
        }
        if (!offerAccepted) {
          this.logger('We already have all this content')
          this.client.sendPortalNetworkResponse(src, requestId, Buffer.from([]))
        }
      } else {
        this.logger(`Offer Message Has No Content`)
        // Send empty response if something goes wrong parsing content keys
        this.client.sendPortalNetworkResponse(src, requestId, Buffer.from([]))
      }
    } catch {
      this.logger(`Error Processing OFFER msg`)
    }
  }

  private sendAccept = async (
    src: INodeAddress,
    requestId: bigint,
    desiredContentAccepts: boolean[],
    desiredContentKeys: Uint8Array[]
  ) => {
    this.logger.extend('ACCEPT')(
      `Sent to ${shortId(src.nodeId)} for ${desiredContentKeys.length} pieces of content.`
    )

    this.metrics?.acceptMessagesSent.inc()
    const id = randUint16()
    await this.client.uTP.handleNewRequest({
      contentKeys: desiredContentKeys,
      peerId: src.nodeId,
      connectionId: id,
      requestCode: RequestCode.ACCEPT_READ,
      contents: [],
    })
    const idBuffer = Buffer.alloc(2)
    idBuffer.writeUInt16BE(id, 0)

    const payload: AcceptMessage = {
      connectionId: idBuffer,
      contentKeys: BitArray.fromBoolArray(desiredContentAccepts),
    }
    const encodedPayload = PortalWireMessageType.serialize({
      selector: MessageCodes.ACCEPT,
      value: payload,
    })
    await this.client.sendPortalNetworkResponse(src, requestId, Buffer.from(encodedPayload))
  }

  private handleFindContent = async (
    src: INodeAddress,
    requestId: bigint,
    protocol: Buffer,
    decodedContentMessage: FindContentMessage
  ) => {
    this.metrics?.contentMessagesSent.inc()

    this.logger(
      `Received handleFindContent request for contentKey: ${toHexString(
        decodedContentMessage.contentKey
      )}`
    )

    const lookupKey = serializedContentKeyToContentId(decodedContentMessage.contentKey)
    const value = await this.findContentLocally(decodedContentMessage)
    if (value.length === 0) {
      // Discv5 calls for maximum of 16 nodes per NODES message
      const ENRs = this.routingTable.nearest(lookupKey, 16)
      const encodedEnrs = ENRs.map((enr) => {
        // Only include ENR if not the ENR of the requesting node and the ENR is closer to the
        // contentId than this node
        return enr.nodeId !== src.nodeId &&
          distance(enr.nodeId, lookupKey) < distance(this.client.discv5.enr.nodeId, lookupKey)
          ? enr.encode()
          : undefined
      }).filter((enr) => enr !== undefined)
      if (encodedEnrs.length > 0) {
        this.logger(`Found ${encodedEnrs.length} closer to content than us`)
        // TODO: Add capability to send multiple TALKRESP messages if # ENRs exceeds packet size
        while (encodedEnrs.length > 0 && arrayByteLength(encodedEnrs) > 1200) {
          // Remove ENRs until total ENRs less than 1200 bytes
          encodedEnrs.pop()
        }
        const payload = ContentMessageType.serialize({
          selector: 2,
          value: encodedEnrs as Buffer[],
        })
        this.client.sendPortalNetworkResponse(
          src,
          requestId,
          Buffer.concat([Buffer.from([MessageCodes.CONTENT]), payload])
        )
      } else {
        this.logger(`Found no ENRs closer to content than us`)
        this.client.sendPortalNetworkResponse(src, requestId, Uint8Array.from([]))
      }
    } else if (value && value.length < MAX_PACKET_SIZE) {
      this.logger(
        'Found value for requested content ' +
          Buffer.from(decodedContentMessage.contentKey).toString('hex') +
          value.slice(0, 10) +
          `...`
      )
      const payload = ContentMessageType.serialize({
        selector: 1,
        value: value,
      })
      this.logger.extend('CONTENT')(`Sending requested content to ${src.nodeId}`)
      this.client.sendPortalNetworkResponse(
        src,
        requestId,
        Buffer.concat([Buffer.from([MessageCodes.CONTENT]), Buffer.from(payload)])
      )
    } else {
      this.logger.extend('FOUNDCONTENT')(
        'Found value for requested content.  Larger than 1 packet.  uTP stream needed.'
      )
      const _id = randUint16()
      await this.client.uTP.handleNewRequest({
        contentKeys: [decodedContentMessage.contentKey],
        peerId: src.nodeId,
        connectionId: _id,
        requestCode: RequestCode.FOUNDCONTENT_WRITE,
        contents: [value],
      })

      const id = connectionIdType.serialize(_id)
      this.logger.extend('FOUNDCONTENT')(`Sent message with CONNECTION ID: ${_id}.`)
      const payload = ContentMessageType.serialize({ selector: 0, value: id })
      this.client.sendPortalNetworkResponse(
        src,
        requestId,
        Buffer.concat([Buffer.from([MessageCodes.CONTENT]), Buffer.from(payload)])
      )
    }
  }

  /**
   *
   * This method maintains the liveness of peers in the subprotocol routing tables.
   * @param srcId nodeId of peer being updated in subprotocol routing table
   * @param protocolId subprotocol Id of routing table being updated
   * @param customPayload payload of the PING/PONG message being decoded
   */
  private updateRoutingTable = (srcId: NodeId | ENR, add = false, customPayload?: any) => {
    const nodeId = typeof srcId === 'string' ? srcId : srcId.nodeId
    let enr = typeof srcId === 'string' ? this.routingTable.getValue(srcId) : srcId
    if (!add) {
      this.routingTable.evictNode(nodeId)
      this.logger.extend('Evict')(`removed ${nodeId} from ${this.protocolName} Routing Table`)
      return
    }
    try {
      if (!enr) {
        // See if Discv5 has an ENR for this node if not provided
        enr = this.client.discv5.getKadValue(nodeId)
      }
      if (enr) {
        // Only add node to the routing table if we have an ENR
        this.routingTable.insertOrUpdate(enr!, EntryStatus.Connected)
        this.logger(`adding ${nodeId} to ${this.protocolName} routing table`)
      }
      if (customPayload) {
        const decodedPayload = PingPongCustomDataType.deserialize(Uint8Array.from(customPayload))
        this.routingTable.updateRadius(nodeId, decodedPayload.radius)
      }
    } catch (err) {
      this.logger(`Something went wrong`)
      this.logger(err)
    }
    return
  }

  abstract findContentLocally: (decodedContentMessage: FindContentMessage) => Promise<Uint8Array>

  abstract sendFindContent?: (
    dstId: string,
    key: Uint8Array
  ) => Promise<Union<Uint8Array | Uint8Array[]> | undefined>

  /**
   * Pings each node in the specified routing table to check for liveness.  Uses the existing PING/PONG liveness logic to
   * evict nodes that do not respond
   */
  private livenessCheck = async (protocolId: ProtocolId) => {
    const peers: ENR[] = this.routingTable.values()
    this.logger.extend('livenessCheck')(`Checking ${peers!.length} peers for liveness`)
    const deadPeers = (
      await Promise.all(
        peers.map((peer: ENR) => {
          return new Promise((resolve) => {
            const result = this.sendPing(peer.nodeId)
            resolve(result)
          })
        })
      )
    ).filter((res) => !res)
    this.logger.extend('livenessCheck')(
      `Removed ${deadPeers.length} peers from ${protocolId} routing table`
    )
  }

  /**
   * Follows below algorithm to refresh a bucket in the routing table
   * 1: Look at your routing table and select all buckets at distance greater than 239 that are not full.
   * 2: Select a number of buckets to refresh using this logic (48+ nodes known, refresh 1 bucket, 24+ nodes known,
   * refresh half of not full buckets, <25 nodes known, refresh all not empty buckets
   * 3: Randomly generate a NodeID that falls within each bucket to be refreshed.
   * Do the random lookup on this node-id.
   */
  public bucketRefresh = async () => {
    const notFullBuckets = this.routingTable.buckets
      .map((bucket, idx) => {
        return { bucket: bucket, distance: idx }
      })
      .filter((pair) => pair.distance > 239 && pair.bucket.size() < 16)
    const size = this.routingTable.size
    let bucketsToRefresh
    if (size > 48) {
      // Only refresh one not full bucket if table contains equivalent of 3+ full buckets
      const idx = Math.floor(Math.random() * notFullBuckets.length)
      bucketsToRefresh = [notFullBuckets[idx]]
    } else if (size > 24) {
      // Refresh half of notFullBuckets if routing table contains equivalent of 1.5+ full buckets
      bucketsToRefresh = notFullBuckets.filter((_, idx) => idx % 2 === 0)
      // Refresh all not full buckets if routing table contains less than 25 nodes in it
    } else bucketsToRefresh = notFullBuckets
    for (const bucket of bucketsToRefresh) {
      const distance = bucket.distance
      const randomNodeAtDistance = generateRandomNodeIdAtDistance(
        this.client.discv5.enr.nodeId,
        distance
      )
      const lookup = new NodeLookup(this, randomNodeAtDistance)
      await lookup.startLookup()
    }
  }

  /**
   * Adds a bootnode which triggers a `findNodes` request to the Bootnode to populate the routing table
   * @param bootnode `string` encoded ENR of a bootnode
   * @param protocolId network ID of the subprotocol routing table to add the bootnode to
   */
  public addBootNode = async (bootnode: string) => {
    const enr = ENR.decodeTxt(bootnode)
    if (enr.nodeId === this.client.discv5.enr.nodeId) {
      // Disregard attempts to add oneself as a bootnode
      return
    }
    await this.sendPing(enr)
    for (let x = 239; x < 256; x++) {
      // Ask for nodes in all log2distances 239 - 256
      if (this.routingTable.valuesOfDistance(x).length === 0) {
        this.sendFindNodes(enr.nodeId, [x])
      }
    }
  }
}
