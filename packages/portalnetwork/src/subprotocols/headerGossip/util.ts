import { Proof } from '@chainsafe/persistent-merkle-tree'
import { toHexString } from '@chainsafe/ssz'
import { BlockHeader } from '@ethereumjs/block'
import {
  EpochAccumulator,
  EPOCH_SIZE,
  HeaderAccumulator,
  HeaderAccumulatorType,
  HeaderRecordType,
  ProofView,
} from './types'

export const updateAccumulator = (
  serializedAccumulator: Uint8Array,
  newHeader: BlockHeader
): Uint8Array => {
  const accumulator = HeaderAccumulator.deserialize(serializedAccumulator) as HeaderAccumulatorType
  const lastTd =
    accumulator.currentEpoch.length === 0
      ? 0n
      : accumulator.currentEpoch[accumulator.currentEpoch.length - 1].totalDifficulty

  if (accumulator.currentEpoch.length === EPOCH_SIZE) {
    const currentEpochHash = EpochAccumulator.hashTreeRoot(accumulator.currentEpoch)
    accumulator.historicalEpochs.push(currentEpochHash)
    accumulator.currentEpoch = []
  }

  const headerRecord = {
    blockHash: newHeader.hash(),
    totalDifficulty: lastTd + BigInt(newHeader.difficulty.toString(10)),
  }
  accumulator.currentEpoch.push(headerRecord)
  return HeaderAccumulator.serialize(accumulator)
}
export function ViewProof(proof: Proof): ProofView {
  return {
    type: (proof as any).type,
    gIndex: (proof as any).gindex,
    leaf: (proof as any).leaf,
    witness: (proof as any).witness ?? [],
  }
}

export const verifyInclusionProof = (
  proof: Proof,
  accumulator: HeaderRecordType[],
  header: BlockHeader
) => {
  const epochTree = EpochAccumulator.toView(accumulator)
  const reconstructedTree = EpochAccumulator.createFromProof(proof)
  const leaves = EpochAccumulator.tree_getLeafGindices(0n, reconstructedTree.node)
  const _proof: ProofView = ViewProof(proof)
  const gindex = leaves.indexOf(_proof.gIndex)
  try {
    const value = reconstructedTree.get(gindex - 1)
    if (
      toHexString(value.blockHash) === toHexString(header.hash()) &&
      toHexString(epochTree.hashTreeRoot()) === toHexString(reconstructedTree.hashTreeRoot())
    ) {
      return true
    }
  } catch {}

  return false
}
