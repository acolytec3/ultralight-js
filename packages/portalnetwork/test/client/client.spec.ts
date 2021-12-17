import tape from 'tape'
import { PortalNetwork, SubNetworkIds } from '../../src/'
import td from 'testdouble'

tape('Client unit tests', async (t) => {
    const node = await PortalNetwork.createPortalNetwork('192.168.0.1', 'ws://192.168.0.2:5050') as any
    t.ok(node.client.enr.getLocationMultiaddr('udp')!.toString().includes('192.168.0.1'), 'created portal network node with correct ip address')

    node.client.start = td.func<any>()
    td.when(node.client.start()).thenResolve(undefined)
    await node.start();
    t.pass('client should start')

    t.throws(() => node.radius = 257, 'should not be able to set radius greater than 256')
    t.throws(() => node.radius = -1, 'radius cannot be negative');

    const pongResponse = Uint8Array.from([1, 5, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const findNodesResponse = Uint8Array.from([3, 1, 5, 0, 0, 0, 4, 0, 0, 0, 248, 132, 184, 64, 98, 28, 68, 73, 123, 43, 66, 88, 148, 220, 175, 197, 99, 155, 158, 245, 113, 112, 19, 145, 242, 62, 9, 177, 46, 127, 179, 172, 15, 214, 73, 120, 117, 10, 84, 236, 35, 36, 1, 7, 157, 133, 186, 53, 153, 250, 87, 144, 208, 228, 233, 233, 190, 215, 71, 114, 119, 169, 10, 2, 182, 117, 100, 246, 5, 130, 105, 100, 130, 118, 52, 130, 105, 112, 132, 127, 0, 0, 1, 137, 115, 101, 99, 112, 50, 53, 54, 107, 49, 161, 2, 166, 64, 119, 30, 57, 36, 215, 222, 189, 27, 126, 14, 93, 46, 164, 80, 142, 10, 84, 179, 46, 141, 1, 3, 181, 22, 178, 254, 0, 158, 156, 232, 131, 117, 100, 112, 130, 158, 250])
    const findContentResponse = Uint8Array.from([5, 1, 97, 98, 99])
    node.sendPortalNetworkMessage = td.func<any>()
    td.when(node.sendPortalNetworkMessage(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(pongResponse, null, findNodesResponse, null, findContentResponse)
    let res = await node.sendPing('abc', SubNetworkIds.HistoryNetworkId)
    t.ok(res.enrSeq === 5n && res.customPayload[0] === 1, 'received expected PONG response')
    res = await node.sendPing('abc', SubNetworkIds.HistoryNetworkId)
    t.ok(res === undefined, 'received undefined when no valid PONG message received')
    res = await node.sendFindNodes('abc', [0, 1, 2], SubNetworkIds.HistoryNetworkId)
    t.ok(res.total === 1, 'received 1 ENR from FINDNODES')
    res = await node.sendFindNodes('abc', [], SubNetworkIds.HistoryNetworkId)
    t.ok(res === undefined, 'received undefined when no valid NODES response received')
    res = await node.sendFindContent('abc', Uint8Array.from([1]), SubNetworkIds.HistoryNetworkId)
    t.ok(Buffer.from(res).toString() === 'abc', 'received expected content from FINDCONTENT')

    // Testdouble apparently has an upper limit of 5 on the number of return values that can be passed from `thenResolve` 
    // so have to provide a new list here
    const acceptResponse = Uint8Array.from([7, 229, 229, 6, 0, 0, 0, 3])
    td.when(node.sendPortalNetworkMessage(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(null, acceptResponse, null)
    res = await node.sendFindContent('abc', '', SubNetworkIds.HistoryNetworkId)
    t.ok(res === undefined, 'received undefined when no valid FOUNDCONTENT message received')
    node.sendUtpStreamRequest = td.func<any>()
    td.when(node.sendUtpStreamRequest(td.matchers.contains('abc'), td.matchers.anything())).thenResolve(undefined)
    res = await node.sendOffer('abc', [Uint8Array.from([1])], SubNetworkIds.HistoryNetworkId)
    t.ok(res.contentKeys[0] === true, 'received valid ACCEPT response to OFFER')
    res = await node.sendOffer('abc', [Uint8Array.from([0])], SubNetworkIds.HistoryNetworkId)
    t.ok(res === undefined, 'received undefined when no valid ACCEPT message received')

    t.end()
})