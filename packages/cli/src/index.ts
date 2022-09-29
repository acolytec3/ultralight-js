import * as fs from 'fs'
import { PortalNetwork, ProtocolId, ENR, fromHexString } from 'portalnetwork'
import type { PeerId } from '@libp2p/interface-peer-id'
import { Multiaddr, multiaddr } from '@multiformats/multiaddr'
import yargs from 'yargs/yargs'
// eslint-disable-next-line node/file-extension-in-import
import { hideBin } from 'yargs/helpers'
import jayson from 'jayson/promise/index.js'
import http from 'http'
import * as PromClient from 'prom-client'
import debug from 'debug'
import { RPCManager } from './rpc.js'
import { setupMetrics } from './metrics.js'
import { Level } from 'level'
import { createFromProtobuf, createSecp256k1PeerId } from '@libp2p/peer-id-factory'

const args: any = yargs(hideBin(process.argv))
  .option('pk', {
    describe: 'base64 string encoded protobuf serialized private key',
    string: true,
  })
  .option('bootnode', {
    describe: 'ENR of Bootnode',
    string: true,
  })
  .option('bindAddress', {
    describe: 'initial IP address and UDP port to bind to',
    optional: true,
    string: true,
  })
  .option('bootnodeList', {
    describe: 'path to a file containing a list of bootnode ENRs',
    optional: true,
    string: true,
  })
  .option('rpc', {
    describe: 'Enable the JSON-RPC server with HTTP endpoint',
    boolean: true,
    default: true,
  })
  .option('rpcPort', {
    describe: 'HTTP-RPC server listening port',
    default: 8545,
  })
  .option('rpcAddr', {
    describe: 'HTTP-RPC server listening interface address',
    default: 'localhost',
  })
  .option('metrics', {
    describe: 'Turn on Prometheus metrics reporting',
    boolean: true,
    default: false,
  })
  .option('metricsPort', {
    describe: 'Port exposed for metrics scraping',
    number: true,
    default: 18545,
  })
  .option('dataDir', {
    describe: 'data directory where content is stored',
    string: true,
    optional: true,
  })
  .option('web3', {
    describe: 'web3 JSON RPC HTTP endpoint for local Ethereum node for sourcing chain data',
    string: true,
    optional: true,
  }).argv

const register = new PromClient.Registry()

const reportMetrics = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200)
  res.end(await register.metrics())
}

const main = async () => {
  let id: PeerId
  let web3: jayson.Client | undefined
  if (!args.pk) {
    id = await createSecp256k1PeerId()
  } else {
    id = await createFromProtobuf(fromHexString(args.pk))
  }
  const enr = ENR.createFromPeerId(id)
  let initMa: Multiaddr
  if (args.bindAddress) {
    const addrOpts = args.bindAddress.split(':')
    initMa = multiaddr(`/ip4/${addrOpts[0]}/udp/${addrOpts[1]}`)
    enr.setLocationMultiaddr(initMa)
  } else {
    initMa = multiaddr()
  }

  const log = debug(enr.nodeId.slice(0, 5)).extend('ultralight')
  const metrics = setupMetrics()
  let db
  if (args.dataDir) {
    db = new Level<string, string>(args.dataDir)
  }

  const portal = await PortalNetwork.create({
    config: {
      enr: enr,
      peerId: id,
      multiaddr: initMa,
      config: {
        enrUpdate: true,
        addrVotesToUpdateEnr: 5,
        allowUnverifiedSessions: true,
      },
    },
    radius: 2n ** 256n - 1n,
    //@ts-ignore Because level doesn't know how to get along with itself
    db,
    metrics,
    supportedProtocols: [ProtocolId.HistoryNetwork],
    dataDir: args.datadir,
  })
  portal.discv5.enableLogs()
  portal.enableLog('*ultralight*, *Portal*, *uTP*')
  let metricsServer: http.Server | undefined

  if (args.metrics) {
    metricsServer = http.createServer(reportMetrics)
    Object.entries(metrics).forEach((entry) => {
      register.registerMetric(entry[1])
    })
    metricsServer.listen(args.metricsPort)
    log(`Started Metrics Server address=http://${args.rpcAddr}:${args.metricsPort}`)
  }
  await portal.start()

  const protocol = portal.protocols.get(ProtocolId.HistoryNetwork)
  if (args.bootnode) {
    protocol!.addBootNode(args.bootnode)
  }
  if (args.bootnodeList) {
    const bootnodeData = fs.readFileSync(args.bootnodeList, 'utf-8')
    const bootnodes = bootnodeData.split('\n')
    bootnodes.forEach((enr) => {
      if (enr.startsWith('enr:-')) {
        try {
          protocol!.addBootNode(enr)
        } catch {}
      }
    })
  }

  // Proof of concept for a web3 bridge to import block headers from a locally running full node
  if (args.web3) {
    const [host, port] = args.web3.split(':')
    if (host && port) {
      web3 = jayson.Client.http({ host: host, port: port })
    }
  }

  if (args.rpc) {
    const manager = new RPCManager(portal)
    const methods = manager.getMethods()
    const server = new jayson.Server(methods, {
      router: function (method, params) {
        // `_methods` is not part of the jayson.Server interface but exists on the object
        // but the docs recommend this pattern for custom routing
        // https://github.com/tedeh/jayson/blob/HEAD/examples/method_routing/server.js
        //@ts-expect-error
        if (!this._methods[method] && web3) {
          return new jayson.Method(async function () {
            const res = await web3!.request(method, params)
            if (res.result) return res.result
            else return res.error
          }) //@ts-expect-error
        } else return this._methods[method]
      },
    })

    server.http().listen(args.rpcPort)
    log(`Started JSON RPC Server address=http://${args.rpcAddr}:${args.rpcPort}`)
  }

  process.on('SIGINT', async () => {
    console.log('Caught close signal, shutting down...')
    await portal.stop()
    if (metricsServer?.listening) {
      metricsServer.close()
    }
    process.exit()
  })
}

main().catch((err) => {
  console.log('Encountered an error', err)
  console.log('Shutting down...')
})
