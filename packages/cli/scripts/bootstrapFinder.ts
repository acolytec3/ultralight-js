import jayson from 'jayson/promise/index.js'

import { createBeaconConfig, defaultChainConfig, BeaconConfig } from '@lodestar/config'
import { genesisData } from '@lodestar/config/networks'
import { BeaconLightClientNetworkContentType, fromHexString, getBeaconContentKey, LightClientBootstrapKey, LightClientOptimisticUpdateKey, LightClientUpdatesByRange, LightClientUpdatesByRangeKey, ProtocolId, toHexString } from 'portalnetwork'

import { ssz } from '@lodestar/types'
import { ForkName } from '@lodestar/params'
import { computeSyncPeriodAtSlot } from '@lodestar/light-client/utils'
import { concatBytes, hexToBytes } from '@ethereumjs/util'


const { Client } = jayson

const main = async () => {
    const beaconConfig = createBeaconConfig(defaultChainConfig, hexToBytes(genesisData.mainnet.genesisValidatorsRoot))
    const capellaForkDigest = beaconConfig.forkName2ForkDigest(ForkName.capella)
    const beaconNode = 'https://lodestar-mainnet.chainsafe.io/'
    const ultralights: jayson.HttpClient[] = []
    for (let x = 0; x < 10; x++) {
        ultralights.push(Client.http({ host: '127.0.0.1', port: 8545 + x }))
    }


    console.log('Retrieving bootstrap and updates from Beacon node...')
    let optimisticUpdate = ssz.capella.LightClientOptimisticUpdate.fromJson((await (await fetch(beaconNode + 'eth/v1/beacon/light_client/optimistic_update')).json()).data)
    let optimisticUpdateKey = getBeaconContentKey(BeaconLightClientNetworkContentType.LightClientOptimisticUpdate, LightClientOptimisticUpdateKey.serialize({ optimisticSlot: BigInt(optimisticUpdate.attestedHeader.beacon.slot) }))
    const currentPeriod = computeSyncPeriodAtSlot(optimisticUpdate.signatureSlot)
    const oldPeriod = (currentPeriod - 3)
    const updatesByRange = (await (await fetch(beaconNode + `eth/v1/beacon/light_client/updates?start_period=${oldPeriod}&count=4`)).json())

    const range: Uint8Array[] = []
    for (const update of updatesByRange) {
        range.push(concatBytes(
            capellaForkDigest,
            ssz.capella.LightClientUpdate.serialize(
                ssz.capella.LightClientUpdate.fromJson(update.data),
            ),
        ))
    }
    const serializedRange = LightClientUpdatesByRange.serialize(range)
    const rangeKey = getBeaconContentKey(BeaconLightClientNetworkContentType.LightClientUpdatesByRange, LightClientUpdatesByRangeKey.serialize({ startPeriod: BigInt(oldPeriod), count: 6n }))
    for (let x = 0; x < 4; x++) {
        const bootstrapSlot = updatesByRange[x].data.finalized_header.beacon.slot
        const bootstrapRoot = (await (await fetch(beaconNode + `eth/v1/beacon/blocks/${bootstrapSlot}/root`)).json()).data.root
        const bootstrap = ssz.capella.LightClientBootstrap.fromJson((await (await fetch(beaconNode + `eth/v1/beacon/light_client/bootstrap/${bootstrapRoot}`)).json()).data)
        await ultralights[Math.floor(Math.random() * 5)].request('portal_beaconStore', [getBeaconContentKey(BeaconLightClientNetworkContentType.LightClientBootstrap, LightClientBootstrapKey.serialize({ blockHash: hexToBytes(bootstrapRoot) })), toHexString(concatBytes(capellaForkDigest, ssz.capella.LightClientBootstrap.serialize(bootstrap)))])
        console.log(`Retrieved bootstrap for finalized checkpoint ${bootstrapRoot} from sync period ${oldPeriod + x} and seeding to network...`)
    }

    for (let x = 0; x < 10; x++) {
        await ultralights[x].request('portal_beaconStore', [rangeKey, toHexString(serializedRange)])
    }
    console.log(`Seeded light client updates for range ${oldPeriod}-${oldPeriod + 4} into Portal Network`)

    for (let x = 0; x < 10; x++) {
        const peerEnr = await ultralights[x].request('discv5_nodeInfo', [])
        if (x > 0) {
            for (let y = 0; y < x; y++) {
                const res = await ultralights[x - 1].request('portal_beaconAddBootNode', [peerEnr.result.enr])
                console.log(res)
            }
        }
    }
    const res3 = await ultralights[0].request('portal_beaconStore', [optimisticUpdateKey, toHexString(concatBytes(capellaForkDigest, ssz.capella.LightClientOptimisticUpdate.serialize(optimisticUpdate)))])
    console.log(`Pushed optimistic update for signature slot ${optimisticUpdate.signatureSlot}`, res3)

    process.on('SIGTERM', () => {
        console.log('Caught interrupt signal.  Shuttind down...')
        process.exit(0)
    })
    while (true) {
        await new Promise(resolve => setTimeout(() => resolve(undefined), 13000))
        let optimisticUpdate = ssz.capella.LightClientOptimisticUpdate.fromJson((await (await fetch(beaconNode + 'eth/v1/beacon/light_client/optimistic_update')).json()).data)
        let optimisticUpdateKey = getBeaconContentKey(BeaconLightClientNetworkContentType.LightClientOptimisticUpdate, LightClientOptimisticUpdateKey.serialize({ optimisticSlot: BigInt(optimisticUpdate.attestedHeader.beacon.slot) }))
        const res = await ultralights[0].request('portal_beaconStore', [optimisticUpdateKey, toHexString(concatBytes(capellaForkDigest, ssz.capella.LightClientOptimisticUpdate.serialize(optimisticUpdate)))])
        console.log(`Pushed optimistic update for signature slot ${optimisticUpdate.signatureSlot}`, res)
    }
}

main().catch(err => {
    console.log('caught error', err)
    process.exit(0)
})