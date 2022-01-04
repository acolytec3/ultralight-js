import { UINT16MAX } from '../..'
import { IOException } from '../../Utils/exceptions'
import { UtpPacketDTO } from '../../Packets/UtpPacketDTO'
import { SelectiveAckHeaderExtension } from '../../Packets/Extentions'

export class SkippedPacketBuffer {
  SIZE: number
  buffer: (UtpPacketDTO | null)[]
  expectedSequenceNumber: number
  elementCount: number
  debug_lastSeqNumber: number | null
  debug_lastPosition: number | null

  constructor() {
    this.SIZE = 2000
    this.buffer = new Array(this.SIZE)
    this.expectedSequenceNumber = 0
    this.elementCount = 0
    this.debug_lastSeqNumber = null
    this.debug_lastPosition = null
  }

  bufferPacket(pkt: UtpPacketDTO) {
    const sequenceNumber = pkt.utpPacket.header.seqNr
    let position = sequenceNumber - this.expectedSequenceNumber
    this.debug_lastSeqNumber = sequenceNumber
    if (position < 0) {
      position = this.mapOverflowPosition(sequenceNumber)
    }
    this.debug_lastPosition = position
    this.elementCount++
    try {
      this.buffer[position] = pkt
    } catch (err) {
      if (err instanceof IOException) {
        // eslint-disable-next-line no-console
        console.error(`seq: ${sequenceNumber} exp: ${this.expectedSequenceNumber}`)
        err.printStackTrace()
        this.dumpBuffer(`oob: ${err.getMessage()}`)
        throw new IOException()
      }
    }
  }

  mapOverflowPosition(sequenceNumber: number) {
    const position = UINT16MAX - this.expectedSequenceNumber - sequenceNumber
    return position
  }

  setExpectedSequenceNumber(sequenceNumber: number) {
    this.expectedSequenceNumber = sequenceNumber
  }

  calculateHeaderExtension() {}

  createHeaderExtension() {
    const length = this.calculateHeaderLength()
    const bitMask = new Uint8Array(length)
    const header = new SelectiveAckHeaderExtension(bitMask)
    this.fillBitMask(bitMask)
    header.bitmask = bitMask

    return header
  }

  fillBitMask(bitMask: Uint8Array) {
    let bitMaskIndex = 0
    for (let i = 0; i < this.SIZE; i++) {
      const bitMapIndex = (i - 1) % 8
      const hasReceived = this.buffer[i] != null
      if (hasReceived) {
        const bitPattern = SelectiveAckHeaderExtension.BITMAP[bitMapIndex]
        bitMask[bitMaskIndex] = (bitMask[bitMaskIndex] & 0xff) | bitPattern
      }
      if (i % 8 == 0) {
        bitMaskIndex++
      }
    }
  }

  calculateHeaderLength() {
    const size: number = this.getRange()
    return ((size - 1) / 32 + 1) * 4
  }

  getRange(): number {
    let range = 0
    for (let i = 0; i < this.SIZE; i++) {
      if (this.buffer[i] != null) {
        range = i
      }
    }
    return range
  }

  isEmpty(): boolean {
    return this.elementCount == 0
  }

  getAllUntillNextMissing() {
    const queue: UtpPacketDTO[] = []
    for (let i = 1; i < this.SIZE; i++) {
      if (this.buffer[i] != null) {
        queue.push(this.buffer[i] as UtpPacketDTO)
        this.buffer[i] = null
      } else {
        break
      }
    }
    return queue
  }

  reindex(lastSeqNumber: number) {
    let expectedSequenceNumber = 0
    if (lastSeqNumber == UINT16MAX) {
      expectedSequenceNumber = 1
    } else {
      expectedSequenceNumber = lastSeqNumber + 1
    }
    this.setExpectedSequenceNumber(expectedSequenceNumber)
    const oldBuffer = [...this.buffer.values()]
    this.buffer = new Array(this.SIZE)
    this.elementCount = 0
    oldBuffer.forEach((utpPacket) => {
      if (utpPacket != null) {
        this.bufferPacket(utpPacket)
      }
    })
  }

  getFreeSize() {
    if (this.SIZE - this.elementCount < 0) {
      this.dumpBuffer('freesize negative')
    }
    if (this.SIZE - this.elementCount < 50) {
      return 0
    }
    return this.SIZE - this.elementCount - 1
  }

  dumpBuffer(string: string) {
    // eslint-disable-next-line no-console
    console.log('dumping buffer' + string)
  }
}
