import {
  ENR,
  fromHexString,
  HistoryNetworkContentKeyUnionType,
  HistoryNetworkContentTypes,
  HistoryProtocol,
  reassembleBlock,
} from 'portalnetwork'
import { PeerContextType, PeerDispatch, PeerState, PeerStateChange } from './peerReducer'

export class PeerActions {
  state: PeerState
  dispatch: PeerDispatch
  historyProtocol: HistoryProtocol
  constructor(peerContext: PeerContextType, protocol: HistoryProtocol) {
    this.state = peerContext.peerState
    this.dispatch = peerContext.peerDispatch
    this.historyProtocol = protocol
  }

  addToOffer = (type: string): Uint8Array[] => {
    switch (type) {
      case 'header':
        return [
          HistoryNetworkContentKeyUnionType.serialize({
            selector: HistoryNetworkContentTypes.BlockHeader,
            value: {
              chainId: 1,
              blockHash: fromHexString(this.state.blockHash),
            },
          }),
        ]
      case 'body':
        return [
          HistoryNetworkContentKeyUnionType.serialize({
            selector: HistoryNetworkContentTypes.BlockBody,
            value: {
              chainId: 1,
              blockHash: fromHexString(this.state.blockHash),
            },
          }),
        ]

      case 'block':
        return [
          HistoryNetworkContentKeyUnionType.serialize({
            selector: HistoryNetworkContentTypes.BlockHeader,
            value: {
              chainId: 1,
              blockHash: fromHexString(this.state.blockHash),
            },
          }),
          HistoryNetworkContentKeyUnionType.serialize({
            selector: HistoryNetworkContentTypes.BlockBody,
            value: {
              chainId: 1,
              blockHash: fromHexString(this.state.blockHash),
            },
          }),
        ]
      default:
        throw new Error()
    }
  }

  handlePing = async (enr: string) => {
    this.dispatch({ type: PeerStateChange.PING, payload: ['yellow.200', 'PINGING'] })
    setTimeout(async () => {
      const pong = await this.historyProtocol.sendPing(ENR.decodeTxt(enr))
      if (pong) {
        this.dispatch({ type: PeerStateChange.PING, payload: ['green.200', 'PONG RECEIVED!'] })
        setTimeout(() => {
          this.dispatch({ type: PeerStateChange.PING, payload: ['blue.200', 'PING'] })
        }, 1500)
      } else {
        this.dispatch({ type: PeerStateChange.PING, payload: ['red.200', 'PING FAILED'] })
        setTimeout(() => {
          this.dispatch({ type: PeerStateChange.PING, payload: ['blue.200', 'PINGING'] })
        }, 1000)
      }
    }, 500)
  }

  handleFindNodes = (peer: ENR) => {
    this.historyProtocol!.sendFindNodes(peer.nodeId, [parseInt(this.state.distance)])
  }

  handleRequestSnapshot = (enr: string) => {
    const accumulatorKey = HistoryNetworkContentKeyUnionType.serialize({
      selector: 4,
      value: { selector: 0, value: null },
    })
    this.historyProtocol!.sendFindContent(ENR.decodeTxt(enr).nodeId, accumulatorKey)
  }

  handleOffer = (enr: string) => {
    this.historyProtocol!.sendOffer(ENR.decodeTxt(enr).nodeId, this.state.offer)
  }
  sendFindContent = async (type: string, enr: string) => {
    if (type === 'header') {
      const headerKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 0,
        value: {
          chainId: 1,
          blockHash: fromHexString(this.state.blockHash),
        },
      })
      const header = await this.historyProtocol!.sendFindContent(
        ENR.decodeTxt(enr).nodeId,
        headerKey
      )
      const block = reassembleBlock(header!.value as Uint8Array, undefined)
      return block //
    } else if (type === 'body') {
      const headerKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 0,
        value: {
          chainId: 1,
          blockHash: fromHexString(this.state.blockHash),
        },
      })
      this.historyProtocol!.sendFindContent(ENR.decodeTxt(enr).nodeId, headerKey)
      const bodyKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 1,
        value: {
          chainId: 1,
          blockHash: fromHexString(this.state.blockHash),
        },
      })
      this.historyProtocol!.sendFindContent(ENR.decodeTxt(enr).nodeId, bodyKey)
    } else if (type === 'block') {
      const headerKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 0,
        value: {
          chainId: 1,
          blockHash: fromHexString(this.state.blockHash),
        },
      })
      const bodyKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 1,
        value: {
          chainId: 1,
          blockHash: fromHexString(this.state.blockHash),
        },
      })
      try {
        const header = (
          await this.historyProtocol!.sendFindContent(ENR.decodeTxt(enr).nodeId, headerKey)
        )?.value as Uint8Array
        const _body = await this.historyProtocol!.sendFindContent(
          ENR.decodeTxt(enr).nodeId,
          bodyKey
        )
        const body: Uint8Array | undefined =
          _body !== undefined ? (_body.value as Uint8Array) : undefined
        const block = reassembleBlock(header, body)
        return block // this.dispatch({ type: StateChange.SETBLOCK, payload: block })
      } catch {}
    } else if (type === 'epoch') {
      const _epochKey = HistoryNetworkContentKeyUnionType.serialize({
        selector: 3,
        value: {
          chainId: 1,
          blockHash: this.historyProtocol!.accumulator.historicalEpochs()[this.state.epoch],
        },
      })
    }
  }
}
