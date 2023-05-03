import { Debugger } from 'debug'
import { BaseProtocol } from '../protocol.js'
import { ProtocolId } from '../types.js'
import { PortalNetwork } from '../../client/client.js'
import debug from 'debug'
import { Union } from '@chainsafe/ssz/lib/interface.js'

export class BeaconLightClientNetwork extends BaseProtocol {
  protocolId: ProtocolId.BeaconLightClientNetwork
  protocolName = 'BeaconLightClientNetwork'
  logger: Debugger
  constructor(client: PortalNetwork, nodeRadius?: bigint) {
    super(client, nodeRadius)
    this.protocolId = ProtocolId.BeaconLightClientNetwork
    this.logger = debug(this.enr.nodeId.slice(0, 5))
      .extend('Portal')
      .extend('BeaconLightClientNetwork')
    this.routingTable.setLogger(this.logger)
  }

  public findContentLocally = (contentKey: Uint8Array): Promise<Uint8Array | undefined> => {
    return Promise.resolve(undefined)
  }

  public sendFindContent = (
    dstId: string,
    key: Uint8Array
  ): Promise<Union<Uint8Array | Uint8Array[]> | undefined> => {
    return Promise.resolve(undefined)
  }

  public store = (contentType: any, hashKey: string, value: Uint8Array): Promise<void> => {
    return Promise.resolve()
  }
}
