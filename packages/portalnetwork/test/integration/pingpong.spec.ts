import { SignableENR } from '@chainsafe/enr'
import { keys } from '@libp2p/crypto'
import { multiaddr } from '@multiformats/multiaddr'
import { hexToBytes } from 'ethereum-cryptography/utils'
import { assert, describe, it } from 'vitest'
import type { HistoryNetwork, INodeAddress } from '../../src'
import {
  ClientInfoAndCapabilities,
  HistoryRadius,
  NetworkId,
  PingPongPayloadExtensions,
  PortalNetwork,
  PortalWireMessageType,
  TransportLayer,
} from '../../src/index.js'

const privateKeys = [
    '0x0a2700250802122102273097673a2948af93317235d2f02ad9cf3b79a34eeb37720c5f19e09f11783c12250802122102273097673a2948af93317235d2f02ad9cf3b79a34eeb37720c5f19e09f11783c1a2408021220aae0fff4ac28fdcdf14ee8ecb591c7f1bc78651206d86afe16479a63d9cb73bd',
    '0x0a27002508021221039909a8a7e81dbdc867480f0eeb7468189d1e7a1dd7ee8a13ee486c8cbd743764122508021221039909a8a7e81dbdc867480f0eeb7468189d1e7a1dd7ee8a13ee486c8cbd7437641a2408021220c6eb3ae347433e8cfe7a0a195cc17fc8afcd478b9fb74be56d13bccc67813130',
  ]

const pk1 = keys.privateKeyFromProtobuf(hexToBytes(privateKeys[0]).slice(-36))
const enr1 = SignableENR.createFromPrivateKey(pk1)
const pk2 = keys.privateKeyFromProtobuf(hexToBytes(privateKeys[1]).slice(-36))
const enr2 = SignableENR.createFromPrivateKey(pk2)

describe('PING/PONG', async () => {
  const initMa: any = multiaddr(`/ip4/127.0.0.1/udp/3098`)
  enr1.setLocationMultiaddr(initMa)
  const initMa2: any = multiaddr(`/ip4/127.0.0.1/udp/3099`)
  enr2.setLocationMultiaddr(initMa2)
  const node1 = await PortalNetwork.create({
    transport: TransportLayer.NODE,
    supportedNetworks: [{ networkId: NetworkId.HistoryNetwork }],
    config: {
      enr: enr1,
      bindAddrs: {
        ip4: initMa,
      },
      privateKey: pk1,
    },
  })

  const node2 = await PortalNetwork.create({
    transport: TransportLayer.NODE,
    supportedNetworks: [{ networkId: NetworkId.HistoryNetwork }],
    config: {
      enr: enr2,
      bindAddrs: {
        ip4: initMa2,
      },
      privateKey: pk2,
    },
  })

  await node1.start()
  await node2.start()
  const network1 = node1.networks.get(NetworkId.HistoryNetwork) as HistoryNetwork
  const network2 = node2.networks.get(NetworkId.HistoryNetwork) as HistoryNetwork
  it('should exchange type 0 PING/PONG', async () => {
    const pingpong = await network1.sendPing(network2?.enr!.toENR(), 0)
    assert.exists(pingpong, 'should have received a pong')
    assert.equal(pingpong!.payloadType, PingPongPayloadExtensions.CLIENT_INFO_RADIUS_AND_CAPABILITIES)
    const { DataRadius } = ClientInfoAndCapabilities.deserialize(pingpong!.customPayload)
    assert.equal(DataRadius, network2.nodeRadius)
  })
  it('should exchange type 2 PING/PONG', async () => {
    const pingpong = await network1.sendPing(network2?.enr!.toENR(), 2)
    assert.exists(pingpong, 'should have received a pong')
    assert.equal(pingpong!.payloadType, PingPongPayloadExtensions.HISTORY_RADIUS_PAYLOAD)
    const { dataRadius } = HistoryRadius.deserialize(pingpong!.customPayload)
    assert.equal(dataRadius, network2.nodeRadius)
  })
  it('should receive error response from unsupported capability', async () => {
    const peer = node1.enrCache.getPeer(node2.discv5.enr.nodeId)
    peer?.capabilities.add(1)
    const pingpong = await network1.sendPing(network2?.enr!.toENR(), 1)
    assert.exists(pingpong, 'should have received a pong')
    assert.equal(pingpong!.payloadType, PingPongPayloadExtensions.ERROR_RESPONSE)
  })
})
