import { readFileSync } from 'fs'
import { ContainerType } from '@chainsafe/ssz'
import { BlockHeader } from '@ethereumjs/block'
import { bytesToHex, concatBytes, hexToBytes, randomBytes } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { historicalEpochs } from '../../../src/networks/history/data/epochHashes.js'
import {
  ContentKeyType,
  Receipt,
  getContentId,
} from '../../../src/networks/history/index.js'
import {
  BlockHeaderWithProof,
  EpochAccumulator,
  HistoricalEpochsType,
  HistoryNetworkContentType,
} from '../../../src/networks/history/types.js'

import testData from './testData/headerWithProof.json' assert { type: 'json' }

import { AccumulatorProofType, generatePreMergeHeaderProof, verifyPreMergeHeaderProof } from '../../../dist/index.js'
import type { TxReceiptType } from '../../../src/networks/history/index.js'

describe('History Subnetwork contentKey serialization/deserialization', () => {
  it('content Key', () => {
    let blockHash = '0xd1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d'
    let encodedKey = ContentKeyType.serialize(
      concatBytes(Uint8Array.from([HistoryNetworkContentType.BlockHeader]), hexToBytes(blockHash)),
    )
    let contentId = getContentId(HistoryNetworkContentType.BlockHeader, hexToBytes(blockHash))
    assert.equal(
      bytesToHex(encodedKey),
      '0x00d1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d',
      'blockheader content key equals expected output',
    )
    assert.equal(
      contentId,
      '3e86b3767b57402ea72e369ae0496ce47cc15be685bec3b4726b9f316e3895fe',
      'block header content ID matches',
    )
    blockHash = '0xd1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d'
    encodedKey = ContentKeyType.serialize(
      concatBytes(Uint8Array.from([HistoryNetworkContentType.BlockBody]), hexToBytes(blockHash)),
    )
    contentId = getContentId(HistoryNetworkContentType.BlockBody, hexToBytes(blockHash))
    assert.equal(
      bytesToHex(encodedKey),
      '0x01d1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d',
      'blockbody content key equals expected output',
    )
    assert.equal(
      contentId,
      'ebe414854629d60c58ddd5bf60fd72e41760a5f7a463fdcb169f13ee4a26786b',
      'block body content ID matches',
    )
    blockHash = '0xd1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d'
    encodedKey = ContentKeyType.serialize(
      concatBytes(Uint8Array.from([HistoryNetworkContentType.Receipt]), hexToBytes(blockHash)),
    )
    contentId = getContentId(HistoryNetworkContentType.Receipt, hexToBytes(blockHash))
    assert.equal(
      bytesToHex(encodedKey),
      '0x02d1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d',
      'receipt content key equals expected output',
    )
    assert.equal(
      contentId,
      'a888f4aafe9109d495ac4d4774a6277c1ada42035e3da5e10a04cc93247c04a4',
      'receipt content ID matches',
    )
  })
  it('Receipt encoding decoding', () => {
    const testReceiptData = [
      {
        status: 1 as 0 | 1,
        cumulativeBlockGasUsed: BigInt(100),
        bitvector: new Uint8Array(256),
        logs: [
          [
            new Uint8Array(20),
            [new Uint8Array(32), new Uint8Array(32).fill(1)],
            new Uint8Array(10),
          ],
        ],
        txType: 2,
      },
      {
        status: 0 as 0 | 1,
        cumulativeBlockGasUsed: BigInt(1000),
        bitvector: new Uint8Array(256).fill(1),
        logs: [
          [
            new Uint8Array(20).fill(1),
            [new Uint8Array(32).fill(1), new Uint8Array(32).fill(1)],
            new Uint8Array(10),
          ],
        ],
        txType: 0,
      },
      {
        status: 1 as 0 | 1,
        cumulativeBlockGasUsed: BigInt(100),
        bitvector: new Uint8Array(256),
        logs: [
          [
            new Uint8Array(20),
            [new Uint8Array(32), new Uint8Array(32).fill(1)],
            new Uint8Array(10),
          ],
        ],
      },
      {
        status: 0 as 0 | 1,
        cumulativeBlockGasUsed: BigInt(1000),
        bitvector: new Uint8Array(256).fill(1),
        logs: [
          [
            new Uint8Array(20).fill(1),
            [new Uint8Array(32).fill(1), new Uint8Array(32).fill(1)],
            new Uint8Array(10),
          ],
        ],
      },
      {
        stateRoot: randomBytes(32),
        cumulativeBlockGasUsed: BigInt(100),
        bitvector: new Uint8Array(256),
        logs: [
          [
            new Uint8Array(20),
            [new Uint8Array(32), new Uint8Array(32).fill(1)],
            new Uint8Array(10),
          ],
        ],
      },
      {
        stateRoot: randomBytes(32),
        cumulativeBlockGasUsed: BigInt(1000),
        bitvector: new Uint8Array(256).fill(1),
        logs: [
          [
            new Uint8Array(20).fill(1),
            [new Uint8Array(32).fill(1), new Uint8Array(32).fill(1)],
            new Uint8Array(10),
          ],
        ],
      },
    ]
    const serializedReceipts = [
      hexToBytes(
        '0x02f9016d0164b9010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f866f864940000000000000000000000000000000000000000f842a00000000000000000000000000000000000000000000000000000000000000000a001010101010101010101010101010101010101010101010101010101010101018a00000000000000000000',
      ),
      hexToBytes(
        '0xf9016f008203e8b9010001010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101f866f864940101010101010101010101010101010101010101f842a00101010101010101010101010101010101010101010101010101010101010101a001010101010101010101010101010101010101010101010101010101010101018a00000000000000000000',
      ),
    ]
    const receipts = testReceiptData.map((r: any) => {
      return new Receipt(r)
    })
    const deserialized = Receipt.fromEncodedReceipt(serializedReceipts[0])
    assert.deepEqual(
      receipts[0].encoded(), //@ts-ignore
      Receipt.fromReceiptData(testReceiptData[0] as TxReceiptType).encoded(),
    )
    assert.deepEqual(receipts[0].encoded(), serializedReceipts[0], 'Receipt decode test passed 1')
    assert.deepEqual(deserialized.encoded(), receipts[0].encoded(), 'Receipt decode test passed 2')

    const _deserialized = Receipt.fromEncodedReceipt(serializedReceipts[1])
    assert.deepEqual(receipts[1].encoded(), serializedReceipts[1], 'Receipt decode test passed 3')
    assert.deepEqual(_deserialized.encoded(), receipts[1].encoded(), 'Receipt decode test passed 4')

    assert.deepEqual(
      receipts[2].decoded(),
      testReceiptData[2] as TxReceiptType,
      'Receipt decode test passed 5',
    )
    assert.deepEqual(
      receipts[3].decoded(),
      testReceiptData[3] as TxReceiptType,
      'Receipt decode test passed 6',
    )
    assert.deepEqual(
      receipts[4].decoded(),
      testReceiptData[4] as TxReceiptType,
      'Receipt decode test passed 7',
    )
    assert.deepEqual(
      receipts[5].decoded(),
      testReceiptData[5] as TxReceiptType,
      'Receipt decode test passed 8',
    )

    assert.deepEqual(
      Receipt.decodeReceiptBytes(serializedReceipts[0]).logs,
      testReceiptData[0].logs,
      'Decoded lgos from buffer',
    )
    assert.deepEqual(
      Receipt.decodeReceiptBytes(serializedReceipts[0]).bitvector,
      testReceiptData[0].bitvector,
      'Decoded bitvector from buffer',
    )
    assert.deepEqual(
      Receipt.decodeReceiptBytes(serializedReceipts[1]).logs,
      testReceiptData[1].logs,
      'Decoded lgos from buffer',
    )
    assert.deepEqual(
      Receipt.decodeReceiptBytes(serializedReceipts[1]).bitvector,
      testReceiptData[1].bitvector,
      'Decoded bitvector from buffer',
    )
  })
})

describe('Header With Proof serialization/deserialization tests', async () => {
  const masterAccumulator =
    '0x' +
    readFileSync('./test/networks/history/testData/merge_macc.bin', {
      encoding: 'hex',
    })
  const _historicalEpochs = HistoricalEpochsType.deserialize(hexToBytes(masterAccumulator).slice(4))
  const MasterAccumulatorType = new ContainerType({
    historicalEpochs: HistoricalEpochsType,
  })

  const serialized_container = MasterAccumulatorType.serialize({
    historicalEpochs: _historicalEpochs,
  })
  const actualEpoch =
    '0x' +
    readFileSync(
      './test/networks/history/testData/0x03cddbda3fd6f764602c06803ff083dbfc73f2bb396df17a31e5457329b9a0f38d.portalcontent',
      { encoding: 'hex' },
    )


  const serializedBlock1 = hexToBytes(testData[1000001].content_value)
  const headerWithProof = BlockHeaderWithProof.deserialize(serializedBlock1)
  const header = BlockHeader.fromRLPSerializedHeader(headerWithProof.header, {
    skipConsensusFormatValidation: true,
    setHardfork: true,
  })

  const epochHash = historicalEpochs[Math.floor(1000001 / 8192)]
  const actual_Epoch = EpochAccumulator.deserialize(hexToBytes(actualEpoch))
  const proof = await generatePreMergeHeaderProof(header.number, hexToBytes(actualEpoch))

  it('should serialize/deserialize', async () => {
    assert.deepEqual(
      hexToBytes(masterAccumulator),
      serialized_container,
      'Serialized Container matches MasterAccumulator',
    )
  })

  const blockHeaderWithProof =
    BlockHeaderWithProof.serialize({
      header: header.serialize(),
      proof: AccumulatorProofType.serialize(proof),
    })
  const deserializedBlockHeaderWithProof = BlockHeaderWithProof.deserialize(blockHeaderWithProof)
  assert.ok(verifyPreMergeHeaderProof(proof, bytesToHex(header.hash()), header.number), `proof is valid`)
  assert.equal(BlockHeader.fromRLPSerializedHeader(deserializedBlockHeaderWithProof.header, { setHardfork: true }).number, header.number, `header number matches`)


  it('should match epoch hash', async () => {
    assert.equal(
      bytesToHex(EpochAccumulator.hashTreeRoot(actual_Epoch)),
      epochHash,
      'stored epoch hash matches valid epoch',
    )
  })
})

