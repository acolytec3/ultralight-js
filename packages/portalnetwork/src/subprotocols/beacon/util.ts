import { BitArray, fromHexString, toHexString } from '@chainsafe/ssz'
import {
  BeaconLightClientNetworkContentType,
  LightClientBootstrapKey,
  LightClientFinalityUpdateKey,
  LightClientOptimisticUpdateKey,
  LightClientUpdatesByRange,
} from './types.js'
import { EPOCHS_PER_SYNC_COMMITTEE_PERIOD, SLOTS_PER_EPOCH } from '@lodestar/params'
import { Epoch, Slot, SyncPeriod } from '@lodestar/types'

export const attestedHeaderFromJson = (data: any) => {
  return {
    slot: BigInt(data.beacon.slot),
    proposerIndex: BigInt(data.beacon.proposer_index),
    parentRoot: fromHexString(data.beacon.parent_root),
    stateRoot: fromHexString(data.beacon.state_root),
    bodyRoot: fromHexString(data.beacon.body_root),
  }
}

export const syncAggregateFromJson = (data: any) => {
  return {
    syncCommitteeBits: new BitArray(
      new Uint8Array(
        Array.from(BigInt(data.sync_committee_bits).toString(2)).map((el) => parseInt(el)),
      ),
      256, //  TODO: Fix this so Bitlength is equal to SYNC_COMMITTEE_SIZE - 512
    ),
    syncCommitteeSignature: fromHexString(data.sync_committee_signature),
  }
}

export const lightClientOptimisticUpdateFromJson = (data: any) => {
  return {
    attestedHeader: attestedHeaderFromJson(data.attested_header),
    syncAggregate: syncAggregateFromJson(data.sync_aggregate),
  }
}

/**
 * Serializes a beacon network content key
 * @param contentType content type as defined by `BeaconNetworkContentType`
 * @param serializedKey the SSZ encoded key corresponding to the `BeaconNetworkContentType`
 * @returns the content key encoded as a hex string
 */
export const getBeaconContentKey = (
  contentType: BeaconLightClientNetworkContentType,
  serializedKey: Uint8Array,
) => {
  const prefix = Buffer.alloc(1, contentType)
  return toHexString(prefix) + toHexString(serializedKey).slice(2)
}

/**
 * Decodes a Beacon Network content key into the SSZ type corresponding to the type of content
 * @param serializedKey the serialized content key for a piece of Beacon Light Client content
 * @returns the decoded key corresponding to the specific type of content
 */
export const decodeBeaconContentKey = (serializedKey: Uint8Array) => {
  const selector = serializedKey[0] as BeaconLightClientNetworkContentType
  const contentKeyBytes = serializedKey.slice(1)
  switch (selector) {
    case BeaconLightClientNetworkContentType.LightClientBootstrap:
      return LightClientBootstrapKey.deserialize(contentKeyBytes)
    case BeaconLightClientNetworkContentType.LightClientOptimisticUpdate:
      return LightClientOptimisticUpdateKey.deserialize(contentKeyBytes)
    case BeaconLightClientNetworkContentType.LightClientFinalityUpdate:
      return LightClientFinalityUpdateKey.deserialize(contentKeyBytes)
    case BeaconLightClientNetworkContentType.LightClientUpdatesByRange:
      return LightClientUpdatesByRange.deserialize(contentKeyBytes)
    default:
      throw new Error(`unknown content type ${selector}`)
  }
}

/******** Borrowed directly from Lodestar **************/
// Copied from here - https://github.com/ChainSafe/lodestar/blob/unstable/packages/light-client/src/utils/clock.ts
// Borrowed from Lodestar since we don't want to have to import all of the Lodestar dependency tree for a few helper functions
// TODO: Remove if we ever decide to fully incorporate the Lodestar light client into our code base
/**
 * Return the epoch number at the given slot.
 */
export function computeEpochAtSlot(slot: Slot): Epoch {
  return Math.floor(slot / SLOTS_PER_EPOCH)
}

/**
 * Return the sync committee period at epoch
 */
export function computeSyncPeriodAtEpoch(epoch: Epoch): SyncPeriod {
  return Math.floor(epoch / EPOCHS_PER_SYNC_COMMITTEE_PERIOD)
}

/**
 * Return the sync committee period at slot
 */
export function computeSyncPeriodAtSlot(slot: Slot): SyncPeriod {
  return computeSyncPeriodAtEpoch(computeEpochAtSlot(slot))
}
/************************ ****************************/
