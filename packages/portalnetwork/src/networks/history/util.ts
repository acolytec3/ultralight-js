import { digest } from '@chainsafe/as-sha256'
import { ProofType, createProof } from '@chainsafe/persistent-merkle-tree'
import { Block, BlockHeader } from '@ethereumjs/block'
import { RLP as rlp } from '@ethereumjs/rlp'
import { bytesToHex, bytesToUnprefixedHex, equalsBytes, hexToBytes } from '@ethereumjs/util'
import { ssz } from '@lodestar/types'

import { historicalEpochs } from './data/epochHashes.js'
import { historicalRoots } from './data/historicalRoots.js'
import {
  AccumulatorProofType,
  BlockBodyContentType,
  BlockHeaderWithProof,
  BlockNumberKey,
  CAPELLA_ERA,
  EpochAccumulator,
  HistoryNetworkContentType,
  MERGE_BLOCK,
  PostShanghaiBlockBody,
  PreShanghaiBlockBody,
  SSZWithdrawal,
  sszTransactionType,
  sszUnclesType,
} from './types.js'

import type { Proof, SingleProof, SingleProofInput } from '@chainsafe/persistent-merkle-tree'
import type {
  ByteVectorType,
  ListCompositeType,
  UintBigintType,
  ValueOfFields,
  VectorCompositeType,
} from '@chainsafe/ssz'
import type {
  BlockBytes,
  BlockHeaderBytes,
  TransactionsBytes,
  UncleHeadersBytes,
} from '@ethereumjs/block'
import type { WithdrawalBytes } from '@ethereumjs/util'
import type { ForkConfig } from '@lodestar/config'
import type { HistoryNetwork } from './history.js'
import type { BlockBodyContent, Witnesses } from './types.js'

export const BlockHeaderByNumberKey = (blockNumber: bigint) => {
  return Uint8Array.from([
    HistoryNetworkContentType.BlockHeaderByNumber,
    ...BlockNumberKey.serialize({ blockNumber }),
  ])
}

/**
 * Generates the serialized contentKey for a given History Network content type and key (i.e. block hash or block number)
 * @param contentType a number identifying the type of content (block header, block body, receipt, header_by_number)
 * @param key the block hash for header, body, or receipt, or block number for header_by_number)
 * @returns the serialized contentKey
 */
export const getContentKey = (
  contentType: HistoryNetworkContentType,
  key: Uint8Array | bigint,
): Uint8Array => {
  let encodedKey
  switch (contentType) {
    case HistoryNetworkContentType.BlockHeader:
    case HistoryNetworkContentType.BlockBody:
    case HistoryNetworkContentType.Receipt:
    case HistoryNetworkContentType.HeaderProof: {
      if (!(key instanceof Uint8Array))
        throw new Error('block hash is required to generate contentId')
      encodedKey = Uint8Array.from([contentType, ...key])
      break
    }
    case HistoryNetworkContentType.BlockHeaderByNumber: {
      if (typeof key !== 'bigint') throw new Error('block number is required to generate contentId')
      encodedKey = BlockHeaderByNumberKey(key)
      break
    }
    default:
      throw new Error('unsupported content type')
  }
  return encodedKey
}

/**
 * Generates the contentId from a serialized History Network Content Key used to calculate the distance between a node ID and the content key
 * @param contentType the type of content (block header, block body, receipt, header_by_number)
 * @param key the hash of the content represented (i.e. block hash for header, body, or receipt, or block number for header_by_number)
 * @returns the hex encoded string representation of the SHA256 hash of the serialized contentKey
 */
export const getContentId = (contentType: HistoryNetworkContentType, key: Uint8Array | bigint) => {
  const encodedKey = getContentKey(contentType, key)
  return bytesToUnprefixedHex(digest(encodedKey))
}

export const decodeHistoryNetworkContentKey = (
  contentKey: Uint8Array,
):
  | {
      contentType:
        | HistoryNetworkContentType.BlockHeader
        | HistoryNetworkContentType.BlockBody
        | HistoryNetworkContentType.Receipt
        | HistoryNetworkContentType.HeaderProof
      keyOpt: Uint8Array
    }
  | {
      contentType: HistoryNetworkContentType.BlockHeaderByNumber
      keyOpt: bigint
    } => {
  const contentType: HistoryNetworkContentType = contentKey[0]
  if (contentType === HistoryNetworkContentType.BlockHeaderByNumber) {
    const blockNumber = BlockNumberKey.deserialize(contentKey.slice(1)).blockNumber
    return {
      contentType,
      keyOpt: blockNumber,
    }
  }
  const blockHash = contentKey.slice(1)
  return {
    contentType,
    keyOpt: blockHash,
  }
}

export const decodeSszBlockBody = (
  sszBody: Uint8Array,
  withdrawals: boolean = false,
): BlockBodyContent => {
  if (withdrawals) {
    const body = PostShanghaiBlockBody.deserialize(sszBody)
    const txsRlp = body.allTransactions.map((sszTx) => sszTransactionType.deserialize(sszTx))
    const unclesRlp = sszUnclesType.deserialize(body.sszUncles)
    const allWithdrawals = body.allWithdrawals.map((sszW) => SSZWithdrawal.deserialize(sszW))
    return {
      txsRlp,
      unclesRlp,
      allWithdrawals,
    }
  } else {
    try {
      const body = BlockBodyContentType.deserialize(sszBody)
      const txsRlp = body.allTransactions.map((sszTx) => sszTransactionType.deserialize(sszTx))
      const unclesRlp = sszUnclesType.deserialize(body.sszUncles)
      return { txsRlp, unclesRlp }
    } catch {
      const body = PostShanghaiBlockBody.deserialize(sszBody)
      const txsRlp = body.allTransactions.map((sszTx) => sszTransactionType.deserialize(sszTx))
      const unclesRlp = sszUnclesType.deserialize(body.sszUncles)
      const allWithdrawals = body.allWithdrawals.map((sszW) => SSZWithdrawal.deserialize(sszW))
      return {
        txsRlp,
        unclesRlp,
        allWithdrawals,
      }
    }
  }
}

export const sszEncodeBlockBody = (block: Block) => {
  const encodedSSZTxs = block.transactions.map((tx) => sszTransactionType.serialize(tx.serialize()))
  const encodedUncles = rlp.encode(block.uncleHeaders.map((uh) => uh.raw()))
  if (block.withdrawals) {
    const encodedWithdrawals = block.withdrawals.map((w) => rlp.encode(w.raw()))
    const sszWithdrawals = encodedWithdrawals.map((w) => SSZWithdrawal.serialize(w))
    return PostShanghaiBlockBody.serialize({
      allTransactions: encodedSSZTxs,
      sszUncles: encodedUncles,
      allWithdrawals: sszWithdrawals,
    })
  } else {
    return PreShanghaiBlockBody.serialize({
      allTransactions: encodedSSZTxs,
      sszUncles: encodedUncles,
    })
  }
}

/**
 * Assembles RLP encoded block headers and bodies from the portal network into a `Block` object
 * @param rawHeader RLP encoded block header as Uint8Array
 * @param rawBody RLP encoded block body consisting of transactions and uncles as nested Uint8Arrays
 * @returns a `Block` object assembled from the header and body provided
 */
export const reassembleBlock = (rawHeader: Uint8Array, rawBody?: Uint8Array) => {
  if (rawBody) {
    const decodedBody = decodeSszBlockBody(rawBody)
    const valuesArray: BlockBytes = [
      rlp.decode(rawHeader) as never as BlockHeaderBytes,
      decodedBody.txsRlp as TransactionsBytes,
      rlp.decode(decodedBody.unclesRlp) as never as UncleHeadersBytes,
    ]
    if ('allWithdrawals' in decodedBody) {
      valuesArray.push(decodedBody.allWithdrawals.map((w) => rlp.decode(w)) as WithdrawalBytes)
    }
    const block = Block.fromValuesArray(valuesArray, { setHardfork: true })
    return block
  } else {
    const header = BlockHeader.fromRLPSerializedHeader(rawHeader, {
      setHardfork: true,
      skipConsensusFormatValidation: false,
    })
    const block = Block.fromBlockData({ header }, { setHardfork: true })
    return block
  }
}

/**
 * Takes an RLP encoded block as a hex string and adds the block header and block body to the `portal` content DB
 * @param rlpHex RLP encoded block as hex string
 * @param blockHash block hash as 0x prefixed hex string
 * @param network a running `PortalNetwork` client
 */
export const addRLPSerializedBlock = async (
  rlpHex: string,
  blockHash: string,
  network: HistoryNetwork,
  witnesses: Witnesses,
) => {
  const block = Block.fromRLPSerializedBlock(hexToBytes(rlpHex), {
    setHardfork: true,
  })
  const header = block.header
  const headerKey = getContentKey(HistoryNetworkContentType.BlockHeader, hexToBytes(blockHash))
  const proof = AccumulatorProofType.serialize(witnesses)
  if (header.number < MERGE_BLOCK) {
    const headerProof = BlockHeaderWithProof.serialize({
      header: header.serialize(),
      proof,
    })
    try {
      await network.validateHeader(headerProof, { blockHash })
    } catch {
      network.logger('Header proof failed validation while loading block from RLP')
    }
    await network.store(headerKey, headerProof)
  } else {
    const headerProof = BlockHeaderWithProof.serialize({
      header: header.serialize(),
      proof,
    })
    await network.indexBlockHash(header.number, bytesToHex(header.hash()))

    await network.store(headerKey, headerProof)
  }
  const sszBlock = sszEncodeBlockBody(block)
  await network.addBlockBody(sszBlock, header.hash(), header.serialize())
}

export const blockNumberToGindex = (blockNumber: bigint): bigint => {
  const j = blockNumber % 8192n
  const gIndex = 2n * j + 32768n
  return gIndex
}

export const epochIndexByBlocknumber = (blockNumber: bigint) => {
  return Math.floor(Number(blockNumber) / 8192)
}
export const blockNumberToLeafIndex = (blockNumber: bigint) => {
  return (Number(blockNumber) % 8192) * 2
}
export const epochRootByIndex = (index: number) => {
  return historicalEpochs[index] ? hexToBytes(historicalEpochs[index]) : undefined
}
export const epochRootByBlocknumber = (blockNumber: bigint) => {
  return epochRootByIndex(epochIndexByBlocknumber(blockNumber))
}

// Returns the index of a slot in a Historical Batch (i.e. an epoch of 8192 beacon block roots/state roots)
export const slotToHistoricalBatchIndex = (slot: bigint) => {
  return slot - (slot / 8192n) * 8192n
}

// Returns the historical batch / era number a slot occurs in
// Note - this returns the zero indexed batch number (since historical_roots is a zero indexed array)
export const slotToHistoricalBatch = (slot: bigint) => {
  return slot / 8192n
}

export const verifyPreMergeHeaderProof = (
  witnesses: Uint8Array[],
  blockHash: string,
  blockNumber: bigint,
): boolean => {
  try {
    const target = epochRootByIndex(epochIndexByBlocknumber(blockNumber))
    const proof: Proof = {
      type: ProofType.single,
      gindex: blockNumberToGindex(blockNumber),
      witnesses,
      leaf: hexToBytes(blockHash),
    }
    EpochAccumulator.createFromProof(proof, target)
    return true
  } catch (_err) {
    return false
  }
}

export const verifyPreCapellaHeaderProof = (
  proof: ValueOfFields<{
    beaconBlockProof: VectorCompositeType<ByteVectorType>
    beaconBlockRoot: ByteVectorType
    historicalRootsProof: VectorCompositeType<ByteVectorType>
    slot: UintBigintType
  }>,
  elBlockHash: Uint8Array,
) => {
  const batchIndex = slotToHistoricalBatchIndex(proof.slot)
  const historicalRootsPath = ssz.phase0.HistoricalBatch.getPathInfo([
    'blockRoots',
    Number(batchIndex),
  ])
  const reconstructedBatch = ssz.phase0.HistoricalBatch.createFromProof({
    witnesses: proof.historicalRootsProof,
    type: ProofType.single,
    gindex: historicalRootsPath.gindex,
    leaf: proof.beaconBlockRoot, // This should be the leaf value this proof is verifying
  })
  if (
    !equalsBytes(
      reconstructedBatch.hashTreeRoot(),
      hexToBytes(historicalRoots[Number(slotToHistoricalBatch(proof.slot))]),
    )
  )
    return false

  const elBlockHashPath = ssz.bellatrix.BeaconBlock.getPathInfo([
    'body',
    'executionPayload',
    'blockHash',
  ])
  const reconstructedBlock = ssz.bellatrix.BeaconBlock.createFromProof({
    witnesses: proof.beaconBlockProof,
    type: ProofType.single,
    gindex: elBlockHashPath.gindex,
    leaf: elBlockHash,
  })

  if (!equalsBytes(reconstructedBlock.hashTreeRoot(), proof.beaconBlockRoot)) return false
  return true
}

export const verifyPostCapellaHeaderProof = (
  proof: ValueOfFields<{
    beaconBlockProof: ListCompositeType<ByteVectorType>
    beaconBlockRoot: ByteVectorType
    historicalSummariesProof: VectorCompositeType<ByteVectorType>
    slot: UintBigintType
  }>,
  elBlockHash: Uint8Array,
  historicalSummaries: { blockSummaryRoot: Uint8Array; stateSummaryRoot: Uint8Array }[],
  chainConfig: ForkConfig,
) => {
  const eraIndex = slotToHistoricalBatchIndex(proof.slot)
  const forkName = chainConfig.getForkName(Number(proof.slot))
  const historicalSummariesPath = ssz[forkName].BeaconState.fields.blockRoots.getPathInfo([
    Number(eraIndex),
  ])
  const reconstructedBatch = ssz[forkName].BeaconState.fields.blockRoots.createFromProof({
    witnesses: proof.historicalSummariesProof,
    type: ProofType.single,
    gindex: historicalSummariesPath.gindex,
    leaf: proof.beaconBlockRoot, // This should be the leaf value this proof is verifying
  })

  if (
    !equalsBytes(
      reconstructedBatch.hashTreeRoot(),
      // The HistoricalSummaries array starts with era 758 so we have to subtract that from the actual
      // era in which a slot occurs when retrieving the index in the Historical Summaries Array
      historicalSummaries[Number(slotToHistoricalBatch(proof.slot)) - CAPELLA_ERA].blockSummaryRoot,
    )
  ) {
    return false
  }
  const elBlockHashPath = ssz[forkName].BeaconBlock.getPathInfo([
    'body',
    'executionPayload',
    'blockHash',
  ])
  const reconstructedBlock = ssz[forkName].BeaconBlock.createFromProof({
    witnesses: proof.beaconBlockProof,
    type: ProofType.single,
    gindex: elBlockHashPath.gindex,
    leaf: elBlockHash,
  })

  if (!equalsBytes(reconstructedBlock.hashTreeRoot(), proof.beaconBlockRoot)) return false
  return true
}

export const generatePreMergeHeaderProof = async (
  blockNumber: bigint,
  epochAccumulator: Uint8Array,
): Promise<Witnesses> => {
  if (blockNumber > MERGE_BLOCK)
    throw new Error('cannot generate preMerge header for post merge block')
  try {
    const accumulator = EpochAccumulator.deserialize(epochAccumulator)
    const tree = EpochAccumulator.value_toTree(accumulator)
    const proofInput: SingleProofInput = {
      type: ProofType.single,
      gindex: blockNumberToGindex(blockNumber),
    }
    const proof = createProof(tree, proofInput) as SingleProof
    return proof.witnesses
  } catch (err: any) {
    throw new Error('Error generating inclusion proof: ' + (err as any).message)
  }
}
