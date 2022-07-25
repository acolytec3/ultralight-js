import { fromHexString, toHexString } from '@chainsafe/ssz'
import { Block } from '@ethereumjs/block'
import tape from 'tape'
import {
  getHistoryNetworkContentId,
  HistoryNetworkContentKeyUnionType,
  reassembleBlock,
  sszEncodeBlockBody,
} from '../../../src/subprotocols/history/index.js'
import { HistoryNetworkContentTypes } from '../../../src/subprotocols/history/types.js'

tape('History Subprotocol contentKey serialization/deserialization', async (t) => {
  let chainId = 15
  let blockHash = '0xd1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d'
  let encodedKey = HistoryNetworkContentKeyUnionType.serialize({
    selector: HistoryNetworkContentTypes.BlockHeader,
    value: { chainId: chainId, blockHash: fromHexString(blockHash) },
  })
  let contentId = getHistoryNetworkContentId(
    chainId,
    HistoryNetworkContentTypes.BlockHeader,
    blockHash
  )
  t.equals(
    toHexString(encodedKey),
    '0x000f00d1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d',
    'blockheader content key equals expected output'
  )
  t.equals(
    contentId,
    '0x2137f185b713a60dd1190e650d01227b4f94ecddc9c95478e2c591c40557da99',
    'block header content ID matches'
  )
  chainId = 20
  blockHash = '0xd1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d'
  encodedKey = HistoryNetworkContentKeyUnionType.serialize({
    selector: HistoryNetworkContentTypes.BlockBody,
    value: { chainId, blockHash: fromHexString(blockHash) },
  })
  contentId = getHistoryNetworkContentId(chainId, HistoryNetworkContentTypes.BlockBody, blockHash)
  t.equals(
    toHexString(encodedKey),
    '0x011400d1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d',
    'blockbody content key equals expected output'
  )
  t.equals(
    contentId,
    '0x1c6046475f0772132774ab549173ca8487bea031ce539cad8e990c08df5802ca',
    'block body content ID matches'
  )
  chainId = 4
  blockHash = '0xd1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d'
  encodedKey = HistoryNetworkContentKeyUnionType.serialize({
    selector: HistoryNetworkContentTypes.Receipt,
    value: { chainId, blockHash: fromHexString(blockHash) },
  })
  contentId = getHistoryNetworkContentId(chainId, HistoryNetworkContentTypes.Receipt, blockHash)
  t.equals(
    toHexString(encodedKey),
    '0x020400d1c390624d3bd4e409a61a858e5dcc5517729a9170d014a6c96530d64dd8621d',
    'receipt content key equals expected output'
  )
  t.equals(
    contentId,
    '0xaa39e1423e92f5a667ace5b79c2c98adbfd79c055d891d0b9c49c40f816563b2',
    'receipt content ID matches'
  )
  chainId = 1
  encodedKey = HistoryNetworkContentKeyUnionType.serialize({
    selector: HistoryNetworkContentTypes.HeaderAccumulator,
    value: { selector: 0, value: null },
  })
  contentId = getHistoryNetworkContentId(chainId, HistoryNetworkContentTypes.HeaderAccumulator)
  t.equals(contentId, '0xc0ba8a33ac67f44abff5984dfbb6f56c46b880ac2b86e1f23e7fa9c402c53ae7')
  t.end()
})

tape('BlockBody ssz serialization/deserialization', (t) => {
  const block200031Rlp =
    '0xf904e8f901ffa0642010e58878e909266f0d72489494242401095578ce35096641ebf729e44ae3a063ccd1e45d688df2a7021d0adb0c07197d07b9e2585f94a22dc98d95b09759aa94580992b51e3925e23280efb93d3047c82f17e038a0d8893ed24819816252a288b04357f5216824457946a0a7c4855a431d472e65e2a05cda0425b7d9d85346601f227cfc14d65b9f3a05270f054387ec40de32f77108a08f12d3c5dd70daec6dfbafce658f2b004d100f3d7ca974dfc9ed690761a62152b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605aae2d113eb83030d5f832fefd882a4108455ee048c80a051322814cc17686959c70ca0d33c8480c6193b829300681cb5da44a23ce5a6f688687d504c9e038b6df8e1f86f822d8a850ba43b740083015f90949a6ae9cec80b30efb1ca59e3074c6013cfda582e880ddd431062aa8c00801ca00a1751859b131193f48a7f63c82cbc61689d52551907fc5418026f479795d4a9a07515ad3f692fca2587a43bd5b2ff0a53566811b898d589eb369b91bcf9afba6cf86e822d8b850ba43b740083015f90947c5080988c6d91d090c23d54740f856c69450b29875c6b0a565a8c00801ba0e37e9e1a9ece55d007043ed6a2cf80d3fa665460c16114d647cc9fdaa1caa64ba03cc320f18c7b6ba4f56b7b90f6d09e2fcf78d30520bc24004570d3bfcf21b9a5f90200f901fda05742019e0c07bbfdf2dcd8be5ea6f1191ca573c07db7f90004af033a49058f7da01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d4934794f8b483dba2c3b7176a3da549ad41a48bb3121069a0cdc188c634e79fb1a66d020ea5c6d200ded0fb4be5acad0dd6e0acf9d83d0394a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605ac4dcdd62683030d5d832fefd8808455ee042a80a0c66d672b0a4ac8c1b42e8a2cccd3b78ecfc2b02a121586c4b6e5ad12c37fc9cf886183132d2c736336'
  const block = Block.fromRLPSerializedBlock(Buffer.from(fromHexString(block200031Rlp)))
  const encodedBody = sszEncodeBlockBody(block)
  const encodedHeader = block.header.serialize()
  const reassembledBlock = reassembleBlock(encodedHeader, encodedBody)
  t.equal(
    block.header.hash().toString('hex'),
    reassembledBlock.header.hash().toString('hex'),
    'was able to ssz serialize and deserialize a block'
  )
  t.end()
})
