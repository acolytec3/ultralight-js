import {
  ContainerType,
  ByteVectorType,
  UintBigintType,
  ByteListType,
  UintNumberType,
  BitListType,
  UnionType,
  ListBasicType,
  ListCompositeType,
  BitArray,
} from '@chainsafe/ssz'

// Subnetwork IDs
export enum SubNetworkIds {
  StateNetwork = '0x500a',
  HistoryNetwork = '0x500b',
  TxGossipNetwork = '0x500c',
  HeaderGossipNetwork = '0x500d',
  CanonicalIndicesNetwork = '0x500e',
  UTPNetwork = '0x757470',
  Rendezvous = '0x72656e',
}

// Ping/Pong Custom Data type -- currently identical for State and History networks
export const PingPongCustomDataType = new ContainerType({
  radius: new UintBigintType(32),
})

export type PingPongCustomData = Uint8Array

// Wire Protocol Message Codes
export enum MessageCodes {
  PING = 0x00,
  PONG = 0x01,
  FINDNODES = 0x02,
  NODES = 0x03,
  FINDCONTENT = 0x04,
  CONTENT = 0x05,
  OFFER = 0x06,
  ACCEPT = 0x07,
}

// Type Aliases
export const ByteList = new ByteListType(2048)
export const Bytes2 = new ByteVectorType(2)
export const ENRs = new ListCompositeType(ByteList, 32)
export type PingMessage = {
  enrSeq: bigint
  customPayload: PingPongCustomData
}

export type PongMessage = {
  enrSeq: bigint
  customPayload: PingPongCustomData
}

export const PingMessageType = new ContainerType({
  enrSeq: new UintBigintType(8),
  customPayload: ByteList,
})

export const PongMessageType = new ContainerType({
  enrSeq: new UintBigintType(8),
  customPayload: ByteList,
})

export type FindNodesMessage = {
  distances: number[]
}

export const FindNodesMessageType = new ContainerType({
  distances: new ListBasicType(new UintNumberType(2), 256),
})

export type NodesMessage = {
  total: number
  enrs: Uint8Array[]
}

export const NodesMessageType = new ContainerType({
  total: new UintNumberType(1),
  enrs: ENRs,
})

export type FindContentMessage = {
  contentKey: Uint8Array
}

export const FindContentMessageType = new ContainerType({
  contentKey: ByteList,
})

export type ContentMessage = {
  content: Uint8Array | Uint8Array[]
}

export type connectionId = Uint8Array

export type content = Uint8Array

export type enrs = Uint8Array[]

export const ContentMessageType = new UnionType([Bytes2, ByteList, ENRs])
export type OfferMessage = {
  contentKeys: Uint8Array[]
}

export const OfferMessageType = new ContainerType({
  contentKeys: new ListCompositeType(ByteList, 64),
})

export type AcceptMessage = {
  connectionId: Uint8Array
  contentKeys: BitArray
}

export const AcceptMessageType = new ContainerType({
  connectionId: Bytes2,
  contentKeys: new BitListType(64),
})

export type MessageTypeUnion = [
  | PingMessage
  | PongMessage
  | FindNodesMessage
  | NodesMessage
  | FindContentMessage
  | ContentMessage
  | OfferMessage
  | AcceptMessage
]
export const PortalWireMessageType = new UnionType([
  PingMessageType,
  PongMessageType,
  FindNodesMessageType,
  NodesMessageType,
  FindContentMessageType,
  ContentMessageType,
  OfferMessageType,
  AcceptMessageType,
])
