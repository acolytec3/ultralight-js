import { createFromProtobuf } from '@libp2p/peer-id-factory'
import { multiaddr } from '@multiformats/multiaddr'
import { describe, it, assert, vi } from 'vitest'
import {
  fromHexString,
  PortalNetwork,
  ProtocolId,
  TransportLayer,
  BeaconLightClientNetwork,
  BeaconLightClientNetworkContentType,
  toHexString,
  getBeaconContentKey,
  LightClientBootstrapKey,
  LightClientUpdatesByRange,
  LightClientOptimisticUpdateKey,
} from '../../src/index.js'
import { createRequire } from 'module'

import { SignableENR } from '@chainsafe/discv5'
import { ssz } from '@lodestar/types'

import { ForkName } from '@lodestar/params'
import { concatBytes } from '@ethereumjs/util'

const require = createRequire(import.meta.url)

const privateKeys = [
  '0x0a2700250802122102273097673a2948af93317235d2f02ad9cf3b79a34eeb37720c5f19e09f11783c12250802122102273097673a2948af93317235d2f02ad9cf3b79a34eeb37720c5f19e09f11783c1a2408021220aae0fff4ac28fdcdf14ee8ecb591c7f1bc78651206d86afe16479a63d9cb73bd',
  '0x0a27002508021221039909a8a7e81dbdc867480f0eeb7468189d1e7a1dd7ee8a13ee486c8cbd743764122508021221039909a8a7e81dbdc867480f0eeb7468189d1e7a1dd7ee8a13ee486c8cbd7437641a2408021220c6eb3ae347433e8cfe7a0a195cc17fc8afcd478b9fb74be56d13bccc67813130',
]

const specTestVectors = require('../subprotocols/beacon/specTestVectors.json')

describe('Find Content tests', () => {
  it('should find bootstrap content', async () => {
    const id1 = await createFromProtobuf(fromHexString(privateKeys[0]))
    const enr1 = SignableENR.createFromPeerId(id1)
    const initMa: any = multiaddr(`/ip4/127.0.0.1/udp/3000`)
    enr1.setLocationMultiaddr(initMa)
    const id2 = await createFromProtobuf(fromHexString(privateKeys[1]))
    const enr2 = SignableENR.createFromPeerId(id2)
    const initMa2: any = multiaddr(`/ip4/127.0.0.1/udp/3001`)
    enr2.setLocationMultiaddr(initMa2)
    const node1 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr1,
        bindAddrs: {
          ip4: initMa,
        },
        peerId: id1,
      },
    })
    const node2 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr2,
        bindAddrs: {
          ip4: initMa2,
        },
        peerId: id2,
      },
    })

    await node1.start()
    await node2.start()
    const protocol1 = node1.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    const protocol2 = node2.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    await protocol1!.sendPing(protocol2?.enr!.toENR())
    assert.equal(
      protocol1?.routingTable.getWithPending(
        '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      )?.value.nodeId,
      '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      'node1 added node2 to routing table',
    )

    const bootstrap = specTestVectors.bootstrap['6718368']

    await protocol1.store(
      BeaconLightClientNetworkContentType.LightClientBootstrap,
      bootstrap.content_key,
      fromHexString(bootstrap.content_value),
    )
    await new Promise((resolve) => {
      node2.uTP.on('Stream', async () => {
        const content = await protocol2.findContentLocally(fromHexString(bootstrap.content_key))
        assert.notOk(content === undefined, 'should retrieve content for bootstrap key')
        assert.equal(
          toHexString(content!),
          bootstrap.content_value,
          'retrieved correct content for bootstrap',
        )
        await node1.stop()
        await node2.stop()
        resolve(undefined)
      })
      protocol2.sendFindContent(node1.discv5.enr.nodeId, fromHexString(bootstrap.content_key))
    })
  })
  it('should find optimistic update', async () => {
    const optimisticUpdate = specTestVectors.optimisticUpdate['6718463']
    const id1 = await createFromProtobuf(fromHexString(privateKeys[0]))
    const enr1 = SignableENR.createFromPeerId(id1)
    const initMa: any = multiaddr(`/ip4/127.0.0.1/udp/3002`)
    enr1.setLocationMultiaddr(initMa)
    const id2 = await createFromProtobuf(fromHexString(privateKeys[1]))
    const enr2 = SignableENR.createFromPeerId(id2)
    const initMa2: any = multiaddr(`/ip4/127.0.0.1/udp/3003`)
    enr2.setLocationMultiaddr(initMa2)
    const node1 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr1,
        bindAddrs: {
          ip4: initMa,
        },
        peerId: id1,
      },
    })
    const node2 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr2,
        bindAddrs: {
          ip4: initMa2,
        },
        peerId: id2,
      },
    })

    await node1.start()
    await node2.start()
    const protocol1 = node1.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    const protocol2 = node2.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    await protocol1!.sendPing(protocol2?.enr!.toENR())
    assert.equal(
      protocol1?.routingTable.getWithPending(
        '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      )?.value.nodeId,
      '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      'node1 added node2 to routing table',
    )
    await protocol1.store(
      BeaconLightClientNetworkContentType.LightClientOptimisticUpdate,
      optimisticUpdate.content_key,
      fromHexString(optimisticUpdate.content_value),
    )

    const res = await protocol2.sendFindContent(
      node1.discv5.enr.nodeId,
      fromHexString(optimisticUpdate.content_key),
    )

    assert.equal(
      toHexString(res!.value as Uint8Array),
      optimisticUpdate.content_value,
      'retrieved content for optimistic update from network',
    )
    const content = await protocol2.findContentLocally(fromHexString(optimisticUpdate.content_key))
    assert.notOk(content === undefined, 'should retrieve content for optimistic update key')
    assert.equal(
      toHexString(content!),
      optimisticUpdate.content_value,
      'retrieved correct content for optimistic update from local storage',
    )
    await node1.stop()
    await node2.stop()
  }, 10000)

  it('should find LightClientUpdatesByRange update', async () => {
    const updatesByRange = specTestVectors.updateByRange['6684738']
    const id1 = await createFromProtobuf(fromHexString(privateKeys[0]))
    const enr1 = SignableENR.createFromPeerId(id1)
    const initMa: any = multiaddr(`/ip4/127.0.0.1/udp/3004`)
    enr1.setLocationMultiaddr(initMa)
    const id2 = await createFromProtobuf(fromHexString(privateKeys[1]))
    const enr2 = SignableENR.createFromPeerId(id2)
    const initMa2: any = multiaddr(`/ip4/127.0.0.1/udp/3005`)
    enr2.setLocationMultiaddr(initMa2)
    const node1 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr1,
        bindAddrs: {
          ip4: initMa,
        },
        peerId: id1,
      },
    })
    const node2 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr2,
        bindAddrs: {
          ip4: initMa2,
        },
        peerId: id2,
      },
    })

    await node1.start()
    await node2.start()
    const protocol1 = node1.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    const protocol2 = node2.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    await protocol1!.sendPing(protocol2?.enr!.toENR())
    assert.equal(
      protocol1?.routingTable.getWithPending(
        '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      )?.value.nodeId,
      '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      'node1 added node2 to routing table',
    )
    await protocol1.storeUpdateRange(fromHexString(updatesByRange.content_value))

    const res = await protocol2.sendFindContent(
      node1.discv5.enr.nodeId,
      fromHexString(updatesByRange.content_key),
    )

    assert.equal(
      toHexString(res!.value as Uint8Array),
      updatesByRange.content_value,
      'retrieved content for light client updates by range from network',
    )
    const content = await protocol2.findContentLocally(fromHexString(updatesByRange.content_key))
    assert.notOk(
      content === undefined,
      'should retrieve content for Light Client Update by Range key',
    )
    assert.equal(
      toHexString(content!),
      updatesByRange.content_value,
      'retrieved correct content for Light Client Update by Range from local storage',
    )
    await node1.stop()
    await node2.stop()
  }, 10000)
})

describe('beacon light client sync tests', () => {
  it('should initialize light client', async () => {
    const id1 = await createFromProtobuf(fromHexString(privateKeys[0]))
    const enr1 = SignableENR.createFromPeerId(id1)
    const initMa: any = multiaddr(`/ip4/127.0.0.1/udp/3009`)
    enr1.setLocationMultiaddr(initMa)
    const id2 = await createFromProtobuf(fromHexString(privateKeys[1]))
    const enr2 = SignableENR.createFromPeerId(id2)
    const initMa2: any = multiaddr(`/ip4/127.0.0.1/udp/3010`)
    enr2.setLocationMultiaddr(initMa2)
    const node1 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr1,
        bindAddrs: {
          ip4: initMa,
        },
        peerId: id1,
      },
    })
    const node2 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr2,
        bindAddrs: {
          ip4: initMa2,
        },
        peerId: id2,
      },
    })

    await node1.start()
    await node2.start()
    const protocol1 = node1.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    const protocol2 = node2.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    await protocol1!.sendPing(protocol2?.enr!.toENR())
    assert.equal(
      protocol1?.routingTable.getWithPending(
        '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      )?.value.nodeId,
      '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      'node1 added node2 to routing table',
    )

    const bootstrap = specTestVectors.bootstrap['6718368']

    await protocol1.store(
      BeaconLightClientNetworkContentType.LightClientBootstrap,
      bootstrap.content_key,
      fromHexString(bootstrap.content_value),
    )

    await protocol2.initializeLightClient(
      '0xbd9f42d9a42d972bdaf4dee84e5b419dd432b52867258acb7bcc7f567b6e3af1',
    )
    assert.equal(protocol2.lightClient?.status, 0, 'light client is initialized but not started')
  })
  it.only('should start syncing the lightclient', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(1693431998000)
    const id1 = await createFromProtobuf(fromHexString(privateKeys[0]))
    const enr1 = SignableENR.createFromPeerId(id1)
    const initMa: any = multiaddr(`/ip4/127.0.0.1/udp/3009`)
    enr1.setLocationMultiaddr(initMa)
    const id2 = await createFromProtobuf(fromHexString(privateKeys[1]))
    const enr2 = SignableENR.createFromPeerId(id2)
    const initMa2: any = multiaddr(`/ip4/127.0.0.1/udp/3010`)
    enr2.setLocationMultiaddr(initMa2)
    const node1 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr1,
        bindAddrs: {
          ip4: initMa,
        },
        peerId: id1,
      },
    })
    const node2 = await PortalNetwork.create({
      transport: TransportLayer.NODE,
      supportedProtocols: [ProtocolId.BeaconLightClientNetwork],
      config: {
        enr: enr2,
        bindAddrs: {
          ip4: initMa2,
        },
        peerId: id2,
      },
    })

    node1.enableLog('*:Portal:*')
    node2.enableLog('*:Portal:*')

    await node1.start()
    await node2.start()
    const protocol1 = node1.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    const protocol2 = node2.protocols.get(
      ProtocolId.BeaconLightClientNetwork,
    ) as BeaconLightClientNetwork
    await protocol1!.sendPing(protocol2?.enr!.toENR())
    assert.equal(
      protocol1?.routingTable.getWithPending(
        '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      )?.value.nodeId,
      '8a47012e91f7e797f682afeeab374fa3b3186c82de848dc44195b4251154a2ed',
      'node1 added node2 to routing table',
    )

    const bootstrapJSON = require('./testdata/bootstrap.json').data
    const bootstrap = ssz.capella.LightClientBootstrap.fromJson(bootstrapJSON)
    const range = require('./testdata/lcUpdateRange.json')
    const capellaForkDigest = protocol1.beaconConfig.forkName2ForkDigest(ForkName.capella)
    const update1 = concatBytes(
      capellaForkDigest,
      ssz.capella.LightClientUpdate.serialize(
        ssz.capella.LightClientUpdate.fromJson(range[0].data),
      ),
    )
    const update2 = concatBytes(
      capellaForkDigest,
      ssz.capella.LightClientUpdate.serialize(
        ssz.capella.LightClientUpdate.fromJson(range[1].data),
      ),
    )
    const update3 = concatBytes(
      capellaForkDigest,
      ssz.capella.LightClientUpdate.serialize(
        ssz.capella.LightClientUpdate.fromJson(range[2].data),
      ),
    )

    const optimisticUpdateJson = require('./testdata/optimisticUpdate.json')
    const optimisticUpdate = ssz.capella.LightClientOptimisticUpdate.fromJson(optimisticUpdateJson)

    await protocol1.store(
      BeaconLightClientNetworkContentType.LightClientBootstrap,
      getBeaconContentKey(
        BeaconLightClientNetworkContentType.LightClientBootstrap,
        LightClientBootstrapKey.serialize({
          blockHash: ssz.phase0.BeaconBlockHeader.hashTreeRoot(bootstrap.header.beacon),
        }),
      ),
      concatBytes(capellaForkDigest, ssz.capella.LightClientBootstrap.serialize(bootstrap)),
    )

    const updatesByRange = LightClientUpdatesByRange.serialize([update1, update2, update3])

    await protocol1.storeUpdateRange(updatesByRange)

    await protocol1.store(
      BeaconLightClientNetworkContentType.LightClientOptimisticUpdate,
      getBeaconContentKey(
        BeaconLightClientNetworkContentType.LightClientOptimisticUpdate,
        LightClientOptimisticUpdateKey.serialize({ zero: 0n }),
      ),
      concatBytes(
        capellaForkDigest,
        ssz.capella.LightClientOptimisticUpdate.serialize(optimisticUpdate),
      ),
    )

    await protocol2.initializeLightClient(
      '0x3e733d7db0b70c17a00c125da9cce68cbdb8135c4400afedd88c17f11a3e3b7b',
    )

    protocol2.on('ContentAdded', (contentType, contentKey) =>
      console.log('content!@', contentType, contentKey),
    )
    await protocol2.lightClient?.start()

    while (true) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }, 30000)
})
