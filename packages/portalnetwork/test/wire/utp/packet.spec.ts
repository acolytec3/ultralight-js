import { toBuffer } from '@chainsafe/discv5'
import { BitVectorType, fromHexString, toHexString } from '@chainsafe/ssz'
import tape from 'tape'
import {
  Packet,
  PacketHeader,
  PacketOptions,
  PacketType,
  SelectiveAckHeader,
} from '../../../src/index.js'

export const dataPacketTestPayload = fromHexString(
  '0x010004d20e710cbf00000064000001f4007b15b3c190c9463327a10f8c5a48a02f956738979f317668d58cd0bd57c29aa4b60717f476a7ec41d650d04f62d38504ad29f27392b2b8b0f075a391234132e2bd4932c151b6cad2c5e3300e36149d1ba7d6511b9b6aa8a6e37ba1f8e9474fa5f772c4d43d62fd2a277dc3bd70a55337c96a988aa3ea2dcd9bd834ced9dc20814d454e6349eb5f82a5f481a06b27d77f2b02a3795f86fc264b17cc41b7d3ad20a401324909d2e896ddb3e79fe7ed87904564968196ae7becc332e6456cbaa1892e06cacf667f2d94787361de936157e4dd648895e990cec3e57a76c44fe4d41ad247f1dfcce7d242fa7d3575ce40b886e49096c0ed7738966500e23048297d2a9a7dbd17947824a4f5d73ff3a1dd20e7f7f4ff5a3787934ab4e8d8ded5a84113c9160be4d6b7908b40ccd9facf1631950db591e35b50fe285cfe5df141b6c7f5e65a0e434c3dd0d1a070c6f29ef7236770f218b70ceacc79cd0cb2826e0df8262eeb03c4a566221e776ea080ac7972ab71fdd8a3247c00d8fd198fe42673a974cdebb66d5ba77d99347866027b1770560619e3ebb9ad36f62e105a2cee87f276171a2b248df21d66b23dd19b745eecd59626eb98b9b357be872eb480711623fa702483cc2791a60280c5fc9f8ec6a6d0e75935d87512daa68fd9ab4340fddf027365c938336769339a8f8449d70c2cf7c55444f5e0c355'
)

export type testParams = {
  // type: PacketType
  data: PacketOptions<PacketType>
  expectedResult: string
}

export const packetTestData: Record<string, testParams> = {
  syn: {
    data: {
      header: {
        pType: PacketType.ST_SYN,
        version: 1,
        extension: 0,
        connectionId: 10049,
        timestampMicroseconds: 3384187322,
        timestampDifferenceMicroseconds: 0,
        wndSize: 1048576,
        seqNr: 11884,
        ackNr: 0,
      },
    },
    expectedResult: '0x41002741c9b699ba00000000001000002e6c0000',
  },
  ack: {
    data: {
      header: {
        pType: PacketType.ST_STATE,
        version: 1,
        extension: 0,
        connectionId: 10049,
        timestampMicroseconds: 6195294,
        timestampDifferenceMicroseconds: 916973699,
        wndSize: 1048576,
        seqNr: 16807,
        ackNr: 11885,
      },
    },
    expectedResult: '0x21002741005e885e36a7e8830010000041a72e6d',
  },
  selectiveAck: {
    data: {
      header: {
        pType: PacketType.ST_STATE,
        version: 1,
        extension: 1,
        connectionId: 10049,
        timestampMicroseconds: 6195294,
        timestampDifferenceMicroseconds: 916973699,
        wndSize: 1048576,
        seqNr: 16807,
        ackNr: 11885,
        bitmask: Uint8Array.from([1, 0, 0, 128]),
      },
    },
    expectedResult: '0x21012741005e885e36a7e8830010000041a72e6d000401000080',
  },
  data: {
    data: {
      header: {
        pType: PacketType.ST_DATA,
        version: 1,
        extension: 0,
        connectionId: 26237,
        timestampMicroseconds: 252492495,
        timestampDifferenceMicroseconds: 242289855,
        wndSize: 1048576,
        seqNr: 8334,
        ackNr: 16806,
      },
      payload: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    },
    expectedResult: '0x0100667d0f0cbacf0e710cbf00100000208e41a600010203040506070809',
  },
  fin: {
    data: {
      header: {
        pType: PacketType.ST_FIN,
        version: 1,
        extension: 0,
        connectionId: 19003,
        timestampMicroseconds: 515227279,
        timestampDifferenceMicroseconds: 511481041,
        wndSize: 1048576,
        seqNr: 41050,
        ackNr: 16806,
      },
    },
    expectedResult: '0x11004a3b1eb5be8f1e7c94d100100000a05a41a6',
  },
  reset: {
    data: {
      header: {
        pType: PacketType.ST_RESET,
        version: 1,
        extension: 0,
        connectionId: 62285,
        timestampMicroseconds: 751226811,
        timestampDifferenceMicroseconds: 0,
        wndSize: 0,
        seqNr: 55413,
        ackNr: 16807,
      },
    },
    expectedResult: '0x3100f34d2cc6cfbb0000000000000000d87541a7',
  },
}

// 1. Create Packet with test data
// 2. Encode Packet with packet type encoder
// 3. Decode Packet with fromBuffer()
// 4. Compare test-data / created packet / decoded packet

export function encodingTest(
  t: tape.Test,
  testData: PacketOptions<any>,
  expectedResult: string,
  selective?: boolean
) {
  const packetType = testData.header.pType
  t.test(`${PacketType[packetType]} packet encoding test.`, (st) => {
    const testPacket = Packet.fromOpts(testData)
    st.deepEqual(
      {
        pType: testPacket.header.pType,
        version: testPacket.header.version,
        extension: testPacket.header.extension,
        connectionId: testPacket.header.connectionId,
        timestampMicroseconds: testPacket.header.timestampMicroseconds,
        timestampDifferenceMicroseconds: testPacket.header.timestampDifferenceMicroseconds,
        wndSize: testPacket.header.wndSize,
        seqNr: testPacket.header.seqNr,
        ackNr: testPacket.header.ackNr,
      },
      {
        pType: testData.header.pType,
        version: testData.header.version,
        extension: testData.header.extension,
        connectionId: testData.header.connectionId,
        timestampMicroseconds: testData.header.timestampMicroseconds,
        timestampDifferenceMicroseconds: testData.header.timestampDifferenceMicroseconds,
        wndSize: testData.header.wndSize,
        seqNr: testData.header.seqNr,
        ackNr: testData.header.ackNr,
      },
      'Packet.fromOpts test passed'
    )
    if ('bitmask' in testData.header) {
      st.deepEqual(
        (testPacket.header as any).bitmask,
        testData.header.bitmask,
        'Packet.bitmask test passed'
      )
    }
    const encodedPacket = testPacket.encode()
    st.equal(toHexString(encodedPacket), expectedResult, 'Packet encoding test passed')
    const testHeader = testPacket.header
    const decodedPacket = Packet.fromBuffer(Buffer.from(expectedResult.slice(2), 'hex'))
    const decodedHeader = decodedPacket.header
    st.equal(
      Object.entries(decodedHeader).toString(),
      Object.entries(testHeader).toString(),
      `Packet.fromBuffer(expectedResult) successfully rebuilt Test Packet`
    )
    const decodedEncoded = Packet.fromBuffer(encodedPacket)
    st.equal(
      Object.entries(decodedEncoded.header).toString(),
      Object.entries(testHeader).toString(),
      `Successfully encoded and decoded GENERTED ${PacketType[packetType]} packet`
    )
    // if (selective) {
    //   st.deepEqual(
    //     Uint8Array.from((decodedHeader as SelectiveAckHeader).selectiveAckExtension.bitmask),
    //     Uint8Array.from((testHeader as SelectiveAckHeader).selectiveAckExtension.bitmask),
    //     `sucessfully encoded and decoded Selective Ack Bitmask`
    //   )
    //   const bm = new BitVectorType(32).deserialize(
    //     (decodedHeader as SelectiveAckHeader).selectiveAckExtension.bitmask
    //   )
    //   st.equal(bm.bitLen, 32, 'Bitmask is 32 bits')
    // }
    if (packetType === PacketType.ST_DATA) {
      st.equal(
        toHexString(Buffer.from(testData.payload!)),
        toHexString(Buffer.from(Uint8Array.from(decodedPacket.payload!))),
        `Successfully encoded and decoded DATA Packet payload.`
      )
    }

    st.end()
  })
}

tape('uTP packet tests', (t) => {
  // t.throws(() => {
  //   Packet.fromOpts({
  //     header: { seqNr: 1, ackNr: 1, timestampMicroseconds: Bytes32TimeStamp(), wndSize: 14508 },
  //   })
  // }, 'Packet.fromOpts should throw on invalid Packet Type')
  Object.values(packetTestData).map((packetData) => {
    encodingTest(t, packetData.data, packetData.expectedResult, 'bitmask' in packetData.data.header)
  })
  t.end()
})
