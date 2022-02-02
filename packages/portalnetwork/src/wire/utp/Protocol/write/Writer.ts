import { log } from 'debug'
import { UtpProtocol } from '..'
import { Packet, TWO_MINUTES, _UTPSocket } from '../..'
// import { UtpWriteFuture, UtpWriteFutureImpl } from "./UtpWriteFuture";

const _MIN_RTO = TWO_MINUTES
export default class Writer {
  utp: UtpProtocol
  socket: _UTPSocket
  content: Uint8Array
  contentMod: Uint8Array
  writing: boolean
  finished: boolean
  canSendNextPacket: boolean
  // timedoutPackets: Packet[];
  // waitingTime: number;
  // rto: number;
  timestamp: number
  sentBytes: Map<Packet, Uint8Array>
  constructor(utp: UtpProtocol, socket: _UTPSocket, content: Uint8Array, timestamp: number) {
    this.socket = socket
    this.utp = utp
    this.timestamp = timestamp
    this.content = content
    this.contentMod = this.content
    this.writing = false
    this.finished = false
    this.canSendNextPacket = true
    // this.timedoutPackets = [];
    this.sentBytes = new Map<Packet, Uint8Array>()
    // this.waitingTime = 0;
    // this.rto = 0
  }

  async start(): Promise<void> {
    log(`starting to write`, this.content)
    this.writing = this.content && true
    while (this.writing) {
      while (this.canSendNextPacket && !this.finished) {
        // let size = this.nextPacketSize();
        const bytes = this.getNextBytes(this.contentMod)
        this.socket.sendDataPacket(bytes).then((p: Packet) => {
          // this.socket.seqNrs.push(p.header.seqNr)
          this.sentBytes.set(p, bytes)
        })
        if (this.contentMod.length == 0) {
          this.canSendNextPacket = false
          this.finished = true
          this.writing = false
          log('All Data Written')
          return
        }
      }
    }
  }

  nextPacketSize(): number {
    return this.contentMod.length > 900 ? 900 : this.contentMod.length
  }

  getNextBytes(array: Uint8Array, _idx: number = 100): Uint8Array {
    const next = array.subarray(0, 500)
    const rest = array.slice(500)
    log(`sending ${next.length} bytes...`)
    log(`${rest.length} bytes left`)
    this.setContentMod(rest)
    return next
  }

  setContentMod(subArray: Uint8Array) {
    this.contentMod = subArray
  }

  // getNextPacket(): Packet {
  //   return this.timedoutPackets.shift() as Packet;
  // }

  // calculateRTO(p: Packet) {
  //     this.socket.rtt_var += 0.25 * (Math.abs(this.socket.rtt - p.header.timestampDiff) - this.socket.rtt_var)
  //     this.socket.rtt += 0.125 * (p.header.timestampDiff - this.socket.rtt)
  //     this.rto = Math.max(MIN_RTO, this.socket.rtt + this.socket.rtt_var * 4)
  // }

  // sendPacket(p: Packet) {
  //     this.socket.sendPacket(p, PacketType.ST_DATA)
  // }

  // markPacketOnFly(p: Packet) {}

  // waitAndProcessAcks() {}

  // write() {
  //   while (this.writing) {
  //     while (this.canSendNextPacket) {
  //       let p = this.getNextPacket();
  //       this.sendPacket(p);
  //       this.markPacketOnFly(p);
  //     }
  //     this.waitAndProcessAcks();
  //     this.timedoutPackets.forEach((p) => {
  //       this.sendPacket(p);
  //     });
  //   }
  // }
}
