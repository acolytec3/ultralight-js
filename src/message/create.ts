import { randomBytes } from "bcrypto/lib/random";
import { toBigIntBE } from "bigint-buffer";

import {
  RequestId,
  IPingMessage,
  MessageType,
  IPongMessage,
  IFindNodeMessage,
  INodesMessage,
  ITalkReqMessage,
  ITalkRespMessage,
} from "./types";
import { SequenceNumber, ENR } from "../enr";

export function createRequestId(): RequestId {
  return toBigIntBE(randomBytes(8));
}

export function createPingMessage(enrSeq: SequenceNumber): IPingMessage {
  return {
    type: MessageType.PING,
    id: createRequestId(),
    enrSeq,
  };
}

export function createPongMessage(
  id: RequestId,
  enrSeq: SequenceNumber,
  recipientIp: string,
  recipientPort: number
): IPongMessage {
  return {
    type: MessageType.PONG,
    id,
    enrSeq,
    recipientIp,
    recipientPort,
  };
}

export function createFindNodeMessage(distances: number[]): IFindNodeMessage {
  return {
    type: MessageType.FINDNODE,
    id: createRequestId(),
    distances,
  };
}

export function createNodesMessage(id: RequestId, total: number, enrs: ENR[]): INodesMessage {
  return {
    type: MessageType.NODES,
    id,
    total,
    enrs,
  };
}

export function createTalkRequestMessage(request: string | Buffer, protocol: string): ITalkReqMessage {
  return {
    type: MessageType.TALKREQ,
    id: createRequestId(),
    protocol: Buffer.from(protocol.toString()),
    request: Buffer.from(request),
  };
}
export function createTalkResponseMessage(request: ITalkReqMessage, payload: Buffer): ITalkRespMessage {
  return {
    type: MessageType.TALKRESP,
    id: request.id,
    response: payload,
  };
}
