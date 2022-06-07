import { Proof } from '@chainsafe/persistent-merkle-tree'
import { fromHexString, toHexString } from '@chainsafe/ssz'
import { BlockHeader } from '@ethereumjs/block'
import { EpochAccumulator, EPOCH_SIZE, HeaderAccumulatorType, HeaderRecordType } from './types'

export class HeaderAccumulator {
  private _currentEpoch: HeaderRecordType[]
  private _historicalEpochs: Uint8Array[]

  /**
   *
   * @param initFromGenesis boolean indicating whether to initialize the accumulator with the mainnet genesis block
   */
  constructor(initFromGenesis = false) {
    this._currentEpoch = []
    this._historicalEpochs = []
    if (initFromGenesis) {
      const genesisHeaderRlp =
        '0xf90214a00000000000000000000000000000000000000000000000000000000000000000a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347940000000000000000000000000000000000000000a0d7f8974fb5ac78d9ac099b9ad5018bedc2ce0a72dad1827a1709da30580f0544a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b9010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000850400000000808213888080a011bbe8db4e347b4e8c937c1c8370e4b5ed33adb3db69cbdb7a38e1e50b1b82faa00000000000000000000000000000000000000000000000000000000000000000880000000000000042'
      const genesisHeader = BlockHeader.fromRLPSerializedHeader(
        Buffer.from(fromHexString(genesisHeaderRlp))
      )
      this.updateAccumulator(genesisHeader)
    }
  }

  public get currentEpoch() {
    return this._currentEpoch
  }

  public get historicalEpochs() {
    return this._historicalEpochs
  }

  /**
   * Adds a new block header to the `currentEpoch` in the header accumulator
   */
  public updateAccumulator = (newHeader: BlockHeader) => {
    const lastTd =
      this._currentEpoch.length === 0
        ? 0n
        : this._currentEpoch[this._currentEpoch.length - 1].totalDifficulty

    if (this._currentEpoch.length === EPOCH_SIZE) {
      const currentEpochHash = EpochAccumulator.hashTreeRoot(this._currentEpoch)
      this._historicalEpochs.push(currentEpochHash)
      this._currentEpoch = []
    }

    const headerRecord = {
      blockHash: newHeader.hash(),
      totalDifficulty: lastTd + BigInt(newHeader.difficulty.toString(10)),
    }
    this._currentEpoch.push(headerRecord)
  }
  /**
   *
   * @param proof a `Proof` for a particular header's inclusion in the accumulator's `currentEpoch`
   * @param header the blockheader being proved to be included in the `currentEpoch`
   * @param blockPosition the index in the array of `HeaderRecord`s of the header in the `currentEpoch`
   * @returns true if proof is valid, false otherwise
   */
  public verifyInclusionProof = (proof: Proof, header: BlockHeader, blockPosition: number) => {
    const reconstructedTree = HeaderAccumulatorType.createFromProof(proof)

    const epochTree = HeaderAccumulatorType.toView(this)
    try {
      const value = reconstructedTree.currentEpoch.get(blockPosition)
      if (
        toHexString(value.blockHash) === toHexString(header.hash()) &&
        toHexString(epochTree.hashTreeRoot()) === toHexString(reconstructedTree.hashTreeRoot())
      ) {
        return true
      } //eslint-disable-next-line prettier/prettier
    } catch { }

    return false
  }

  /**
   * Returns the current height of the chain contained in the accumulator.  Assumes first block is genesis
   * so subtracts one from chain height since genesis block height is technically 0.
   */
  public currentHeight = () => {
    return this.historicalEpochs.length * EPOCH_SIZE + this.currentEpoch.length - 1
  }
}
