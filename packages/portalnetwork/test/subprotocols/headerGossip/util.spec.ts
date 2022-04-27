import tape from 'tape'
import {
  EpochAccumulator,
  HeaderAccumulator,
  HeaderAccumulatorType,
  HeaderRecord,
  updateAccumulator,
} from '../../../src/subprotocols/headerGossip'
import { Block } from '@ethereumjs/block'
import { fromHexString, toHexString } from '@chainsafe/ssz'
import { createProof, ProofType } from '@chainsafe/persistent-merkle-tree'

tape('Validate accumulator updates', (t) => {
  const accumulator = HeaderAccumulator.serialize({
    currentEpoch: [],
    historicalEpochs: [],
  })
  const genesisRlp =
    '0xf90216f90211a0d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479405a56e2d52c817161883f50c441c3228cfe54d9fa0d67e4d450343046425ae4271474353857ab860dbc0a1dde64b41b5cd3a532bf3a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008503ff80000001821388808455ba422499476574682f76312e302e302f6c696e75782f676f312e342e32a0969b900de27b6ac6a67742365dd65f55a0526c41fd18e1b16f1a1215c2e66f5988539bd4979fef1ec4c0c0'
  const block2Rlp =
    '0xf9021df90218a088e96d4537bea4d9c05d12549907b32561d3bf31f45aae734cdc119f13406cb6a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d4934794dd2f1e6e498202e86d8f5442af596580a4f03c2ca04943d941637411107494da9ec8bc04359d731bfd08b72b4d0edcbd4cd2ecb341a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008503ff00100002821388808455ba4241a0476574682f76312e302e302d30636463373634372f6c696e75782f676f312e34a02f0790c5aa31ab94195e1f6443d645af5b75c46c04fbf9911711198a0ce8fdda88b853fa261a86aa9ec0c0'
  const genesisHeader = Block.fromRLPSerializedBlock(Buffer.from(fromHexString(genesisRlp))).header
  const block2Header = Block.fromRLPSerializedBlock(Buffer.from(fromHexString(block2Rlp))).header
  let updatedAccumulator = updateAccumulator(accumulator, genesisHeader)
  let deserializedAccumulator = HeaderAccumulator.deserialize(
    updatedAccumulator
  ) as HeaderAccumulatorType
  t.equal(
    toHexString(EpochAccumulator.hashTreeRoot(deserializedAccumulator.currentEpoch)),
    '0x1978df242d723405f28d26184e57ccf1938b253ef08234bfeb4951abdf3bbe4c',
    'roots match after genesis block'
  )
  updatedAccumulator = updateAccumulator(updatedAccumulator, block2Header)
  deserializedAccumulator = HeaderAccumulator.deserialize(
    updatedAccumulator
  ) as HeaderAccumulatorType
  t.equal(
    toHexString(EpochAccumulator.hashTreeRoot(deserializedAccumulator.currentEpoch)),
    '0x90cc48e39fe7062a3e5b6a3e78ff1f01544c22b87c6453cd718a1e5fe5ed8fa9',
    'roots match after Block 2'
  )

  const currentEpoch = deserializedAccumulator.currentEpoch
  const tree = EpochAccumulator.toViewDU(currentEpoch)
  const proof = createProof(tree.node, {
    gindex: EpochAccumulator.getPropertyGindex(1),
    type: ProofType.single,
  })

  t.equal(
    toHexString(EpochAccumulator.hashTreeRoot(currentEpoch)),
    toHexString(EpochAccumulator.createFromProof(proof).hashTreeRoot()),
    'successfully validated single proof for block 2 header'
  )
  t.end()
})
