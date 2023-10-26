import { hideBin } from 'yargs/helpers'
import yargs from 'yargs'
import { Alchemy, Network } from 'alchemy-sdk'
import EventEmitter from 'events'
import jayson from 'jayson/promise/index.js'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { execSync } from 'child_process'

const bridgeThread = async () => {
  const args = await yargs(hideBin(process.argv))
    .option('KEY', {
      describe: 'alchemy api key',
      string: true,
      default: 'JY46MOVpzcwZYEln86fa44MHIks4OoSl',
      optional: true,
    })
    .option('devnet', {
      describe: 'running portal state network devnet',
      boolean: true,
      default: false,
      optional: true,
    })
    .option('numNodes', {
      description: 'number of nodes in devnet',
      number: true,
      default: 1,
      optional: true,
    })
    .option('host', {
      description: 'ip address of devnet',
      string: true,
      optional: true,
    })
    .option('port', {
      description: 'starting port number',
      number: true,
      default: 8545,
      optional: true,
    })
    .strict().argv

  const alchemyHTTP = jayson.Client.https({
    host: 'eth-mainnet.g.alchemy.com',
    path: '/v2/JY46MOVpzcwZYEln86fa44MHIks4OoSl',
  })

  const cmd = 'hostname -I'
  const pubIp = execSync(cmd).toString().split(' ')
  args.host = args.host ?? pubIp[0]

  const config = {
    apiKey: 'JY46MOVpzcwZYEln86fa44MHIks4OoSl',
    network: Network.ETH_MAINNET,
    url: 'https://eth-mainnet.alchemyapi.io/v2/JY46MOVpzcwZYEln86fa44MHIks4OoSl',
  }
  const alchemy = new Alchemy({
    ...config,
  })

  const processing: Set<string> = new Set()
  const processed: Set<string> = new Set()
  const started: Map<string, any[]> = new Map()
  const progress: Map<string, any[]> = new Map()
  const results: Map<string, any[]> = new Map()

  const getMissed = new EventEmitter()

  const numbers: boolean[] = []
  let starting: string
  const begin = process.hrtime()

  const memory = !args.devnet ? 'remember' : args.numNodes > 2 ? 'gossip' : 'store'
  const ports = Array.from({ length: args.numNodes }, (_, i) => args.port + i)
  let current = 0
  const currentPort = () => {
    switch (memory) {
      case 'remember':
        return undefined
      case 'store':
        return ports[0]
      case 'gossip':
        const port = ports[current]
        current++
        if (current >= ports.length) {
          current = 0
        }
        return port
    }
  }

  const workerTask = async (blockTag: string | number = 'latest') => {
    const start = process.hrtime()
    const latest = await alchemyHTTP.request('eth_getBlockByNumber', [blockTag, true])
    if (progress.has(latest.result.number)) {
      return
    }
    progress.set(latest.result.number, [''])
    results.set(latest.result.number, [''])
    started.set(latest.result.number, [start[0] - begin[0], start[1] - begin[1]])
    const idx = parseInt(latest.result.number, 16) - parseInt(starting, 16)
    if (!starting) {
      numbers[0] = true
      starting = latest.result.number
    } else if (!numbers[idx]) {
      numbers[idx] = true
      if (!numbers[idx - 1]) {
        process.stdout.cursorTo(0, 7)
        console.log(`getting missed block`, idx - 1 + parseInt(starting, 16))
        getMissed.emit('getMissed', idx - 1 + parseInt(starting, 16))
      }
    }
    processing.add(latest.result.number)
    const worker = new Worker('./scripts/stateBridge.ts', {
      execArgv: ["--loader", "ts-node/esm"],

      workerData: { latest, KEY: args.KEY, host: args.host, port: currentPort(), memory },
    })
    worker.on('message', async (msg) => {
      if (msg.startsWith('getProof')) {
        const p = msg.split('/')
        const percent = (p[1] / p[2]) * 100
        progress.set(latest.result.number, [
          `|${'/'.repeat(Math.floor(percent / 4))}${'_'.repeat(25 - Math.floor(percent / 4))}|`,
          percent.toFixed(2),
          `% `,
        ])
      } else if (msg.startsWith('results')) {
        const r = msg.split('/')
        results.set(latest.result.number, r.slice(1))
      } else {
      }
      let row = 6
      for (let i = started.size - Math.min(started.size, 4); i < started.size; i++) {
        let key = [...started.keys()][i]
        if (!key) {
          break
        }
        process.stdout.cursorTo(0, row)
        process.stdout.clearScreenDown()
        process.stdout.cursorTo(0, row)
        console.log('\n')
        row++
        process.stdout.cursorTo(0, row)
        process.stdout.clearScreenDown()
        process.stdout.cursorTo(0, row)
        console.log(BigInt(key), ...progress.get(key)!)
        row++
        for (const line of results.get(key)!) {
          process.stdout.cursorTo(0, row)
          process.stdout.clearScreenDown()
          process.stdout.cursorTo(0, row)
          console.log(' '.repeat(BigInt(key).toString().length - 3), line)
          row++
        }
      }
    })
    worker.on('error', (err) => console.error(err.message))
    worker.on('exit', (code) => {
      const finished = process.hrtime(start)
      processing.delete(latest.result.number)
      processed.add(latest.result.number)
      progress.set(latest.result.number, [`Finished in`, finished[0], 's'])
    })
  }

  if (isMainThread) {
    process.stdout.cursorTo(0, 0)
    process.stdout.clearScreenDown()
    console.log('-'.repeat(process.stdout.columns))
    console.log(''.repeat(process.stdout.columns))
    console.log('State Network Content Bridge')
    console.log(''.repeat(process.stdout.columns))
    console.log('-'.repeat(process.stdout.columns))
    workerTask()
    getMissed.on('getMissed', (idx) => {
      workerTask('0x' + parseInt(idx).toString(16))
    })
    setInterval(() => {
      workerTask()
    }, 12000)
    process.on('SIGINT', () => {
      console.log('\nshutting down...')
      process.exit(0)
    })
  } else {
    const data = workerData
    parentPort?.postMessage(`You said \"${data}\".`)
  }
}

bridgeThread()
