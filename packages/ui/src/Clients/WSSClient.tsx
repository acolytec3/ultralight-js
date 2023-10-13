import { Box } from '@mui/material'
import { trpc } from '../utils/trpc'
import { useEffect, useReducer, useState } from 'react'
import Client from '../Components/Client'
import {
  ClientContext,
  ClientDispatchContext,
  ClientInitialState,
  ClientReducer,
} from '../Contexts/ClientContext'
import { RPCContext, RPCDispatchContext, RPCInitialState, RPCReducer, wsMethods } from '../Contexts/RPCContext'

export function WSSClient() {
  const [state, dispatch] = useReducer(ClientReducer, ClientInitialState)
  const [rpcState, rpcDispatch] = useReducer(RPCReducer, RPCInitialState)
  const [pong, setPong] = useState<any>()
  const [ready, setReady] = useState(false)
  const [listening, setListening] = useState({
    onTalkReq: false,
    onTalkResp: false,
    onSendTalkReq: false,
    onSendTalkResp: false,
    onContentAdded: false,
    onNodeAdded: false,
  })

  useEffect(() => {
    if (Object.values(listening).every((v) => v === true)) {
      setReady(true)
    }
  }, [listening])

  useEffect(() => {
    bootUP()
  }, [])

  const boot = ClientInitialState.RPC.ws.pingBootNodes.useMutation()
  const sendPing = ClientInitialState.RPC.ws.portal_historyPing.useMutation()
  const localRoutingTable = ClientInitialState.RPC.ws.portal_historyRoutingTableInfo.useMutation()

  const pingBootNodes = async () => {
    const bootnodeENRS = await boot.mutateAsync()
    getLocalRoutingTable()
    for (const bootnode of bootnodeENRS) {
      dispatch({
        type: 'BOOTNODES',
        nodeId: bootnode.nodeId,
        client: bootnode.c,
        enr: bootnode.enr,
        response: undefined,
      })
    }
  }
  trpc.onTalkReq.useSubscription(undefined, {
    onData(data: any) {
      console.log('Talk Request Received', data.topic)
      dispatch({
        type: 'LOG_RECEIVED',
        topic: data.topic,
        nodeId: data.nodeId,
        log: data.message,
      })
    },
    onStarted() {
      console.log('onTalkReq subscription started')
      setListening({ ...listening, onTalkReq: true })
    },
  })
  trpc.onTalkResp.useSubscription(undefined, {
    onData(data: any) {
      console.log('Talk Response Received', data.topic)
      dispatch({
        type: 'LOG_RECEIVED',
        topic: data.topic,
        nodeId: data.nodeId,
        log: data.message,
      })
    },
    onStarted() {
      console.log('onTalkResp subscription started')
      setListening({ ...listening, onTalkResp: true })
    },
  })
  trpc.onSendTalkReq.useSubscription(undefined, {
    onData(data: any) {
      console.log('sent talk request', data.topic)
      dispatch({
        type: 'LOG_SENT',
        topic: data.topic,
        nodeId: data.nodeId,
        log: data.payload,
      })
    },
    onStarted() {
      setListening({ ...listening, onSendTalkReq: true })
      console.log('onSendTalkReq subscription started', listening)
    },
  })
  trpc.onSendTalkResp.useSubscription(undefined, {
    onData(data: any) {
      console.log('sent talk response', data.topic)
      dispatch({
        type: 'LOG_SENT',
        topic: data.topic,
        nodeId: data.nodeId,
        log: data.payload,
      })
    },
    onStarted() {
      console.log('onSendTalkResp subscription started')
      setListening({ ...listening, onSendTalkResp: true })
    },
  })
  trpc.onContentAdded.useSubscription(undefined, {
    onData(data: any) {
      const type =
        data.contentType === 0
          ? 'BlockHeader'
          : data.contentType === 1
          ? 'BlockBody'
          : data.contentType === 2
          ? 'BlockReceipts'
          : data.contentType === 3
          ? 'EpochAccumulator'
          : 'unknown'
      dispatch({
        type: 'CONTENT_STORE',
        contentKey: '0x0' + data.contentType + data.key.slice(2),
        content: { type, added: new Date().toString().split(' ').slice(1, 5).join(' ') },
      })
    },
    onStarted() {
      console.log('onContentAdded subscription started')
      setListening({ ...listening, onContentAdded: true })
    },
  })

  trpc.onNodeAdded.useSubscription(undefined, {
    onData({ nodeId, protocolId }) {
      if (Object.keys(state.BOOTNODES).includes(nodeId)) {
        dispatch({
          type: 'BOOTNODES',
          nodeId,
          client: state.BOOTNODES[nodeId].client,
          enr: state.BOOTNODES[nodeId].enr,
          response: 'pong',
        })
      }
    },
    onStarted() {
      console.log('onNodeAdded subscription started')
      setListening({ ...listening, onNodeAdded: true })
    },
  })

  const ping = async (enr: string) => {
    setPong(undefined)
    const pong = await sendPing.mutateAsync({ enr })
    setPong(pong)
    getLocalRoutingTable()
  }

  const getLocalRoutingTable = async () => {
    const _peers = await localRoutingTable.mutateAsync()
    dispatch({
      type: 'ROUTING_TABLE',
      routingTable: _peers,
    })
  }
  const node = trpc.browser_nodeInfo.useMutation()
  const getSelf = async () => {
    const nodeInfo = await node.mutateAsync()
    dispatch({
      type: 'NODE_INFO',
      ...nodeInfo,
    })
  }

  const bootUP = () => {
    getSelf()
    pingBootNodes()
    getLocalRoutingTable()

    setInterval(() => {
      getLocalRoutingTable()
    }, 10000)
  }

  return (
    <ClientContext.Provider value={{ ...state, CONNECTION: 'ws', REQUEST: wsMethods }}>
      <ClientDispatchContext.Provider value={dispatch}>
        <RPCContext.Provider value={rpcState}>
          <RPCDispatchContext.Provider value={rpcDispatch}>
            <Box height={'100vh'} width={'100%'} style={{ wordBreak: 'break-word' }}>
              <Client ping={ping} pong={pong} name={'WebSockets Client'} />
            </Box>
          </RPCDispatchContext.Provider>
        </RPCContext.Provider>
      </ClientDispatchContext.Provider>
    </ClientContext.Provider>
  )
}
