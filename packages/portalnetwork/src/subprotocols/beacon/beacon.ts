import { Debugger } from 'debug'
import { BaseProtocol } from '../protocol.js'
import { ProtocolId } from '../types.js'
import { PortalNetwork } from '../../client/client.js'
import debug from 'debug'
import { Union } from '@chainsafe/ssz/lib/interface.js'
import { fromHexString, toHexString } from '@chainsafe/ssz'
import { shortId } from '../../util/util.js'
import { createBeaconConfig, defaultChainConfig, BeaconConfig } from '@lodestar/config'
import {
  MainnetGenesisValidatorsRoot,
  BeaconLightClientNetworkContentType,
  LightClientUpdatesByRange,
  LightClientUpdatesByRangeKey,
} from './types.js'
import {
  ContentMessageType,
  FindContentMessage,
  MessageCodes,
  PortalWireMessageType,
} from '../../wire/types.js'
import { bytesToInt, padToEven } from '@ethereumjs/util'
import { RequestCode, FoundContent } from '../../wire/index.js'
import { ssz } from '@lodestar/types'
import { LightClientUpdate } from '@lodestar/types/lib/allForks/types.js'
import { computeSyncPeriodAtSlot } from './util.js'
export class BeaconLightClientNetwork extends BaseProtocol {
  protocolId: ProtocolId.BeaconLightClientNetwork
  beaconConfig: BeaconConfig
  protocolName = 'BeaconLightClientNetwork'
  logger: Debugger
  constructor(client: PortalNetwork, nodeRadius?: bigint) {
    super(client, nodeRadius)

    const genesisRoot = fromHexString(MainnetGenesisValidatorsRoot)
    this.beaconConfig = createBeaconConfig(defaultChainConfig, genesisRoot)
    this.protocolId = ProtocolId.BeaconLightClientNetwork
    this.logger = debug(this.enr.nodeId.slice(0, 5))
      .extend('Portal')
      .extend('BeaconLightClientNetwork')
    this.routingTable.setLogger(this.logger)
  }

  public findContentLocally = async (contentKey: Uint8Array): Promise<Uint8Array | undefined> => {
    let value
    if (contentKey[0] === BeaconLightClientNetworkContentType.LightClientUpdatesByRange) {
      value = await this.constructLightClientRange(contentKey.slice(1))
    } else {
      value = fromHexString((await this.retrieve(toHexString(contentKey))) ?? '0x')
    }
    return value
  }

  public async retrieve(contentKey: string): Promise<string | undefined> {
    try {
      const content = await this.get(this.protocolId, contentKey)
      return content
    } catch {
      this.logger('Error retrieving content from DB')
    }
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
            decoded = await new Promise((resolve, reject) => {
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
                  resolve({ selector: 0, value: fromHexString(value) })
                }
              })
            })
            break
          }
          case FoundContent.CONTENT: {
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
                  `received ${
                    BeaconLightClientNetworkContentType[decoded.selector]
                  } content corresponding to ${contentKey}`,
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
                  `received ${
                    BeaconLightClientNetworkContentType[decoded.selector]
                  } content corresponding to ${contentKey}`,
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
                  `received ${
                    BeaconLightClientNetworkContentType[decoded.selector]
                  } content corresponding to ${contentKey}`,
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
                  `received ${
                    BeaconLightClientNetworkContentType[decoded.selector]
                  } content corresponding to ${contentKey}`,
                )
                await this.storeUpdateRange(decoded.value as Uint8Array)
                break

              default:
                this.logger(
                  `received ${
                    BeaconLightClientNetworkContentType[decoded.selector]
                  } content corresponding to ${contentKey}`,
                )
                break
            }
          }
        }
        return decoded
      }
      // TODO Should we do anything other than ignore responses to FINDCONTENT messages that isn't a CONTENT response?
    } catch (err: any) {
      this.logger(`Error sending FINDCONTENT to ${shortId(dstId)} - ${err.message}`)
    }
  }

  public store = async (
    contentType: BeaconLightClientNetworkContentType,
    contentKey: string,
    value: Uint8Array,
  ): Promise<void> => {
    if (contentType === BeaconLightClientNetworkContentType.LightClientUpdatesByRange) {
      await this.storeUpdateRange(value)
    }
    this.logger(
      `storing ${BeaconLightClientNetworkContentType[contentType]} content corresponding to ${contentKey}`,
    )
    await this.put(this.protocolId, contentKey, toHexString(value))
    this.emit('ContentAdded', contentKey, contentType, toHexString(value))
  }

  /**
   * Specialized store method for the LightClientUpdatesByRange object since this object is not stored
   * directly in the DB but constructed from one or more Light Client Updates which are stored directly
   * @param range an SSZ serialized LightClientUpdatesByRange object as defined in the Portal Network Specs
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

  /**
   *
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
   * @param contentKey a raw LightClientUpdatesByRange key as defined in the Portal Network Specs (not the content key equivalent)
   * @returns an SSZ serialized LightClientUpdatesByRange object as a Uint8Array
   */
  private constructLightClientRange = async (contentKey: Uint8Array) => {
    const rangeKey = LightClientUpdatesByRangeKey.deserialize(contentKey)

    if (rangeKey.count > 128) {
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
      range.push(fromHexString(update))
    }
    return LightClientUpdatesByRange.serialize(range)
  }
}
