import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { Block, type BlockBytes, BlockHeader } from '@ethereumjs/block'
import * as RLP from '@ethereumjs/rlp'
import { bytesToHex, hexToBytes, randomBytes } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import {
  AccumulatorProofType,
  BlockHeaderWithProof,
  HistoricalRootsBlockProof,
  HistoryNetworkContentType,
  NetworkId,
  PortalNetwork,
  TransportLayer,
  blockHeaderFromRpc,
  generatePreMergeHeaderProof,
  getContentKey,
  reassembleBlock,
  sszEncodeBlockBody,
} from '../../../src/index.js'

import type { HistoryNetwork } from '../../../src/index.js'

const require = createRequire(import.meta.url)
const testBlocks = require('../../testData/testBlocksForHistory.json')

describe('store -- Headers and Epoch Accumulators', async () => {
  it('Should store and retrieve block header from DB', async () => {
    // const epochKey = '0x035ec1ffb8c3b146f42606c74ced973dc16ec5a107c0345858c343fc94780b4218'
    const epoch =
      '0x' +
      readFileSync(
        `./test/networks/history/testData/0x035ec1ffb8c3b146f42606c74ced973dc16ec5a107c0345858c343fc94780b4218.portalcontent`,
        {
          encoding: 'hex',
        },
      )
    const node = await PortalNetwork.create({
      bindAddress: '127.0.0.1',
      supportedNetworks: [{ networkId: NetworkId.HistoryNetwork }],
    })
    const network = node.networks.get(NetworkId.HistoryNetwork) as HistoryNetwork
    const block1Rlp =
      '0xf90211a0d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479405a56e2d52c817161883f50c441c3228cfe54d9fa0d67e4d450343046425ae4271474353857ab860dbc0a1dde64b41b5cd3a532bf3a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008503ff80000001821388808455ba422499476574682f76312e302e302f6c696e75782f676f312e342e32a0969b900de27b6ac6a67742365dd65f55a0526c41fd18e1b16f1a1215c2e66f5988539bd4979fef1ec4'
    const block1Hash = '0x88e96d4537bea4d9c05d12549907b32561d3bf31f45aae734cdc119f13406cb6'
    const proof = await generatePreMergeHeaderProof(1n, hexToBytes(epoch))
    const headerKey = getContentKey(HistoryNetworkContentType.BlockHeader, hexToBytes(block1Hash))
    await network.store(
      headerKey,
      BlockHeaderWithProof.serialize({
        header: hexToBytes(block1Rlp),
        proof: AccumulatorProofType.serialize(proof),
      }),
    )
    const contentKey = getContentKey(HistoryNetworkContentType.BlockHeader, hexToBytes(block1Hash))

    const val = await network.get(contentKey)
    const headerWith = BlockHeaderWithProof.deserialize(hexToBytes(val))
    const header = BlockHeader.fromRLPSerializedHeader(headerWith.header, {
      setHardfork: true,
    })
    assert.equal(header.number, 1n, 'retrieved block header based on content key')
  })
})

describe('store -- Block Bodies and Receipts', async () => {
  const node = await PortalNetwork.create({
    bindAddress: '127.0.0.1',
    transport: TransportLayer.WEB,
    supportedNetworks: [{ networkId: NetworkId.HistoryNetwork }],
  })
  const network = node.networks.get(NetworkId.HistoryNetwork) as HistoryNetwork
  const serializedBlock = testBlocks.block207686
  const blockRlp = RLP.decode(hexToBytes(serializedBlock.blockRlp))
  const block = Block.fromValuesArray(blockRlp as BlockBytes, { setHardfork: true })
  const epoch =
    '0x' +
    readFileSync(
      './test/networks/history/testData/0x03987cb6206e5bae4b68ce0eeb6c05ae090d02b7331e47d1705a2a515ac88475aa.portalcontent',
      { encoding: 'hex' },
    )

  const proof = AccumulatorProofType.serialize(
    await generatePreMergeHeaderProof(207686n, hexToBytes(epoch)),
  )
  const headerWithProof = BlockHeaderWithProof.serialize({
    header: block.header.serialize(),
    proof,
  })

  const headerKey = getContentKey(
    HistoryNetworkContentType.BlockHeader,
    hexToBytes(serializedBlock.blockHash),
  )
  await network.store(headerKey, headerWithProof)
  const bodyKey = getContentKey(
    HistoryNetworkContentType.BlockBody,
    hexToBytes(serializedBlock.blockHash),
  )
  await network.store(bodyKey, sszEncodeBlockBody(block))
  const header = BlockHeaderWithProof.deserialize(
    hexToBytes(
      await network.get(
        getContentKey(HistoryNetworkContentType.BlockHeader, hexToBytes(serializedBlock.blockHash)),
      ),
    ),
  ).header
  const body = await network.get(
    getContentKey(HistoryNetworkContentType.BlockBody, hexToBytes(serializedBlock.blockHash)),
  )
  const rebuilt = reassembleBlock(header, hexToBytes(body!))

  it('Should store and retrieve a block body from DB', async () => {
    assert.equal(
      rebuilt.header.number,
      block.header.number,
      'reassembled block from components in DB',
    )
  })
  const receipt = await network.saveReceipts(block)
  it('Should store and retrieve block receipts from DB', async () => {
    assert.equal(receipt[0].cumulativeBlockGasUsed, 43608n, 'correctly generated block receipts')
  })
})

describe('Header Tests', async () => {
  const node = await PortalNetwork.create({
    bindAddress: '127.0.0.1',
    transport: TransportLayer.WEB,
    supportedNetworks: [{ networkId: NetworkId.HistoryNetwork }],
  })
  const network = node.networks.get(NetworkId.HistoryNetwork) as HistoryNetwork

  it('should validate and store a post merge header proof', async () => {
    const headerJson = require('./testData/mergeBlockHeader.json')
    const header = blockHeaderFromRpc(headerJson, { setHardfork: true })
    const headerKey = getContentKey(HistoryNetworkContentType.BlockHeader, header.hash())
    const headerProofJson = require('./testData/mergeBlockHeaderProof.json')
    const headerProof = HistoricalRootsBlockProof.fromJson(headerProofJson)
    const serializedHeaderWithProof = BlockHeaderWithProof.serialize({
      header: header.serialize(),
      proof: HistoricalRootsBlockProof.serialize(headerProof),
    })
    try {
      const res = network.validateHeader(serializedHeaderWithProof, {
        blockHash: bytesToHex(header.hash()),
      })
      assert.ok(res, 'validated post-merge proof')
    } catch (err: any) {
      assert.fail(err.message)
    }
    await network.store(headerKey, serializedHeaderWithProof)
  })
  it('should verify a pre-merge header proof', async () => {
    const _epoch1Hash = '0x5ec1ffb8c3b146f42606c74ced973dc16ec5a107c0345858c343fc94780b4218'
    const _epochRaw =
      '0x' +
      readFileSync(
        './test/networks/history/testData/0x035ec1ffb8c3b146f42606c74ced973dc16ec5a107c0345858c343fc94780b4218.portalcontent',
        { encoding: 'hex' },
      )

    const block1000 = require('../../testData/testBlock1000.json')
    const proof = AccumulatorProofType.serialize(
      await generatePreMergeHeaderProof(1000n, hexToBytes(_epochRaw)),
    )
    const preMergeHeaderWithProof = BlockHeaderWithProof.serialize({
      header: hexToBytes(block1000.rawHeader),
      proof,
    })
    const headerKey = getContentKey(
      HistoryNetworkContentType.BlockHeader,
      hexToBytes(block1000.hash),
    )
    await network.validateHeader(preMergeHeaderWithProof, { blockHash: block1000.hash })
    await network.store(headerKey, preMergeHeaderWithProof)
  })
  it('should not store pre-Capella headers with various errors', async () => {
    const headerJson = require('./testData/mergeBlockHeader.json')
    const header = blockHeaderFromRpc(headerJson, { setHardfork: true })
    const fakeHeaderKey = getContentKey(HistoryNetworkContentType.BlockHeader, randomBytes(32))
    const headerProofJson = require('./testData/mergeBlockHeaderProof.json')
    const headerProof = HistoricalRootsBlockProof.serialize(
      HistoricalRootsBlockProof.fromJson(headerProofJson),
    )
    const serializedHeaderWithProof = BlockHeaderWithProof.serialize({
      header: header.serialize(),
      proof: headerProof,
    })
    try {
      await network.store(fakeHeaderKey, serializedHeaderWithProof)
      assert.fail('should have thrown')
    } catch (err: any) {
      assert.equal(
        err.message,
        'Block hash from data does not match block hash provided for validation',
      )
    }
    const headerKey = getContentKey(HistoryNetworkContentType.BlockHeader, header.hash())
    const fakeProof = BlockHeaderWithProof.serialize({
      header: header.serialize(),
      proof: headerProof.reverse(),
    })
    try {
      await network.store(headerKey, fakeProof)
      assert.fail('should have thrown')
    } catch (err: any) {
      assert.ok(err.message.includes('invalid proof'))
    }
  })
})
