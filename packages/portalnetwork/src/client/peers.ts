import type { ENR } from '@chainsafe/enr'
import type { IClientInfo, NetworkId } from '../index.js'
import type { Multiaddr } from '@multiformats/multiaddr'

export type PeerScore = {
  errors: number
}

export class ScoredPeer {
  nodeId: string
  nodeAddress?: Multiaddr
  clientInfo?: IClientInfo
  enr?: ENR
  capabilities: Set<number>
  networks: Map<
    NetworkId,
    {
      radius: bigint
    }
  >
  score: PeerScore

  constructor({
    nodeId,
    nodeAddress,
    clientInfo,
    enr,
    networks,
    capabilities,
    score,
  }: {
    nodeId: string
    nodeAddress?: Multiaddr
    enr?: ENR
    clientInfo?: IClientInfo
    networks?: Map<
      NetworkId,
      {
        radius?: bigint
      }
    >
    capabilities?: Set<number>
    score?: PeerScore
    ignored?: boolean
    banned?: boolean
  }) {
    this.nodeId = nodeId
    this.nodeAddress = nodeAddress
    this.enr = enr
    this.clientInfo = clientInfo
    this.networks = networks ?? new Map()
    this.capabilities = capabilities ?? new Set()
    this.score = score ?? { errors: 0 }
  }
}

export function createPeerFromENR(enr: ENR) {
  return new ScoredPeer({
    nodeId: enr.nodeId,
    nodeAddress: enr.getLocationMultiaddr('udp')!,
    enr,
  })
}
