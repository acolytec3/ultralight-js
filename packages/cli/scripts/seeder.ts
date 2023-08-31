import jayson, { HttpClient } from 'jayson/promise/index.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { fromHexString, getContentKey, HistoryNetworkContentType, ProtocolId, toHexString } from 'portalnetwork'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { Block } from '@ethereumjs/block'
import { hexToBytes } from '@ethereumjs/util'

const require = createRequire(import.meta.url)
const { Client } = jayson

const args: any = yargs(hideBin(process.argv))
  .option('sourceFile', {
    describe: 'JSON file containing block data to feed into network',
    string: true,
    optional: true,
  })
  .option('addBlockByHash', {
    describe: 'specify a specific blockhash to add to the local node DB',
    string: true,
    optional: true,
  })
  .option('rpcPort', {
    describe: 'RPC port of node',
    number: true,
    demandOption: true,
  })
  .option('numBlocks', {
    describe: 'number of blocks to seed on node',
    number: true,
  })
  .option('numNodes', {
    describe: 'number of nodes in devnet',
    number: true,
    demandOption: true,
  })
  .option('requestblockHash', {
    describe: 'specify a block hash to request from other nodes',
    string: true,
    optional: true,
  }).argv

enum Clients {
  ultralight = 'ultralight',
  peer1 = 'peer1',
  peer2 = 'peer2',
  peer3 = 'peer3',
}
type TestClient = {
  client: HttpClient
  enr: string
  nodeId: string
}

const numBlocks = 4

const main = async () => {
  const ultralight = Client.http({ port: args.rpcPort })
  const peer1 = Client.http({ port: args.rpcPort + 1 })
  const peer2 = Client.http({ port: args.rpcPort + 2 })
  const peer3 = Client.http({ port: args.rpcPort + 3 })
  const clients = [ultralight, peer1, peer2, peer3]
  const clientInfo: Record<Clients, TestClient> = {
    ultralight: { client: ultralight, enr: 'enr:-IS4QFV_wTNknw7qiCGAbHf6LxB-xPQCktyrCEZX-b-7PikMOIKkBg-frHRBkfwhI3XaYo_T-HxBYmOOQGNwThkBBHYDgmlkgnY0gmlwhKRc9_OJc2VjcDI1NmsxoQKHPt5CQ0D66ueTtSUqwGjfhscU_LiwS28QvJ0GgJFd-YN1ZHCCE4k', nodeId: '' },
    peer1: { client: peer1, enr: 'enr:-IS4QDpUz2hQBNt0DECFm8Zy58Hi59PF_7sw780X3qA0vzJEB2IEd5RtVdPUYZUbeg4f0LMradgwpyIhYUeSxz2Tfa8DgmlkgnY0gmlwhKRc9_OJc2VjcDI1NmsxoQJd4NAVKOXfbdxyjSOUJzmA4rjtg43EDeEJu1f8YRhb_4N1ZHCCE4o', nodeId: '' },
    peer2: { client: peer2, enr: 'enr:-IS4QGG6moBhLW1oXz84NaKEHaRcim64qzFn1hAG80yQyVGNLoKqzJe887kEjthr7rJCNlt6vdVMKMNoUC9OCeNK-EMDgmlkgnY0gmlwhKRc9-KJc2VjcDI1NmsxoQLJhXByb3LmxHQaqgLDtIGUmpANXaBbFw3ybZWzGqb9-IN1ZHCCE4k', nodeId: '' },
    peer3: { client: peer3, enr: 'enr:-IS4QA5hpJikeDFf1DD1_Le6_ylgrLGpdwn3SRaneGu9hY2HUI7peHep0f28UUMzbC0PvlWjN8zSfnqMG07WVcCyBhADgmlkgnY0gmlwhKRc9-KJc2VjcDI1NmsxoQJMpHmGj1xSP1O-Mffk_jYIHVcg6tY5_CjmWVg1gJEsPIN1ZHCCE4o', nodeId: '' },
  }
  const blockData = require(args.sourceFile)
  const blocks = Object.entries(blockData)
  const epoch = require('./testEpoch.json')
  const epoch25 = readFileSync(
    './scripts/0x03f216a28afb2212269b634b9b44ff327a4a79f261640ff967f7e3283e3a184c70.portalcontent',
    { encoding: 'hex' }
  )

  async function testRes(clients: HttpClient[], method: string, params: any[][]) {
    for (const [i, client] of clients.entries()) {
      const info = await client.request(method, params[i])
      if (info.error) {
        throw new Error(`${method} error: ${info.error.message}`)
      }
    }
    console.log(`ok ${method} test`)
  }
  const epochKey = getContentKey(HistoryNetworkContentType.EpochAccumulator, fromHexString(epoch.hash))
  let res = await clientInfo.ultralight.client.request('ultralight_addContentToDB', [
    epochKey,
    epoch.serialized,
  ])
  if (res.error) {
    throw new Error(`ultralight_addContentToDB error`)
  }
  res = await clientInfo.ultralight.client.request('ultralight_addContentToDB', [
    '0x03f216a28afb2212269b634b9b44ff327a4a79f261640ff967f7e3283e3a184c70',
    '0x' + epoch25,
  ])
  if (res.error) {
    throw new Error(`ultralight_addContentToDB error: ${res.error.message}}`)
  }
  console.log('ok ultralight_addContentToDB')
  for (let x = 0; x < numBlocks; x++) {
    res = await clientInfo.ultralight.client.request('ultralight_addBlockToHistory', [
      blocks[x][0],
      (blocks[x][1] as any).rlp,
    ])
    if (res.error) {
      throw new Error(`ultralight_addBlockToHistory error`)
    }
  }
  console.log('ok ultralight_addBlockToHistory')

  const ultralightInfo = await ultralight.request('discv5_nodeInfo', [])
  const peer1Info = await peer1.request('discv5_nodeInfo', [])
  const peer2Info = await peer2.request('discv5_nodeInfo', [])
  const peer3Info = await peer3.request('discv5_nodeInfo', [])
  if (ultralightInfo.error) {
    throw new Error('ultralight discv5_nodeInfo error')
  } else if (peer1Info.error) {
    throw new Error('peer1 discv5_nodeInfo error')
  } else if (peer2Info.error) {
    throw new Error('peer2 discv5_nodeInfo error')
  } else if (peer3Info.error) {
    throw new Error('peer2 discv5_nodeInfo error')
  } else {
    console.log('ok discv5_nodeInfo test')
  }

  clientInfo.ultralight.enr = ultralightInfo.result.enr
  clientInfo.ultralight.nodeId = ultralightInfo.result.nodeId
  clientInfo.peer1.enr = peer1Info.result.enr
  clientInfo.peer1.nodeId = peer1Info.result.nodeId
  clientInfo.peer2.enr = peer2Info.result.enr
  clientInfo.peer2.nodeId = peer2Info.result.nodeId
  clientInfo.peer3.enr = peer3Info.result.enr
  clientInfo.peer3.nodeId = peer3Info.result.nodeId

  // portal_historyAddBootNode
  await testRes(
    [clientInfo.ultralight.client, clientInfo.ultralight.client, clientInfo.ultralight.client],
    'portal_historyAddBootNode',
    [[clientInfo.peer1.enr], [clientInfo.peer2.enr], [clientInfo.peer3.enr]]
  )
  // portal_historyRoutingTableInfo
  await testRes(clients, 'portal_historyRoutingTableInfo', [[], [], [], []])
  // portal_historyLookupEnr
  await testRes([clients[0]], 'portal_historyLookupEnr', [['0x' + clientInfo.peer1.nodeId]])
  // portal_historyPing
  await testRes(clients.slice(1), 'portal_historyPing', [
    [clientInfo.ultralight.enr, '0x00'],
    [clientInfo.ultralight.enr, '0x00'],
    [clientInfo.ultralight.enr, '0x00'],
  ])
  // portal_historyFindNodes
  await testRes([clients[1]], 'portal_historyFindNodes', [[clientInfo.ultralight.enr, [255]]])
  // portal_historyFindContent
  await testRes([clients[1]], 'portal_historyFindContent', [
    [clientInfo.ultralight.enr, blocks[1][0]],
  ])
  // portal_historyLocalContent
  await testRes([clients[0]], 'portal_historyLocalContent', [[epochKey]])
  // portal_historyOffer
  for (const block of blocks.slice(0, 1)) {
    await testRes([clients[0]], 'portal_historyOffer', [
      [
        clientInfo.peer1.enr,
        getContentKey(HistoryNetworkContentType.BlockHeader, fromHexString(block[0])),
        toHexString(
          Block.fromRLPSerializedBlock(hexToBytes((block[1] as any).rlp), {
            setHardfork: true,
          }).header.serialize()
        ),
        toHexString(Block.fromRLPSerializedBlock(hexToBytes((block[1] as any).rlp), { setHardfork: true}).header.serialize())
      ,
    ],
  ])}
  // eth_getBlockByHash
  await testRes([clients[2]], 'eth_getBlockByHash', [[blocks[2][0], false]])
  // eth_getBlockByNumber
  await clientInfo.peer3.client.request('ultralight_addContentToDB', [epochKey, epoch.serialized])
  await testRes([clients[3]], 'eth_getBlockByNumber', [['0x3e8', false]])
  await testRes([clients[2]], 'eth_getBlockByNumber', [['0x3e8', false]])
}

main()
