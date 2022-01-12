import { protocolVersion, PacketType, IPacketOptions } from './PacketTyping'
import { PacketHeader } from './PacketHeader'
import { SelectiveAckHeader, Uint16, Uint32 } from '.'
import { debug } from 'debug'
import { Bytes32TimeStamp } from '..'

const log = debug('<uTP>')

export function packetToBuffer(packet: Packet): Buffer {
  const buffer = Buffer.alloc(packet.header.length)
  const p = packet.header.pType.toString(16)
  const v = packet.header.version.toString(16)
  const pv = p + v
  const typeAndVer = parseInt(pv, 16)

  buffer.writeUInt8(typeAndVer, 0)
  buffer.writeUInt8(packet.header.extension, 1)
  buffer.writeUInt16BE(packet.header.connectionId, 2)
  buffer.writeUInt32BE(packet.header.timestamp, 4)
  buffer.writeUInt32BE(packet.header.timestampDiff, 8)
  buffer.writeUInt32BE(packet.header.wndSize, 12)
  buffer.writeUInt16BE(packet.header.seqNr, 16)
  buffer.writeUInt16BE(packet.header.ackNr, 18)
  if (packet.header.extension === 1) {
    const p = packet.header as SelectiveAckHeader
    buffer.writeUInt8(p.selectiveAckExtension.type, 20)
    buffer.writeUInt8(p.selectiveAckExtension.len, 21)
    p.selectiveAckExtension.bitmask.forEach((uint8, idx) => {
      buffer.writeUInt8(uint8, 22 + idx)
    })
  }
  if (packet.payload) {
    return Buffer.concat([buffer, Buffer.from(packet.payload)])
  }
  return buffer
}

export class Packet {
  header: PacketHeader | SelectiveAckHeader
  payload: Uint8Array
  sent: number
  size: number
  extensions: any[]
  constructor(options: IPacketOptions) {
    this.header = options.header
    this.payload = options.payload
    this.sent = 0
    this.size = this.header.length + this.payload.length
    this.extensions = []
  }

  getExtensions() {
    return this.extensions
  }

  encodePacket(): Buffer {
    // TODO - bring packetToBuffer code in here and remove separate helper function?
    const buffer = packetToBuffer(this)
    return buffer
  }
}

export function createSynPacket(rcvConnectionId: Uint16, seqNr: Uint16, ackNr?: number): Packet {
  const h: PacketHeader = new PacketHeader({
    pType: PacketType.ST_SYN,
    connectionId: rcvConnectionId,
    seqNr: seqNr,
    ackNr: ackNr ?? 0,
  })
  log('Creating ST_SYN Packet...')
  const packet: Packet = new Packet({ header: h, payload: new Uint8Array() })
  return packet
}
export function createAckPacket(
  seqNr: Uint16,
  sndConnectionId: Uint16,
  ackNr: Uint16,
  rtt_var: number,
  wndSize: number
): Packet {
  const h: PacketHeader = new PacketHeader({
    pType: PacketType.ST_STATE,
    connectionId: sndConnectionId,
    seqNr: seqNr,
    ackNr: ackNr,
    wndSize: wndSize,
    timestampDiff: rtt_var,
  })

  log('Creating ST_STATE Packet...')
  const packet: Packet = new Packet({ header: h, payload: new Uint8Array(0) })
  return packet
}
export function createSelectiveAckPacket(
  seqNr: Uint16,
  sndConnectionId: Uint16,
  ackNr: Uint16,
  rtt_var: number,
  wndSize: number
): Packet {
  const h: SelectiveAckHeader = new SelectiveAckHeader(
    {
      pType: PacketType.ST_STATE,
      connectionId: sndConnectionId,
      seqNr: seqNr,
      ackNr: ackNr,
      wndSize: wndSize,
      timestampDiff: rtt_var,
    },
    new Uint8Array(1)
  )

  log('Creating ST_STATE Packet...')
  const packet: Packet = new Packet({ header: h, payload: new Uint8Array(0) })
  return packet
}

export function createDataPacket(
  seqNr: Uint16,
  sndConnectionId: Uint16,
  ackNr: Uint16,
  bufferSize: Uint32,
  payload: Uint8Array,
  rtt_var: number
): Packet {
  const h: PacketHeader = new PacketHeader({
    pType: PacketType.ST_DATA,
    version: protocolVersion,
    extension: 0,
    connectionId: sndConnectionId,
    timestampDiff: rtt_var,
    wndSize: bufferSize,
    seqNr: seqNr,
    ackNr: ackNr,
  })
  const packet: Packet = new Packet({ header: h, payload: payload })
  log('Creating ST_DATA Packet...')
  return packet
}
export function createResetPacket(seqNr: Uint16, sndConnectionId: Uint16, ackNr: Uint16): Packet {
  const h = new PacketHeader({
    pType: PacketType.ST_RESET,
    version: protocolVersion,
    extension: 0,
    connectionId: sndConnectionId,
    timestamp: Date.now(),
    timestampDiff: 0,
    wndSize: 0,
    seqNr: seqNr,
    ackNr: ackNr,
  })
  log('Creating ST_RESET Packet...')
  return new Packet({ header: h, payload: new Uint8Array() })
}
export function createFinPacket(
  connectionId: Uint16,
  seqNr: number,
  ackNr: number,
  wndSize: number
): Packet {
  const h = new PacketHeader({
    pType: PacketType.ST_FIN,
    version: protocolVersion,
    extension: 0,
    connectionId: connectionId,
    timestamp: Bytes32TimeStamp(),
    timestampDiff: 0,
    wndSize: wndSize,
    seqNr: seqNr,
    ackNr: ackNr,
  })
  log('Creating ST_FIN Packet...')
  return new Packet({ header: h, payload: new Uint8Array() })
}
export function bufferToPacket(buffer: Buffer): Packet {
  const ptandver = buffer[0].toString(16)
  const ver = ptandver[1]
  const version = parseInt(ver, 16)
  //const extension = buffer.readUInt8(1)
  //let packet: Packet
  // if (extension === 1) {
  //   let size = buffer.readUInt8(21);
  //   packet = new Packet({
  //     header: new SelectiveAckHeader(
  //       {
  //         pType: buffer[0] >> 4,
  //         version: version,
  //         extension: buffer.readUInt8(1),
  //         connectionId: buffer.readUInt16BE(2),
  //         timestamp: buffer.readUInt32BE(4),
  //         timestampDiff: buffer.readUInt32BE(8),
  //         wndSize: buffer.readUInt32BE(12),
  //         seqNr: buffer.readUInt16BE(16),
  //         ackNr: buffer.readUInt16BE(18),
  //       },
  //       buffer.subarray(22, 22 + size)
  //     ),
  //     payload: buffer.subarray(22 + size),
  //   });
  // }

  // else {
  const packet = new Packet({
    header: new PacketHeader({
      pType: buffer[0] >> 4,
      version: version,
      extension: buffer.readUInt8(1),
      connectionId: buffer.readUInt16BE(2),
      timestamp: buffer.readUInt32BE(4),
      timestampDiff: buffer.readUInt32BE(8),
      wndSize: buffer.readUInt32BE(12),
      seqNr: buffer.readUInt16BE(16),
      ackNr: buffer.readUInt16BE(18),
    }),
    payload: buffer.subarray(20),
  })

  return packet
}

export * from './PacketTyping'
