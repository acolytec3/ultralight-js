import tape from 'tape'
import { ChildProcessWithoutNullStreams } from 'child_process'
import {
  PortalNetwork,
  ProtocolId,
  sszEncodeBlockBody,
  getHistoryNetworkContentId,
  HistoryNetworkContentKeyUnionType,
  HistoryProtocol,
  reassembleBlock,
  HistoryNetworkContentTypes,
  HeaderAccumulatorType,
} from '../../src/index.js'
import { fromHexString, toHexString } from '@chainsafe/ssz'
import { Block } from '@ethereumjs/block'
import { createRequire } from 'module'
import { connectAndTest, end } from './integrationTest.js'

const require = createRequire(import.meta.url)

tape('getBlockByHash', (t) => {
  t.test('eth_getBlockByHash test', (st) => {
    const gossip = async (
      portal1: PortalNetwork,
      portal2: PortalNetwork,
      child: ChildProcessWithoutNullStreams
    ) => {
      const protocol1 = portal1.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const protocol2 = portal2.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const testBlockData = require('./testBlocks.json')
      const idx = Math.floor(Math.random() * testBlockData.length)
      const testBlocks: Block[] = testBlockData.map((testBlock: any) => {
        return Block.fromRLPSerializedBlock(Buffer.from(fromHexString(testBlock.rlp)), {
          hardforkByBlockNumber: true,
        })
      })
      const testHashes: Uint8Array[] = testBlocks.map((testBlock: Block) => {
        return testBlock.hash()
      })
      const testHashStrings: string[] = testHashes.map((testHash: Uint8Array) => {
        return toHexString(testHash)
      })

      portal2.on('ContentAdded', async (blockHash, contentType, _content) => {
        if (contentType === HistoryNetworkContentTypes.BlockHeader) {
          st.equal(testHashStrings[idx], blockHash, `eth_getBlockByHash retrieved a blockHash`)
        }
        if (contentType === HistoryNetworkContentTypes.BlockBody) {
          st.equal(testHashStrings[idx], blockHash, `eth_getBlockByHash retrieved a block body`)
          const header = fromHexString(
            await portal2.db.get(
              getHistoryNetworkContentId(1, HistoryNetworkContentTypes.BlockHeader, blockHash)
            )
          )
          const body = fromHexString(
            await portal2.db.get(
              getHistoryNetworkContentId(1, HistoryNetworkContentTypes.BlockBody, blockHash)
            )
          )
          const testBlock = testBlocks[testHashStrings.indexOf(blockHash)]
          const block = reassembleBlock(header, body)
          st.deepEqual(
            block.serialize(),
            testBlock.serialize(),
            `eth_getBlockByHash retrieved a Block from History Network`
          )
          end(child, [portal1, portal2], st)
        }
      })
      testBlocks.forEach(async (testBlock: Block, idx: number) => {
        await protocol1.addContentToHistory(
          1,
          HistoryNetworkContentTypes.BlockHeader,
          testHashStrings[idx],
          testBlock.header.serialize()
        )
        await protocol1.addContentToHistory(
          1,
          HistoryNetworkContentTypes.BlockBody,
          testHashStrings[idx],
          sszEncodeBlockBody(testBlock)
        )
      })
      await protocol1.sendPing(portal2.discv5.enr)
      const returnedBlock = (await protocol2.getBlockByHash(testHashStrings[idx], true)) as Block
      st.deepEqual(returnedBlock.hash(), testBlocks[idx].hash(), 'eth_getBlockByHash test passed')
    }
    connectAndTest(t, st, gossip, true)
  })
  t.test('eth_getBlockByHash test -- no body available', (st) => {
    const getBlock = async (portal1: PortalNetwork, portal2: PortalNetwork) => {
      const protocol1 = portal1.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const protocol2 = portal2.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const testBlockData = require('./testBlock.json')
      const testBlock: Block = Block.fromRLPSerializedBlock(
        Buffer.from(fromHexString(testBlockData[0].rlp)),
        {
          hardforkByBlockNumber: true,
        }
      )
      const testHash = toHexString(testBlock.hash())
      const testHeader = testBlock.header.serialize()
      await protocol1.addContentToHistory(1, 0, testHash, testHeader)

      await protocol1.sendPing(portal2.discv5.enr)
      const returnedBlock = (await protocol2.getBlockByHash(testHash, true)) as Block
      st.deepEqual(
        returnedBlock.header.hash(),
        testBlock.header.hash(),
        'eth_getBlockByHash test passed'
      )
      const _h = await portal2.db.get(getHistoryNetworkContentId(1, 0, testHash))
      st.equal(_h, toHexString(testHeader), 'eth_getBlockByHash returned a Block Header')

      try {
        await portal2.db.get(getHistoryNetworkContentId(1, 1, testHash))
        st.fail('should not find block body')
      } catch (e: any) {
        st.equal(
          e.message,
          'NotFound',
          'eth_getBlockByHash returned a BlockHeader when a BlockBody could not be found'
        )
      }
    }
    connectAndTest(t, st, getBlock)
  })
})

tape('getBlockByNumber', (t) => {
  t.test('eth_getBlockByNumber test', (st) => {
    const findAccumulator = async (
      portal1: PortalNetwork,
      portal2: PortalNetwork,
      child: ChildProcessWithoutNullStreams
    ) => {
      const protocol1 = portal1.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const protocol2 = portal2.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      if (!protocol2 || !protocol1) throw new Error('should have History Protocol')
      const testAccumulator = require('./testAccumulator.json')
      const testBlockData = require('./testBlock.json')
      const accumulatorKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 4,
        value: { selector: 0, value: null },
      })

      const block8200Hash = testBlockData[0].blockHash
      const block8200Rlp = testBlockData[0].rlp
      const headerKey = getHistoryNetworkContentId(1, 0, block8200Hash)
      const blockKey = getHistoryNetworkContentId(1, 1, block8200Hash)
      const testBlock = Block.fromRLPSerializedBlock(Buffer.from(fromHexString(block8200Rlp)), {
        hardforkByBlockNumber: true,
      })
      const block8200Body = sszEncodeBlockBody(testBlock)
      const block8200Header = testBlock.header.serialize()
      portal1.db.put(headerKey, toHexString(block8200Header))
      portal1.db.put(blockKey, toHexString(block8200Body))
      await protocol2.addContentToHistory(
        1,
        HistoryNetworkContentTypes.HeaderAccumulator,
        toHexString(accumulatorKey),
        fromHexString(testAccumulator)
      )
      let header: Uint8Array
      portal2.on('ContentAdded', async (blockHash, contentType, content) => {
        if (contentType === HistoryNetworkContentTypes.BlockHeader) {
          st.equal(content, toHexString(block8200Header))
          header = fromHexString(content)
        }
        if (contentType === HistoryNetworkContentTypes.BlockBody) {
          const block = reassembleBlock(header, fromHexString(content))
          st.equal(
            toHexString(block.serialize()),
            block8200Rlp,
            'eth_getBlockByNumber test passed.'
          )
          end(child, [portal1, portal2], st)
        }
      })

      await protocol1.sendPing(portal2.discv5.enr)
      await protocol2.getBlockByNumber(8200, true)
    }
    connectAndTest(t, st, findAccumulator, true)
  })

  t.test('eth_getBlockByNumber -- HistoricalEpoch', (st) => {
    const accumulatorData = require('./testAccumulator.json')
    const epochData = require('./testEpoch.json')
    const block1000 = require('./testBlock1000.json')
    const epochHash = epochData.hash
    const serialized = epochData.serialized
    const epochKey = HistoryNetworkContentKeyUnionType.serialize({
      selector: 3,
      value: {
        chainId: 1,
        blockHash: fromHexString(epochHash),
      },
    })
    const blockRlp = block1000.raw
    const rebuiltBlock = Block.fromRLPSerializedBlock(Buffer.from(fromHexString(blockRlp)), {
      hardforkByBlockNumber: true,
    })
    const body = sszEncodeBlockBody(rebuiltBlock)
    const _header = rebuiltBlock.header.serialize()
    const blockHash = block1000.hash

    const findEpoch = async (
      portal1: PortalNetwork,
      portal2: PortalNetwork,
      child: ChildProcessWithoutNullStreams
    ) => {
      const protocol1 = portal1.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const protocol2 = portal2.protocols.get(ProtocolId.HistoryNetwork) as HistoryProtocol
      const accumulatorKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 4,
        value: { selector: 0, value: null },
      })
      await protocol1.addContentToHistory(
        1,
        HistoryNetworkContentTypes.HeaderAccumulator,
        toHexString(accumulatorKey),
        fromHexString(accumulatorData)
      )
      await protocol1.addContentToHistory(
        1,
        HistoryNetworkContentTypes.EpochAccumulator,
        toHexString(epochKey),
        fromHexString(serialized)
      )
      await protocol1.addContentToHistory(
        1,
        HistoryNetworkContentTypes.BlockHeader,
        blockHash,
        _header
      )
      await protocol1.addContentToHistory(1, HistoryNetworkContentTypes.BlockBody, blockHash, body)
      let header: Uint8Array
      portal2.on('ContentAdded', async (blockHash, contentType, content) => {
        if (contentType === HistoryNetworkContentTypes.HeaderAccumulator) {
          const headerAccumulator = HeaderAccumulatorType.deserialize(fromHexString(content))
          const _epochHash = toHexString(headerAccumulator.historicalEpochs[0])
          st.equal(
            _epochHash,
            epochHash,
            'Received Accumulator has historical epoch hash for blocks 0 - 8191.'
          )
          protocol2.getBlockByNumber(1000, true)
        }
        if (contentType === HistoryNetworkContentTypes.BlockHeader) {
          st.equal(
            contentType,
            HistoryNetworkContentTypes.BlockHeader,
            'eth_getBlockByNumber returned a block header'
          )
          header = fromHexString(content)
        }
        if (contentType === HistoryNetworkContentTypes.BlockBody) {
          st.equal(
            contentType,
            HistoryNetworkContentTypes.BlockBody,
            'eth_getBlockByNumber returned a block body'
          )
          const body = fromHexString(content)
          const block = reassembleBlock(header, body)
          st.equal(block.header.number, 1000n, 'eth_getBlockByNumber returned block 1000')
          st.deepEqual(
            block.header,
            rebuiltBlock.header,
            'eth_getBlockByNumber retrieved block 1000'
          )
          st.deepEqual(
            block.serialize(),
            rebuiltBlock.serialize(),
            'eth_getBlockByNumber retrieved block 1000'
          )
          st.pass('eth_getBlockByNumber test passed')
          end(child, [portal1, portal2], st)
        }
      })

      await protocol1.sendPing(portal2.discv5.enr)
      await protocol2.sendFindContent(portal1.discv5.enr.nodeId, accumulatorKey)
    }
    connectAndTest(t, st, findEpoch, true)
  })
})
