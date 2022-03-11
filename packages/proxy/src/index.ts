import WS from 'ws'
import * as dgram from 'dgram'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import http from 'http'
import * as PromClient from 'prom-client'
import debug from 'debug'
import https from 'https'
const log = debug('proxy')
debug.enable('proxy')

const MAX_PACKET_SIZE = 1280

const servers: WS.Server[] = []
let externalIp: string | undefined

const args: any = yargs(hideBin(process.argv))
  .option('nat', {
    describe: 'NAT Traversal options for proxy',
    choices: ['extip', 'localhost', 'lan'],
    default: 'localhost',
    array: true,
    string: true,
  })
  .option('ip', {
    describe: 'IP address on local network',
    string: true,
    optional: true,
  })
  .option('packetLoss', {
    describe: 'simulated network issues',
    number: true,
    optional: true,
  }).argv

if ((args.packetLoss && args.packetLoss < 0) || args.packetLoss >= 100) {
  log('packet loss parameter must be between 0 and 100. Exiting...')
  process.exit(0)
}

const register = new PromClient.Registry()

const reportMetrics = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200)
  res.end(await register.metrics())
}

const setupMetrics = () => {
  return {
    totalPacketsSent: new PromClient.Counter({
      name: 'proxy_total_packets_sent',
      help: 'how many packets have been sent',
    }),
    totalPacketsDropped: new PromClient.Counter({
      name: 'proxy_total_packets_dropped',
      help: 'how many packets have been dropped',
    }),
  }
}

const metricsServer = http.createServer(reportMetrics)
let metrics: any

if (args.packetLoss) {
  metrics = setupMetrics()
  Object.entries(metrics).forEach((entry: any) => {
    register.registerMetric(entry[1])
  })
  metricsServer.listen(5051)
}

const startServer = async (ws: WS.Server, extip = false) => {
  let remoteAddr: string | undefined

  if (extip) {
    remoteAddr = externalIp
  } else {
    remoteAddr = ws.options.host
  }

  log(`websocket server listening on ${remoteAddr}:5050`)
  ws.on('connection', async (websocket, req) => {
    const udpsocket = dgram.createSocket({
      recvBufferSize: 16 * MAX_PACKET_SIZE,
      sendBufferSize: MAX_PACKET_SIZE,
      type: 'udp4',
    })
    udpsocket.on('message', (data, rinfo) => {
      log('incoming message from', rinfo.address, rinfo.port)
      const connInfo = Uint8Array.from(Buffer.from(JSON.stringify(rinfo)))
      const connLength = Buffer.from(connInfo.length.toString())
      const msg = new Uint8Array([...connLength, ...connInfo, ...Uint8Array.from(data)])
      websocket.send(msg)
    })
    log(`incoming connection from ${req.socket.remoteAddress}:${req.socket.remotePort}`)
    let foundPort = false
    while (!foundPort) {
      try {
        await udpsocket.bind()
        foundPort = true
      } catch (err) {
        log(err)
      }
    }
    // Send external IP address/port to websocket client to update ENR
    const remoteAddrArray = remoteAddr!.split('.')
    const bAddress = Uint8Array.from([
      parseInt(remoteAddrArray[0]),
      parseInt(remoteAddrArray[1]),
      parseInt(remoteAddrArray[2]),
      parseInt(remoteAddrArray[3]),
    ])
    const bPort = Buffer.alloc(2)
    bPort.writeUIntBE(udpsocket.address().port, 0, 2)
    websocket.send(Buffer.concat([bAddress, bPort]))
    log('UDP proxy listening on ', remoteAddr, udpsocket.address().port)
    websocket.on('message', (data) => {
      if (args.packetLoss) {
        metrics.totalPacketsSent.inc()
        if (Math.random() * 100 <= args.packetLoss) {
          metrics.totalPacketsDropped.inc()
          log('simulating packet loss')
          return
        }
      }
      try {
        const bAddress = Buffer.from(data.slice(0, 4) as ArrayBuffer)
        const address = `${bAddress[0]}.${bAddress[1]}.${bAddress[2]}.${bAddress[3]}`
        const port = Buffer.from(data as ArrayBuffer).readUIntBE(4, 2)
        const payload = Buffer.from(data.slice(6) as ArrayBuffer)
        log('outbound message to', address, port)
        udpsocket.send(payload, port, address)
      } catch (err) {
        log(err)
      }
    })
    websocket.on('close', () => {
      log('socket closed', req.socket.remotePort)
      udpsocket.close()
    })
  })
}

function stop(): void {
  log('proxy server shutting down...')
  servers.forEach((server) => {
    server.removeAllListeners()
    server.close()
  })
  if (args.packetLoss) {
    metricsServer.close()
  }
  process.exit(0)
}

process.on('SIGTERM', () => stop())
process.on('SIGINT', () => stop())

const main = () => {
  args.nat.forEach((arg: string) => {
    switch (arg) {
      case 'extip':
        {
          const ws = new WS.Server({ host: '127.0.0.1', port: 5050, clientTracking: true })
          startServer(ws, true)
          servers.push(ws)
        }
        break
      case 'localhost':
        {
          const ws = new WS.Server({ host: '127.0.0.1', port: 5050, clientTracking: true })
          startServer(ws, false)
          servers.push(ws)
        }
        break
      case 'lan':
        {
          if (!args.ip) {
            log('Must provide IP address for LAN option')
            log('Exiting...')
            process.exit(1)
          }
          const ws = new WS.Server({ host: args.ip, port: 5050, clientTracking: true })
          startServer(ws, args.nat.includes('extip'))
          servers.push(ws)
        }
        break
    }
  })
}

if (args.nat.find((entry: string) => entry === 'extip')) {
  https.get('https://api.ipify.org', (res) => {
    let data = ''
    res.on('data', (chunk) => (data += chunk))
    res.on('end', () => {
      externalIp = data
      main()
    })
  })
} else {
  main()
}
