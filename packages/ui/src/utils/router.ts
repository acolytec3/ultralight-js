import { initTRPC } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import EventEmitter from 'events'
import { z } from 'zod'
const t = initTRPC.create({
  allowOutsideOfServer: true,
})
const publicProcedure = t.procedure
const router = t.router

const demorows: [string, string, string, string, number][] = [['', '', '', '', -1]]

const onTalkReq = publicProcedure.subscription(({ input }) => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const talkReq = (msg: any) => {
      console.log(msg)
      emit.next(msg)
    }
    ee.on('talkReqReceived', (msg: any) => {
      console.log('talkRequestReceived')
      talkReq(msg)
    })
    return () => {
      ee.off('talkReqReceived', () => {
        console.log('off talkRequest')
        talkReq
      })
    }
  })
})

const onTalkResp = publicProcedure.subscription(({ input }) => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const talkResp = (msg: any) => {
      console.log('router', 'onTalkResp')
      emit.next(msg)
    }
    ee.on('talkRespReceived', (msg: any) => {
      console.log('talkResponseReceived')
      talkResp(msg)
    })
    return () => {
      ee.off('talkRespReceived', () => {
        console.log('off talkResponse')
        talkResp
      })
    }
  })
})
const onSendTalkReq = publicProcedure.subscription(({ input }) => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const sendTalkReq = (msg: any) => {
      console.log('router', 'onSendTalkReq')
      emit.next(msg)
    }
    ee.on('sendTalkReq', (msg: any) => {
      sendTalkReq(msg)
    })
    return () => {
      ee.off('sendTalkReq', (msg: any) => {
        sendTalkReq
      })
    }
  })
})
const onSendTalkResp = publicProcedure.subscription(({ input }) => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const sendTalkResp = (msg: any) => {
      emit.next(msg)
    }
    ee.on('sendTalkResp', (msg: any) => {
      sendTalkResp(msg)
    })
    return () => {
      ee.off('sendTalkReq', (msg: any) => {
        sendTalkResp
      })
    }
  })
})

const onContentAdded = publicProcedure.subscription(({ input }) => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const contentAdded = (msg: any) => {
      console.log(msg)
      emit.next(msg)
    }
    ee.on('ContentAdded', (msg: any) => {
      console.log('contentAdded')
      contentAdded(msg)
    })
    return () => {
      ee.off('ContentAdded', () => {
        console.log('off ContentAdded')
        contentAdded
      })
    }
  })
})
const onNodeAdded = publicProcedure.subscription(() => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const nodeAdded = (nodeId: string, protocolId: number) => {
      console.log('nodeAdded', { nodeId, protocolId })
      emit.next({
        nodeId,
        protocolId,
      })
    }
    ee.on('NodeAdded', (nodeId: string, protocolId: number) => {
      nodeAdded(nodeId, protocolId)
    })
    return () => {
      ee.off('NodeAdded', () => {
        nodeAdded
      })
    }
  })
})
const onUtp = publicProcedure.subscription(({ input }) => {
  const ee = new EventEmitter()
  return observable((emit) => {
    const utp = (msg: any) => {
      console.log(msg)
      emit.next(msg)
    }
    ee.on('utpEvent', (msg: any) => {
      console.log('utpEvent', msg)
      utp(msg)
    })
    return () => {
      ee.off('utpEvent', () => {
        console.log('off utpEvent')
        utp
      })
    }
  })
})

const browser_nodeInfo = publicProcedure.mutation(() => {
  return {
    enr: '',
    nodeId: '',
    client: '',
    multiAddr: '',
  }
})

const local_routingTable = publicProcedure
  .output(z.array(z.tuple([z.string(), z.string(), z.string(), z.string(), z.number()])))
  .mutation(() => {
    return demorows
  })

const browser_historyFindNodes = publicProcedure
  .input(
    z.object({
      nodeId: z.string(),
    }),
  )
  .mutation(async () => {
    return demorows
  })

const browser_historyFindContent = publicProcedure
  .input(
    z.object({
      nodeId: z.string(),
      contentKey: z.string(),
    }),
  )
  .mutation(async () => {
    return JSON.stringify({ key: 'value' })
  })
const browser_historyRecursiveFindContent = publicProcedure
  .input(
    z.object({
      contentKey: z.string(),
    }),
  )
  .mutation(async () => {
    return JSON.stringify({ key: 'value' })
  })
const browser_historyOffer = publicProcedure
  .input(
    z.object({
      nodeId: z.string(),
      contentKey: z.string(),
      content: z.string(),
    }),
  )
  .mutation(async () => {
    return true
  })

const browser_historySendOffer = publicProcedure
  .input(
    z.object({
      nodeId: z.string(),
      contentKeys: z.array(z.string()),
    }),
  )
  .mutation(async () => {
    return {
      result: '',
      response: [],
    }
  })

const browser_historyGossip = publicProcedure
  .input(
    z.object({
      contentKey: z.string(),
      content: z.string(),
    }),
  )
  .mutation(async () => {
    return 0
  })

const portal_historyRoutingTableInfo = publicProcedure.mutation(async () => {
  return {
    routingTable: [['']],
  }
})

const discv5_nodeInfo = publicProcedure
  .input(
    z.object({
      port: z.number(),
    }),
  )
  .mutation(async ({ input }) => {
    return {
      client: 'ultralight',
      enr: '',
      nodeId: '',
      multiAddr: '',
    }
  })

const ping = publicProcedure
  .input(
    z.object({
      enr: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
    const x = Math.random() >= 0.5
    const pong = x ? undefined : { customPayload: '', enrSeq: '' }
    return pong
  })
const pingBootNodes = publicProcedure
  .output(
    z.array(
      z.object({
        enr: z.string(),
        nodeId: z.string(),
        c: z.string(),
      }),
    ),
  )
  .mutation(async () => {
    return []
  })

const portal_historyPing = publicProcedure
  .input(
    z.object({
      port: z.number(),
      enr: z.string(),
    }),
  )
  .mutation(async () => {
    const x = Math.random() >= 0.5
    return [{ dataRadius: '', enrSeq: 1 }]
  })

const browser_historyStore = publicProcedure
  .input(
    z.object({
      contentKey: z.string(),
      content: z.string(),
    }),
  )
  .mutation(async () => {
    return true
  })
const browser_historyLocalContent = publicProcedure
  .input(
    z.object({
      contentKey: z.string(),
    }),
  )
  .mutation(async () => {
    return JSON.stringify({ key: 'value' })
  })

const pingBootNodeHTTP = publicProcedure.mutation(async () => {
  const x = Math.random() >= 0.5
  return [{ tag: '', enr: '', dataRadius: '', enrSeq: -1 }]
})

const decodeENR = publicProcedure
  .input(z.string())
  .output(
    z.object({
      nodeId: z.string(),
      c: z.string(),
      multiaddr: z.string(),
    }),
  )
  .mutation(async () => {
    return {
      nodeId: '',
      c: '',
      multiaddr: '',
    }
  })

const browser_ethGetBlockByHash = publicProcedure
  .input(
    z.object({
      hash: z.string(),
      includeTransactions: z.boolean(),
    }),
  )
  .output(z.union([z.undefined(), z.string(), z.record(z.string(), z.string())]))
  .mutation(({ input }) => {
    return undefined
  })

const browser_ethGetBlockByNumber = publicProcedure
  .input(
    z.object({
      blockNumber: z.string(),
      includeTransactions: z.boolean(),
    }),
  )
  .output(z.union([z.undefined(), z.string(), z.record(z.string(), z.string())]))
  .mutation(({ input }) => {
    return undefined
  })

export const appRouter = router({
  decodeENR,
  onTalkReq,
  onTalkResp,
  onSendTalkReq,
  onSendTalkResp,
  onContentAdded,
  onNodeAdded,
  onUtp,
  browser_nodeInfo,
  local_routingTable,
  ping,
  pingBootNodes,
  discv5_nodeInfo,
  portal_historyRoutingTableInfo,
  portal_historyPing,
  browser_historyLocalContent,
  browser_historyStore,
  pingBootNodeHTTP,
  browser_historyFindNodes,
  browser_historyFindContent,
  browser_historyRecursiveFindContent,
  browser_historyOffer,
  browser_historySendOffer,
  browser_historyGossip,
  browser_ethGetBlockByHash,
  browser_ethGetBlockByNumber,
})

export type AppRouter = typeof appRouter
