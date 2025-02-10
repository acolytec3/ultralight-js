import { bytesToHex, hexToBytes } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import {
  BlockHeaderByNumberKey,
  BlockHeaderWithProof,
  HistoryNetwork,
  HistoryNetworkContentType,
  NetworkId,
  PortalNetwork,
  decodeHistoryNetworkContentKey,
} from '../../../src/index.js'

import testdata from './testData/block207686.json'
import { BlockHeader } from '@ethereumjs/block'

describe('Retrieve Block Header By Number', async () => {
  const HWP207686 = hexToBytes(testdata.header)
  const serializedHeader207686 = BlockHeaderWithProof.deserialize(HWP207686).header


  const header207868 = BlockHeader.fromRLPSerializedHeader(serializedHeader207686, { setHardfork: true })
  const hash207686 = bytesToHex(header207868.hash())

  const contentKey207686 = BlockHeaderByNumberKey(207686n)

  it('Should decode content keys', () => {
    assert.deepEqual(decodeHistoryNetworkContentKey(contentKey207686), {
      contentType: HistoryNetworkContentType.BlockHeaderByNumber,
      keyOpt: 207686n,
    })
  })
  const client = await PortalNetwork.create({})
  const history = new HistoryNetwork({
    client,
    networkId: NetworkId.HistoryNetwork,
  })
  client.networks.set(NetworkId.HistoryNetwork, history)
  client.ETH.history = history

  await history.store(contentKey207686, HWP207686)

  it('Should retrieve block header by number', async () => {
    const header = await history.getBlockHeaderFromDB({ blockNumber: 207686n })
    assert.deepEqual(header, serializedHeader207686)
  })

  it('Should retrieve block header by hash', async () => {
    const header = await history.getBlockHeaderFromDB({ blockHash: hexToBytes(hash207686) })
    assert.deepEqual(header, serializedHeader207686)
  })
  it('Should retrieve block by number', async () => {
    const block = await history.getBlockFromDB({ blockNumber: 207686n }, false)
    assert.deepEqual(block.header.serialize(), serializedHeader207686)
  })


  it('Should retrieve locally via eth_getBlockByNumber', async () => {
    const block = await client.ETH.getBlockByNumber(207686n, false)
    assert.isDefined(block)
    assert.deepEqual(block!.header.serialize(), serializedHeader207686)
  })

  it('Should retrieve locally via eth_getBlockByHash', async () => {
    const block = await client.ETH.getBlockByHash(hexToBytes(hash207686), false)
    assert.isDefined(block)
    assert.deepEqual(block!.header.serialize(), serializedHeader207686)
  })
})
