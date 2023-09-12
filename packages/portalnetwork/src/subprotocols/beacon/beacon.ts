import { Debugger } from 'debug'
import { BaseProtocol } from '../protocol.js'
import { ProtocolId } from '../types.js'
import { PortalNetwork } from '../../client/client.js'
import debug from 'debug'
import { Union } from '@chainsafe/ssz/lib/interface.js'
import { toHexString } from '@chainsafe/ssz'
import { shortId } from '../../util/util.js'
import { createBeaconConfig, defaultChainConfig, BeaconConfig } from '@lodestar/config'
import { genesisData } from '@lodestar/config/networks'
import {
  BeaconLightClientNetworkContentType,
  LightClientBootstrapKey,
  LightClientFinalityUpdateKey,
  LightClientOptimisticUpdateKey,
  LightClientUpdatesByRange,
  LightClientUpdatesByRangeKey,
  MIN_BOOTSTRAP_VOTES,
} from './types.js'
import {
  AcceptMessage,
  ContentMessageType,
  FindContentMessage,
  MessageCodes,
  OfferMessage,
  PortalWireMessageType,
} from '../../wire/types.js'
import {
  bytesToHex,
  bytesToInt,
  concatBytes,
  hexToBytes,
  intToHex,
  padToEven,
} from '@ethereumjs/util'
import {
  RequestCode,
  FoundContent,
  randUint16,
  MAX_PACKET_SIZE,
  encodeWithVariantPrefix,
} from '../../wire/index.js'
import { ssz } from '@lodestar/types'

import { LightClientUpdate } from '@lodestar/types/lib/allForks/types.js'
import { computeSyncPeriodAtSlot, getCurrentSlot } from '@lodestar/light-client/utils'
import { INodeAddress } from '@chainsafe/discv5/lib/session/nodeInfo.js'
import { Lightclient } from '@lodestar/light-client'
import { UltralightTransport } from './ultralightTransport.js'
import { NodeId } from '@chainsafe/discv5'
import { getBeaconContentKey } from './util.js'

export class BeaconLightClientNetwork extends BaseProtocol {
  protocolId: ProtocolId.BeaconLightClientNetwork
  beaconConfig: BeaconConfig
  protocolName = 'BeaconLightClientNetwork'
  logger: Debugger
  lightClient: Lightclient | undefined
  portal: PortalNetwork
  bootstrapFinder: Map<NodeId, string[] | {}>
  constructor(client: PortalNetwork, nodeRadius?: bigint) {
    super(client, nodeRadius)
    this.portal = client
    // This config is used to identify the Beacon Chain fork any given light client update is from
    const genesisRoot = hexToBytes(genesisData.mainnet.genesisValidatorsRoot)
    this.beaconConfig = createBeaconConfig(defaultChainConfig, genesisRoot)

    this.protocolId = ProtocolId.BeaconLightClientNetwork
    this.logger = debug(this.enr.nodeId.slice(0, 5))
      .extend('Portal')
      .extend('BeaconLightClientNetwork')
    this.routingTable.setLogger(this.logger)
    this.bootstrapFinder = new Map()
    client.uTP.on(
      ProtocolId.BeaconLightClientNetwork,
      async (contentType: number, hash: string, value: Uint8Array) => {
        await this.store(contentType, hash, value)
      },
    )
    this.on('ContentAdded', async (contentKey) => {
      // Gossip new content to 5 random nodes in routing table
      for (let x = 0; x < 5; x++) {
        const peer = this.routingTable.random()
        if (
          peer !== undefined &&
          !this.routingTable.contentKeyKnownToPeer(peer.nodeId, contentKey)
        ) {
          await this.sendOffer(peer.nodeId, [hexToBytes(contentKey)])
        }
      }
    })

    this.portal.on('NodeAdded', this.getBootStrapVote)
  }

  private getBootStrapVote = async (nodeId: string, protocol: ProtocolId) => {
    if (protocol === ProtocolId.BeaconLightClientNetwork) {
      if (this.bootstrapFinder.has(nodeId)) return
      this.bootstrapFinder.set(nodeId, {} as any)
      const currentPeriod = BigInt(
        computeSyncPeriodAtSlot(getCurrentSlot(this.beaconConfig, genesisData.mainnet.genesisTime)),
      )

      // Request the range of Light Client Updates extending back 4 sync periods
      const rangeKey = hexToBytes(
        getBeaconContentKey(
          BeaconLightClientNetworkContentType.LightClientUpdatesByRange,
          LightClientUpdatesByRangeKey.serialize({ startPeriod: currentPeriod - 3n, count: 4n }),
        ),
      )
      this.logger.extend('BOOTSTRAP')(`Requesting recent LightClientUpdates from ${shortId(nodeId)}`)
      const range = await this.sendFindContent(nodeId, rangeKey)
      if (range === undefined) return // If we don't get a range, exit early
      if (range.value.length === 4) {
        const updates = LightClientUpdatesByRange.deserialize(range.value as Uint8Array)

        const roots: string[] = []
        for (const update of updates) {
          const fork = this.beaconConfig.forkDigest2ForkName(bytesToHex(update.slice(0, 4)))
          const decoded = (ssz as any)[fork].LightClientUpdate(update.slice(4)) as LightClientUpdate
          roots.push(
            toHexString(ssz.phase0.BeaconBlockHeader.hashTreeRoot(decoded.finalizedHeader.beacon)),
          )
        }
        this.bootstrapFinder.set(nodeId, roots)
        const votes = Array.from(this.bootstrapFinder.entries()).filter(
          (el) => el[1] instanceof Array,
        )
          this.logger.extend('BOOTSTRAP')(`currently have ${votes.length} votes for bootstrap candidates`)
        if (votes.length >= MIN_BOOTSTRAP_VOTES) {
          // If we have enough votes, determine target bootstrap
          const tally = new Map<string, number>()
          // Turn votes into a list of roots to tally up the total votes for each root
          const roots = Array.from(this.bootstrapFinder.values()).flat() as string[]
          for (const root of roots) {
            const count = tally.get(root)
            if (count !== undefined) {
              tally.set(root, count + 1)
            } else {
              tally.set(root, 1)
            }
          }
          // Sort the roots by the number of votes for each root
          const results = Array.from(tally.entries()).sort((a, b) => a[1] - b[1])

          for (let x = 0; x < votes.length; x++) {
            // If we go through all of the possible checkpoint roots that receive a simple majority
            // vote by the polled nodes, stop looking and clear out votes.
            if (results[x][1] < Math.floor(MIN_BOOTSTRAP_VOTES / 2 + 1)) break
            const bootstrapKey = getBeaconContentKey(
              BeaconLightClientNetworkContentType.LightClientBootstrap,
              LightClientBootstrapKey.serialize({ blockHash: hexToBytes(results[x][0]) }),
            )

            for (const vote of votes) {
              const res = await this.sendFindContent(vote[0], hexToBytes(bootstrapKey))
              if (res !== undefined) {
                try {
                  const fork = this.beaconConfig.forkDigest2ForkName(
                    (res.value as Uint8Array).slice(0, 4),
                  )
                  // Verify bootstrap is valid
                  ;(ssz as any)[fork].LightClientBootstrap.deserialize(
                    res.value as Uint8Array,
                  ).slice(4)
                  this.logger.extend('BOOTSTRAP')(`Found a valid bootstrap - ${results[x][0]}`)
                  await this.store(
                    BeaconLightClientNetworkContentType.LightClientBootstrap,
                    bootstrapKey,
                    res.value as Uint8Array,
                  )
                  this.portal.removeListener('NodeAdded', this.getBootStrapVote)
                  this.logger.extend('BOOTSTRAP')(`Terminating Light Client bootstrap process`)
                  return
                } catch {
                  continue
                }
              }
            }
          }
          // If we get here, we didn't find a bootstrap that received a vote from a plurality
          // of nodes so purge their votes and start over
          for (const peer of this.bootstrapFinder.keys()) {
            this.bootstrapFinder.set(peer, {})
          }
        }
      }
    }
  }

  /**
   * Initializes a Lodestar light client using a trusted beacon block root
   * @param blockRoot trusted beacon block root within the weak subjectivity period for retrieving
   * the `lightClientBootStrap`
   */
  public initializeLightClient = async (blockRoot: string) => {
    // Setup the Lodestar light client logger using our debug logger
    const lcLogger = this.logger.extend('LightClient')

    const lcLoggerError = lcLogger.extend('ERROR')
    const lcLoggerWarn = lcLogger.extend('WARN')
    const lcLoggerInfo = lcLogger.extend('INFO')
    const lcLoggerDebug = lcLogger.extend('DEBUG')

    // This call instantiates a Lodestar light client that will sync the Beacon Chain using the light client sync process
    this.lightClient = await Lightclient.initializeFromCheckpointRoot({
      config: this.beaconConfig,
      genesisData: genesisData.mainnet,
      transport: new UltralightTransport(this),
      checkpointRoot: hexToBytes(blockRoot),
      logger: {
        error: (msg, context, error) => {
          msg && lcLoggerError(msg)
          context && lcLoggerError(context)
          error && lcLoggerError(error)
        },
        warn: (msg, context) => {
          msg && lcLoggerWarn(msg)
          context && lcLoggerWarn(context)
        },
        info: (msg, context) => {
          msg && lcLoggerInfo(msg)
          context && lcLoggerInfo(context)
        },
        debug: (msg, context) => {
          msg && lcLoggerDebug(msg)
          context && lcLoggerDebug(context)
        },
      },
    })
  }

  public findContentLocally = async (contentKey: Uint8Array): Promise<Uint8Array | undefined> => {
    let value
    let key
    switch (contentKey[0]) {
      case BeaconLightClientNetworkContentType.LightClientUpdatesByRange:
        try {
          value = await this.constructLightClientRange(contentKey.slice(1))
        } catch {
          // We catch here in case we don't have all of the updates requested by the range
          // in which case we shouldn't return any content
          value = new Uint8Array()
        }
        break
      case BeaconLightClientNetworkContentType.LightClientOptimisticUpdate:
        key = LightClientOptimisticUpdateKey.deserialize(contentKey.slice(1))
        if (
          this.lightClient !== undefined &&
          key.optimisticSlot === BigInt(this.lightClient.getHead().beacon.slot)
        ) {
          // We only store the most recent optimistic update so only retrieve the optimistic update if the slot
          // in the key matches the current head known to our light client
          value = await this.retrieve(
            intToHex(BeaconLightClientNetworkContentType.LightClientOptimisticUpdate),
          )
        } else if (this.lightClient === undefined) {
          // If the light client isn't initialized, we just blindly store and retrieve the optimistic update we have
          value = await this.retrieve(
            intToHex(BeaconLightClientNetworkContentType.LightClientOptimisticUpdate),
          )
        }
        break
      case BeaconLightClientNetworkContentType.LightClientFinalityUpdate:
        key = LightClientFinalityUpdateKey.deserialize(contentKey.slice(1))
        if (
          this.lightClient !== undefined &&
          key.finalizedSlot === BigInt(this.lightClient.getFinalized().beacon.slot)
        ) {
          // We only store the most recent finality update so only retrieve the optimistic update if the slot
          // in the key matches the current finalized slot known to our light client
          value = await this.retrieve(
            intToHex(BeaconLightClientNetworkContentType.LightClientFinalityUpdate),
          )
        } else if (this.lightClient === undefined) {
          // If the light client isn't initialized, we just blindly store and retrieve the optimistic update we have
          value = await this.retrieve(
            intToHex(BeaconLightClientNetworkContentType.LightClientFinalityUpdate),
          )
        }

        break
      default:
        value = await this.retrieve(toHexString(contentKey))
    }

    return value instanceof Uint8Array ? value : hexToBytes(value ?? '0x')
  }

  public sendFindContent = async (
    dstId: string,
    key: Uint8Array,
  ): Promise<Union<Uint8Array | Uint8Array[]> | undefined> => {
    const enr = this.routingTable.getValue(dstId)
    if (!enr) {
      this.logger(`No ENR found for ${shortId(dstId)}.  FINDCONTENT aborted.`)
      return
    }
    this.metrics?.findContentMessagesSent.inc()
    const findContentMsg: FindContentMessage = { contentKey: key }
    const payload = PortalWireMessageType.serialize({
      selector: MessageCodes.FINDCONTENT,
      value: findContentMsg,
    })
    const res = await this.sendMessage(enr, payload, this.protocolId)
    if (res.length === 0) {
      return undefined
    }

    try {
      if (bytesToInt(res.subarray(0, 1)) === MessageCodes.CONTENT) {
        this.metrics?.contentMessagesReceived.inc()
        this.logger.extend('FOUNDCONTENT')(`Received from ${shortId(dstId)}`)
        let decoded = ContentMessageType.deserialize(res.subarray(1))
        switch (decoded.selector) {
          case FoundContent.UTP: {
            const id = new DataView((decoded.value as Uint8Array).buffer).getUint16(0, false)
            this.logger.extend('FOUNDCONTENT')(`received uTP Connection ID ${id}`)
            decoded = await new Promise((resolve, _reject) => {
              this.handleNewRequest({
                protocolId: this.protocolId,
                contentKeys: [key],
                peerId: dstId,
                connectionId: id,
                requestCode: RequestCode.FINDCONTENT_READ,
                contents: [],
              })
              // TODO: Figure out how to clear this listener
              this.on('ContentAdded', (contentKey, contentType, value) => {
                if (contentKey === toHexString(key)) {
                  resolve({ selector: 0, value: hexToBytes(value) })
                }
              })
            })
            break
          }
          case FoundContent.CONTENT:
            {
              const contentKey = toHexString(key)
              const forkhash = decoded.value.slice(0, 4) as Uint8Array
              const forkname = this.beaconConfig.forkDigest2ForkName(forkhash) as any
              switch (key[0]) {
                case BeaconLightClientNetworkContentType.LightClientOptimisticUpdate:
                  try {
                    // TODO: Figure out how to use Forks type to limit selector in ssz[forkname] below and make typescript happy
                    ;(ssz as any)[forkname].LightClientOptimisticUpdate.deserialize(
                      (decoded.value as Uint8Array).slice(4),
                    )
                  } catch (err) {
                    this.logger(`received invalid content from ${shortId(dstId)}`)
                    break
                  }
                  this.logger(
                    `received LightClientOptimisticUpdate content corresponding to ${contentKey}`,
                  )
                  await this.store(key[0], contentKey, decoded.value as Uint8Array)
                  break
                case BeaconLightClientNetworkContentType.LightClientFinalityUpdate:
                  try {
                    ;(ssz as any)[forkname].LightClientFinalityUpdate.deserialize(
                      (decoded.value as Uint8Array).slice(4),
                    )
                  } catch (err) {
                    this.logger(`received invalid content from ${shortId(dstId)}`)
                    break
                  }
                  this.logger(
                    `received LightClientFinalityUpdate content corresponding to ${contentKey}`,
                  )
                  await this.store(key[0], contentKey, decoded.value as Uint8Array)
                  break
                case BeaconLightClientNetworkContentType.LightClientBootstrap:
                  try {
                    ;(ssz as any)[forkname].LightClientBootstrap.deserialize(
                      (decoded.value as Uint8Array).slice(4),
                    )
                  } catch (err) {
                    this.logger(`received invalid content from ${shortId(dstId)}`)
                    break
                  }
                  this.logger(
                    `received LightClientBootstrap content corresponding to ${contentKey}`,
                  )
                  await this.store(key[0], contentKey, decoded.value as Uint8Array)
                  break
                case BeaconLightClientNetworkContentType.LightClientUpdatesByRange:
                  try {
                    LightClientUpdatesByRange.deserialize((decoded.value as Uint8Array).slice(4))
                  } catch (err) {
                    this.logger(`received invalid content from ${shortId(dstId)}`)
                    break
                  }
                  this.logger(
                    `received LightClientUpdatesByRange content corresponding to ${contentKey}`,
                  )
                  await this.storeUpdateRange(decoded.value as Uint8Array)
                  break

                default:
                  this.logger(`received unexpected content type corresponding to ${contentKey}`)
                  break
              }
            }
            break
          case FoundContent.ENRS:
            // We should never get ENRs for content on the Beacon Light Client Network since all nodes
            // are expected to maintain all of the data (basically just light client updates)
            break
        }
        return decoded
      }
      // TODO Should we do anything other than ignore responses to FINDCONTENT messages that isn't a CONTENT response?
    } catch (err: any) {
      this.logger(`Error sending FINDCONTENT to ${shortId(dstId)} - ${err.message}`)
    }
  }

  protected override handleFindContent = async (
    src: INodeAddress,
    requestId: bigint,
    protocol: Uint8Array,
    decodedContentMessage: FindContentMessage,
  ) => {
    this.metrics?.contentMessagesSent.inc()

    this.logger(
      `Received handleFindContent request for contentKey: ${toHexString(
        decodedContentMessage.contentKey,
      )}`,
    )

    const value = await this.findContentLocally(decodedContentMessage.contentKey)
    if (!value || value.length === 0) {
      this.sendResponse(src, requestId, new Uint8Array())
    } else if (value && value.length < MAX_PACKET_SIZE) {
      this.logger(
        'Found value for requested content ' +
          toHexString(decodedContentMessage.contentKey) +
          ' ' +
          toHexString(value.slice(0, 10)) +
          `...`,
      )
      const payload = ContentMessageType.serialize({
        selector: 1,
        value: value,
      })
      this.logger.extend('CONTENT')(`Sending requested content to ${src.nodeId}`)
      this.sendResponse(
        src,
        requestId,
        concatBytes(Uint8Array.from([MessageCodes.CONTENT]), payload),
      )
    } else {
      this.logger.extend('FOUNDCONTENT')(
        'Found value for requested content.  Larger than 1 packet.  uTP stream needed.',
      )
      const _id = randUint16()
      await this.handleNewRequest({
        protocolId: this.protocolId,
        contentKeys: [decodedContentMessage.contentKey],
        peerId: src.nodeId,
        connectionId: _id,
        requestCode: RequestCode.FOUNDCONTENT_WRITE,
        contents: [value],
      })

      const id = new Uint8Array(2)
      new DataView(id.buffer).setUint16(0, _id, false)
      this.logger.extend('FOUNDCONTENT')(`Sent message with CONNECTION ID: ${_id}.`)
      const payload = ContentMessageType.serialize({ selector: FoundContent.UTP, value: id })
      this.sendResponse(
        src,
        requestId,
        concatBytes(Uint8Array.from([MessageCodes.CONTENT]), payload),
      )
    }
  }

  /**
   * The generalized `store` method used to put data into the DB
   * @param contentType the content type being stored (defined in @link { BeaconLightClientNetworkContentType })
   * @param contentKey the network level content key formatted as a prefixed hex string
   * @param value the Uint8Array corresponding to the SSZ serialized value being stored
   */
  public store = async (
    contentType: BeaconLightClientNetworkContentType,
    contentKey: string,
    value: Uint8Array,
  ): Promise<void> => {
    switch (contentType) {
      case BeaconLightClientNetworkContentType.LightClientUpdatesByRange:
        // We need to call `storeUpdateRange` to ensure we store each individual
        // light client update separately so we can construct any range
        await this.storeUpdateRange(value)
        break
      case BeaconLightClientNetworkContentType.LightClientOptimisticUpdate:
        // We store the optimistic update by the content type rather than key since we only want to have one (the most recent)
        // optimistic update and this ensures we don't accidentally store multiple
        await this.put(
          this.protocolId,
          intToHex(BeaconLightClientNetworkContentType.LightClientOptimisticUpdate),
          toHexString(value),
        )
        break
      case BeaconLightClientNetworkContentType.LightClientFinalityUpdate:
        // We store the optimistic update by the content type rather than key since we only want to have one (the most recent)
        // finality update and this ensures we don't accidentally store multiple
        await this.put(
          this.protocolId,
          intToHex(BeaconLightClientNetworkContentType.LightClientFinalityUpdate),
          toHexString(value),
        )
        break
      default:
        await this.put(this.protocolId, contentKey, toHexString(value))
    }

    this.logger(
      `storing ${BeaconLightClientNetworkContentType[contentType]} content corresponding to ${contentKey}`,
    )
    this.emit('ContentAdded', contentKey, contentType, toHexString(value))
  }

  /**
   * Specialized store method for the LightClientUpdatesByRange object since this object is not stored
   * directly in the DB but constructed from one or more Light Client Updates which are stored directly
   * @param range - an SSZ serialized LightClientUpdatesByRange object as defined in the Portal Network Specs
   */
  public storeUpdateRange = async (range: Uint8Array) => {
    const deserializedRange = LightClientUpdatesByRange.deserialize(range)
    for (const update of deserializedRange) {
      await this.store(
        BeaconLightClientNetworkContentType.LightClientUpdate,
        this.computeLightClientUpdateKey(update),
        update,
      )
    }
  }

  // TODO: Move this to util and detach from the protocol
  /**
   * This is a helper method for computing the key used to store individual LightClientUpdates in the DB
   * @param update An ssz serialized LightClientUpdate as a Uint8Array for a given sync period
   * or the number corresponding to the sync period update desired
   * @returns the hex prefixed string version of the Light Client Update storage key
   * (0x04 + hexidecimal representation of the sync committee period)
   */
  public computeLightClientUpdateKey = (input: Uint8Array | number) => {
    let period
    if (typeof input === 'number') {
      period = input
    } else {
      const forkhash = input.slice(0, 4) as Uint8Array
      const forkname = this.beaconConfig.forkDigest2ForkName(forkhash) as any
      //@ts-ignore - typescript won't let me set `forkname` to a value from of the Forks type
      const deserializedUpdate = ssz[forkname].LightClientUpdate.deserialize(
        input.slice(4),
      ) as LightClientUpdate
      period = computeSyncPeriodAtSlot(deserializedUpdate.attestedHeader.beacon.slot)
    }
    return (
      '0x0' + BeaconLightClientNetworkContentType.LightClientUpdate + padToEven(period.toString(16))
    )
  }

  /**
   * Internal helper called by `findContentLocally` to construct the LightClientUpdatesByRange object as defined in the
   * Portal Network Specs
   * @param contentKey a raw LightClientUpdatesByRange key as defined in the Portal Network Specs (not the content key prefixed with
   * the content type of 1)
   * @returns an SSZ serialized LightClientUpdatesByRange object as a Uint8Array
   */
  private constructLightClientRange = async (contentKey: Uint8Array) => {
    const rangeKey = LightClientUpdatesByRangeKey.deserialize(contentKey)

    if (rangeKey.count > 128n) {
      throw new Error('cannot request more than 128 updates')
    }
    const count = Number(rangeKey.count)
    const start = Number(rangeKey.startPeriod)
    const range = []
    for (let x = start; x < start + count; x++) {
      const update = await this.retrieve(this.computeLightClientUpdateKey(x))
      if (update === undefined) {
        // TODO: Decide what to do about updates not found in DB
        throw new Error('update not found in DB')
      }
      range.push(hexToBytes(update))
    }
    return LightClientUpdatesByRange.serialize(range)
  }

  /**
   * Offers content corresponding to `contentKeys` to peer corresponding to `dstId`
   * @param dstId node ID of a peer
   * @param contentKeys content keys being offered as specified by the subprotocol
   */
  public override sendOffer = async (dstId: string, contentKeys: Uint8Array[]) => {
    if (contentKeys.length > 0) {
      this.metrics?.offerMessagesSent.inc()
      const offerMsg: OfferMessage = {
        contentKeys,
      }
      const payload = PortalWireMessageType.serialize({
        selector: MessageCodes.OFFER,
        value: offerMsg,
      })
      const enr = this.routingTable.getWithPending(dstId)?.value
      if (!enr) {
        this.logger(`No ENR found for ${shortId(dstId)}. OFFER aborted.`)
        return
      }
      this.logger.extend(`OFFER`)(
        `Sent to ${shortId(dstId)} with ${contentKeys.length} pieces of content`,
      )
      const res = await this.sendMessage(enr, payload, this.protocolId)
      this.logger.extend(`OFFER`)(`Response from ${shortId(dstId)}`)
      if (res.length > 0) {
        try {
          const decoded = PortalWireMessageType.deserialize(res)
          if (decoded.selector === MessageCodes.ACCEPT) {
            this.metrics?.acceptMessagesReceived.inc()
            const msg = decoded.value as AcceptMessage
            const id = new DataView(msg.connectionId.buffer).getUint16(0, false)
            // Initiate uTP streams with serving of requested content
            const requestedKeys: Uint8Array[] = contentKeys.filter(
              (n, idx) => msg.contentKeys.get(idx) === true,
            )
            if (requestedKeys.length === 0) {
              // Don't start uTP stream if no content ACCEPTed
              this.logger.extend('ACCEPT')(`No content ACCEPTed by ${shortId(dstId)}`)
              return []
            }
            this.logger.extend(`OFFER`)(`ACCEPT message received with uTP id: ${id}`)

            const requestedData: Uint8Array[] = []
            for await (const key of requestedKeys) {
              let value = Uint8Array.from([])
              try {
                // We use `findContentLocally` instead of `get` so the content keys for
                // optimistic and finality updates are handled correctly
                value = (await this.findContentLocally(key)) as Uint8Array
                requestedData.push(value)
              } catch (err: any) {
                this.logger(`Error retrieving content -- ${err.toString()}`)
                requestedData.push(value)
              }
            }

            const contents = encodeWithVariantPrefix(requestedData)
            await this.handleNewRequest({
              protocolId: this.protocolId,
              contentKeys: requestedKeys,
              peerId: dstId,
              connectionId: id,
              requestCode: RequestCode.OFFER_WRITE,
              contents: [contents],
            })

            return msg.contentKeys
          }
        } catch (err: any) {
          this.logger(`Error sending to ${shortId(dstId)} - ${err.message}`)
        }
      }
    }
  }

  /**
   * We override the BaseProtocol `handleOffer` since content gossip for the Beacon Light client network
   * assumes that all node have all of hthe
   * @param src OFFERing node's address
   * @param requestId request ID passed in OFFER message
   * @param msg OFFER message containing a list of offered content keys
   */
  override handleOffer = async (src: INodeAddress, requestId: bigint, msg: OfferMessage) => {
    this.logger.extend('OFFER')(
      `Received from ${shortId(src.nodeId)} with ${msg.contentKeys.length} pieces of content.`,
    )
    try {
      if (msg.contentKeys.length > 0) {
        let offerAccepted = false

        const contentIds: boolean[] = Array(msg.contentKeys.length).fill(false)

        for (let x = 0; x < msg.contentKeys.length; x++) {
          const key = msg.contentKeys[x]
          switch (key[0]) {
            case BeaconLightClientNetworkContentType.LightClientBootstrap: {
              try {
                // TODO: Verify the offered bootstrap isn't too old before accepting
                await this.get(ProtocolId.BeaconLightClientNetwork, toHexString(key))
                this.logger.extend('OFFER')(`Already have this content ${msg.contentKeys[x]}`)
              } catch (err) {
                offerAccepted = true
                contentIds[x] = true
                this.logger.extend('OFFER')(
                  `Found some interesting content from ${shortId(src.nodeId)}`,
                )
              }
              break
            }
            case BeaconLightClientNetworkContentType.LightClientFinalityUpdate:
              {
                const slot = LightClientFinalityUpdateKey.deserialize(key.slice(1)).finalizedSlot
                if (
                  this.lightClient !== undefined &&
                  slot > this.lightClient.getFinalized().beacon.slot
                ) {
                  offerAccepted = true
                  contentIds[x] = true
                  this.logger.extend('OFFER')(
                    `Found a newer Finalized Update from ${shortId(
                      src.nodeId,
                    )} corresponding to slot ${slot}`,
                  )
                }
              }
              break
            case BeaconLightClientNetworkContentType.LightClientOptimisticUpdate:
              {
                const slot = LightClientOptimisticUpdateKey.deserialize(key.slice(1)).optimisticSlot
                if (
                  this.lightClient !== undefined &&
                  slot > this.lightClient.getHead().beacon.slot
                ) {
                  offerAccepted = true
                  contentIds[x] = true
                  this.logger.extend('OFFER')(
                    `Found a newer Optimstic Update from ${shortId(
                      src.nodeId,
                    )} corresponding to slot ${slot}`,
                  )
                }
              }
              break
            case BeaconLightClientNetworkContentType.LightClientUpdatesByRange: {
              // TODO: See if any of the updates in the range are missing and either ACCEPT or send FINDCONTENT for the missing range
              break
            }
          }
        }
        if (offerAccepted) {
          this.logger(`Accepting an OFFER`)
          const desiredKeys = msg.contentKeys.filter((k, i) => contentIds[i] === true)
          this.logger(toHexString(msg.contentKeys[0]))
          this.sendAccept(src, requestId, contentIds, desiredKeys)
        } else {
          this.logger(`Declining an OFFER since no interesting content`)
          this.sendResponse(src, requestId, new Uint8Array())
        }
      } else {
        this.logger(`Offer Message Has No Content`)
        // Send empty response if something goes wrong parsing content keys
        this.sendResponse(src, requestId, new Uint8Array())
      }
    } catch {
      this.logger(`Error Processing OFFER msg`)
    }
  }
}
