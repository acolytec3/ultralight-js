import type { ENR } from '@chainsafe/enr'
import { ScoredPeer, createPeerFromENR } from './peers.js'
import type { INodeAddress } from './types'
import type { NetworkId } from '../networks/types'
import type { IClientInfo } from '../wire/payloadExtensions.js'

type NodeId = string

export class ENRCache {
  private peers: Map<NodeId, ScoredPeer>

  constructor({
    peers,
  }: {
    peers?: Map<NodeId, ScoredPeer>
  }) {
    this.peers = peers ?? new Map()
  }

  public getENR(nodeId: NodeId) {
    return this.peers.get(nodeId)?.enr
  }

  public getPeer(nodeId: NodeId) {
    return this.peers.get(nodeId)
  }

  public getPeerCapabilities(nodeId: NodeId) {
    return this.peers.get(nodeId)?.capabilities ?? new Set([0])
  }

  public updateENR(enr: ENR) {
    const peer = this.peers.get(enr.nodeId)
    if (peer === undefined) {
      this.peers.set(enr.nodeId, createPeerFromENR(enr))
    } else {
      peer.enr = enr
    }
  }

  public updateNodeAddress(nodeAddress: INodeAddress) {
    const peer = this.peers.get(nodeAddress.nodeId)
    if (peer === undefined) {
      this.peers.set(nodeAddress.nodeId, new ScoredPeer({
        nodeId: nodeAddress.nodeId,
          nodeAddress: nodeAddress.socketAddr,
        }),
      )
    } else {
      peer.nodeAddress = nodeAddress.socketAddr
    }
  }

  public updateNodeFromPing = (
    nodeAddress: INodeAddress,
    network: NetworkId,
    {
      capabilities,
      clientInfo,
      radius,
    }: {
      radius: bigint
      capabilities?: number[]
      clientInfo?: IClientInfo
    },
  ) => {
    this.updateNodeAddress(nodeAddress)
    const peer = this.peers.get(nodeAddress.nodeId)!
    peer.networks.set(network, { radius })
    if (capabilities !== undefined) {
      for (const capability of capabilities) {
        peer.capabilities.add(capability)
      }
    }
    if (clientInfo !== undefined) {
      peer.clientInfo = clientInfo
    }
  }

  public updateNodeFromPong = (
    enr: ENR,
    network: NetworkId,
    {
      capabilities,
      clientInfo,
      radius,
    }: {
      radius: bigint
      capabilities?: number[]
      clientInfo?: IClientInfo
    },
  ) => {
    this.updateENR(enr)
    const peer = this.peers.get(enr.nodeId)!  
    peer.enr = enr
    peer.networks.set(network, { radius })
    if (capabilities !== undefined) {
      for (const capability of capabilities) {
        peer.capabilities.add(capability)
      }
    }
    if (clientInfo !== undefined) {
      peer.clientInfo = clientInfo
    }
  }





}
