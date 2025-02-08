import { EventEmitter } from 'eventemitter3'
import { Discv5, UDPTransportService } from '@chainsafe/discv5'
import { ENR, SignableENR } from '@chainsafe/enr'
import { bytesToHex, hexToBytes } from '@ethereumjs/util'
import { keys } from '@libp2p/crypto'
import type { Multiaddr } from '@multiformats/multiaddr'
import { fromNodeAddress, multiaddr } from '@multiformats/multiaddr'
import debug from 'debug'
import packageJson from '../../package.json' assert { type: 'json' }

import { HistoryNetwork } from '../networks/history/history.js'
import {
  BeaconLightClientNetwork,
  NetworkId,
  StateNetwork,
  SyncStrategy,
} from '../networks/index.js'
import { CapacitorUDPTransportService, WebSocketTransportService } from '../transports/index.js'
import { MEGABYTE, dirSize } from '../util/index.js'
import { PortalNetworkUTP } from '../wire/utp/PortalNetworkUtp/index.js'

import { DBManager } from './dbManager.js'
import { ETH } from './eth.js'
import { TransportLayer } from './types.js'

import type { IDiscv5CreateOptions, SignableENRInput } from '@chainsafe/discv5'
import type { ITalkReqMessage, ITalkRespMessage } from '@chainsafe/discv5/message'
import type { Debugger } from 'debug'
import type { BaseNetwork } from '../networks/network.js'
import type {
  INodeAddress,
  PortalNetworkEvents,
  PortalNetworkMetrics,
  PortalNetworkOpts,
} from './types.js'
import { MessageCodes, PortalWireMessageType } from '../wire/types.js'
import { type IClientInfo } from '../wire/payloadExtensions.js'
import { RateLimiter } from '../transports/rateLimiter.js'
import { ENRCache } from './enrCache.js'

export class PortalNetwork extends EventEmitter<PortalNetworkEvents> {
  clientInfo: IClientInfo
  eventLog: boolean
  discv5: Discv5
  networks: Map<NetworkId, BaseNetwork>
  uTP: PortalNetworkUTP
  utpTimout: number
  db: DBManager
  bootnodes: string[]
  metrics: PortalNetworkMetrics | undefined
  logger: Debugger
  ETH: ETH
  enrCache: ENRCache
  shouldRefresh: boolean = true

  public static create = async (opts: Partial<PortalNetworkOpts>) => {
    const defaultConfig: IDiscv5CreateOptions = {
      enr: opts.config?.enr ?? ({} as SignableENRInput),
      privateKey: opts.config?.privateKey ?? (await keys.generateKeyPair('secp256k1')),
      bindAddrs: {
        ip4: multiaddr(),
      },
      config: {
        addrVotesToUpdateEnr: 5,
        enrUpdate: true,
        allowUnverifiedSessions: true,
        requestTimeout: 3000,
        sessionEstablishTimeout: 3000,
        lookupTimeout: 3000,
        sessionTimeout: 3000,
        requestRetries: 2,
      },
    }
    const config = { ...defaultConfig, ...opts.config }
    config.config = { ...defaultConfig.config, ...opts.config?.config }
    let bootnodes = opts.bootnodes
    if (opts.rebuildFromMemory === true && opts.db) {
      const prevEnrString = await opts.db.get('enr')
      const prevPrivateKey = await opts.db.get('privateKey')
      config.enr = SignableENR.decodeTxt(prevEnrString, hexToBytes(prevPrivateKey))
      const prev_peers = JSON.parse(await opts.db.get('peers')) as string[]
      bootnodes =
        opts.bootnodes && opts.bootnodes.length > 0 ? opts.bootnodes.concat(prev_peers) : prev_peers
    } else if (opts.config?.enr === undefined) {
      config.enr = SignableENR.createV4(config.privateKey.raw)

      bootnodes = opts.bootnodes
    } else {
      config.enr = opts.config.enr as SignableENR
    }
    let ma
    if (opts.config?.bindAddrs?.ip4 === undefined) {
      if (opts.bindAddress !== undefined) {
        ma = multiaddr(`/ip4/${opts.bindAddress}/udp/${Math.floor(Math.random() * 990) + 9009}`)
        config.enr.setLocationMultiaddr(ma)
        config.bindAddrs.ip4 = ma
      } else {
        let ip = ''
        try {
          ip = await (await fetch('https://api.ipify.org')).text()
        } catch (e) {
          ip = '127.0.0.1'
        }
        ma = multiaddr(`/ip4/${ip}/udp/${Math.floor(Math.random() * 990) + 9009}`)
        config.enr.setLocationMultiaddr(ma)
        config.bindAddrs.ip4 = ma
      }
    } else {
      ma = opts.config.bindAddrs.ip4
    }

    // Configure db size calculation
    let dbSize
    switch (opts.transport) {
      case TransportLayer.WEB:
      case TransportLayer.MOBILE:
        dbSize = async function () {
          // eslint-disable-next-line no-undef
          const sizeEstimate = await window.navigator.storage.estimate()
          return sizeEstimate.usage !== undefined ? sizeEstimate.usage / MEGABYTE : 0
        }
        break
      case TransportLayer.NODE:
      default:
        dbSize = async function () {
          return dirSize(opts.dataDir ?? './')
        }
    }

    // Configure transport layer
    switch (opts.transport) {
      case TransportLayer.WEB: {
        opts.proxyAddress = opts.proxyAddress ?? 'ws://127.0.0.1:5050'
        config.transport = new WebSocketTransportService(
          ma,
          config.enr.nodeId,
          opts.proxyAddress,
          new RateLimiter(),
        )
        break
      }
      case TransportLayer.MOBILE:
        config.transport = new CapacitorUDPTransportService(ma, config.enr.nodeId)
        break
      case TransportLayer.NODE:
        config.transport = new UDPTransportService({
          bindAddrs: config.bindAddrs,
          nodeId: config.enr.nodeId,
          rateLimiter: new RateLimiter(),
        })
        break
    }

    const portal = new PortalNetwork({
      config,
      bootnodes,
      db: opts.db,
      supportedNetworks: opts.supportedNetworks ?? [
        { networkId: NetworkId.HistoryNetwork, maxStorage: 1024 },
      ],
      dbSize: dbSize as () => Promise<number>,
      metrics: opts.metrics,
      trustedBlockRoot: opts.trustedBlockRoot,
      eventLog: opts.eventLog,
      utpTimeout: opts.utpTimeout,
      gossipCount: opts.gossipCount,
      shouldRefresh: opts.shouldRefresh,
      operatingSystemAndCpuArchitecture: opts.operatingSystemAndCpuArchitecture,
      shortCommit: opts.shortCommit,
    })
    for (const network of portal.networks.values()) {
      try {
        // Check for stored radius in db
        const storedRadius = await network.db.db.get('radius')
        await network.setRadius(BigInt(storedRadius))
      } catch {
        continue
      }
      await network.prune()
    }
    return portal
  }

  /**
   *
   * Portal Network constructor
   * @param opts a dictionary of `PortalNetworkOpts`
   */
  constructor(opts: PortalNetworkOpts) {
    // eslint-disable-next-line constructor-super
    super()
    this.clientInfo = {
      clientName: 'ultralight',
      clientVersionAndShortCommit: `${packageJson.version}-${opts.shortCommit ?? ''}`,
      operatingSystemAndCpuArchitecture: opts.operatingSystemAndCpuArchitecture ?? '',
      programmingLanguageAndVersion: `typescript${packageJson.devDependencies.typescript}`,
    }
    this.eventLog = opts.eventLog ?? false
    this.discv5 = Discv5.create(opts.config as IDiscv5CreateOptions)
    // cache signature to ensure ENR can be encoded on startup
    this.discv5.enr.encode()
    this.enrCache = new ENRCache({})
    this.logger = debug(this.discv5.enr.nodeId.slice(0, 5)).extend('Portal')
    this.networks = new Map()
    this.bootnodes = opts.bootnodes ?? []
    this.uTP = new PortalNetworkUTP(this)
    this.utpTimout = opts.utpTimeout ?? 180000 // set default utpTimeout to 3 minutes
    this.db = new DBManager(this.discv5.enr.nodeId, this.logger, opts.dbSize, opts.db) as DBManager
    opts.supportedNetworks = opts.supportedNetworks ?? []
    for (const network of opts.supportedNetworks) {
      switch (network.networkId) {
        case NetworkId.HistoryNetwork:
          this.networks.set(
            network.networkId,
            new HistoryNetwork({
              client: this,
              networkId: NetworkId.HistoryNetwork,
              maxStorage: network.maxStorage,
              db: network.db,
              gossipCount: opts.gossipCount,
            }),
          )
          break
        case NetworkId.StateNetwork:
          this.networks.set(
            network.networkId,
            new StateNetwork({
              client: this,
              networkId: NetworkId.StateNetwork,
              maxStorage: network.maxStorage,
              db: network.db,
              gossipCount: opts.gossipCount,
            }),
          )
          break
        case NetworkId.BeaconChainNetwork:
          {
            const syncStrategy =
              opts.trustedBlockRoot !== undefined
                ? SyncStrategy.TrustedBlockRoot
                : SyncStrategy.PollNetwork
            this.networks.set(
              network.networkId,
              new BeaconLightClientNetwork({
                client: this,
                networkId: NetworkId.BeaconChainNetwork,
                maxStorage: network.maxStorage,
                trustedBlockRoot: opts.trustedBlockRoot,
                sync: syncStrategy,
                db: network.db,
                gossipCount: opts.gossipCount,
              }),
            )
          }
          break
      }
    }
    for (const network of this.networks.values()) {
      this.db.sublevels.set(network.networkId, network.db)
    }

    this.ETH = new ETH(this)

    // Set version info pair in ENR
    this.discv5.enr.set('c', new TextEncoder().encode('u 0.0.1'))
    // Event handling
    // TODO: Decide whether to put everything on a centralized event bus
    this.discv5.on('talkReqReceived', this.onTalkReq)
    this.discv5.on('talkRespReceived', this.onTalkResp)
    this.discv5.on('enrAdded', (enr: ENR) => {
      this.updateENRCache([enr])
    })
    this.discv5.on('discovered', (enr: ENR) => {
      this.updateENRCache([enr])
    })
    // if (this.discv5.sessionService.transport instanceof HybridTransportService) {
    //   ;(this.discv5.sessionService as any).send = this.send.bind(this)
    // }
    this.discv5.sessionService.on('established', async (nodeAddr, enr) => {
      this.discv5.findEnr(enr.nodeId) === undefined && this.discv5.addEnr(enr)
      this.updateENRCache([enr])
    })
    if (opts.metrics) {
      this.metrics = opts.metrics
      this.metrics.knownDiscv5Nodes.collect = () =>
        this.metrics?.knownDiscv5Nodes.set(this.discv5.kadValues().length)
      this.metrics.currentDBSize.collect = async () => {
        this.metrics?.currentDBSize.set(await this.db.currentSize())
      }
    }
    // Should refresh by default but can be disabled (e.g. in tests)
    opts.shouldRefresh === false && (this.shouldRefresh = false)
  }

  /**
   * Starts the portal network client
   */
  public start = async () => {
    await this.discv5.start()
    await this.db.open()
    const storedIndex = await this.db.getBlockIndex()
    await this.loadENRCache()
    for (const network of this.networks.values()) {
      try {
        // Check for stored radius in db
        const storedRadius = await network.db.db.get('radius')
        await network.setRadius(BigInt(storedRadius))
      } catch {
        // No action
      }
      if (network instanceof HistoryNetwork) {
        network.blockHashIndex = storedIndex
      }
      this.shouldRefresh && network.startRefresh()
      await network.prune()
    }
    void this.bootstrap()
  }

  /**
   * Tries to connect to any pre-configured bootnodes
   */
  public bootstrap = async () => {
    const boostrapRequests = []
    for (const network of this.networks) {
      for (const enr of this.bootnodes) {
        boostrapRequests.push(network[1].addBootNode(enr))
      }
    }
    void Promise.all(boostrapRequests)
  }
  /**
   * Stops the portal network client and cleans up listeners
   */
  public stop = async () => {
    await this.discv5.stop()
    this.discv5.removeAllListeners()
    this.removeAllListeners()
    await this.storeENRCache()
    await this.db.close()
    for (const network of this.networks.values()) {
      network.stopRefresh()
    }
  }

  public network = (): {
    [NetworkId.HistoryNetwork]: HistoryNetwork | undefined
    [NetworkId.StateNetwork]: StateNetwork | undefined
    [NetworkId.BeaconChainNetwork]: BeaconLightClientNetwork | undefined
  } => {
    const history = this.networks.get(NetworkId.HistoryNetwork)
      ? (this.networks.get(NetworkId.HistoryNetwork) as HistoryNetwork)
      : undefined
    const state = this.networks.get(NetworkId.StateNetwork)
      ? (this.networks.get(NetworkId.StateNetwork) as StateNetwork)
      : undefined
    const beacon = this.networks.get(NetworkId.BeaconChainNetwork)
      ? (this.networks.get(NetworkId.BeaconChainNetwork) as BeaconLightClientNetwork)
      : undefined
    return {
      [NetworkId.HistoryNetwork]: history,
      [NetworkId.StateNetwork]: state,
      [NetworkId.BeaconChainNetwork]: beacon,
    }
  }

  /**
   *
   * @param namespaces comma separated list of logging namespaces
   * defaults to "*Portal*,*uTP*"
   */
  public enableLog = (namespaces: string = '*Portal*,*uTP*,*discv5*') => {
    debug.enable(namespaces)
  }

  /**
   * Store node details in DB for node restart
   */
  public storeNodeDetails = async () => {
    const peers: string[] = []
    for (const network of this.networks) {
      for (const enr of network[1].routingTable.values()) {
        peers.push(enr.encodeTxt())
      }
    }
    try {
      await this.db.batch([
        {
          type: 'put',
          key: 'enr',
          value: this.discv5.enr.encodeTxt(),
        },
        {
          type: 'put',
          key: 'privateKey',
          value: bytesToHex(this.discv5.enr.privateKey!),
        },
        {
          type: 'put',
          key: 'publicKey',
          value: bytesToHex(this.discv5.enr.publicKey!),
        },
        {
          type: 'put',
          key: 'peers',
          value: JSON.stringify(peers),
        },
      ])
    } catch (err: any) {
      this.logger.extend('error')(err.message)
    }
  }

  private onTalkReq = async (
    nodeAddress: INodeAddress,
    src: ENR | null,
    message: ITalkReqMessage,
  ) => {
    if (src) {
      this.updateENRCache([src])
    }
    this.metrics?.totalBytesReceived.inc(message.request.length)
    if (bytesToHex(message.protocol) === NetworkId.UTPNetwork) {
      await this.handleUTP(nodeAddress, message, message.request)
      return
    }
    const network = this.networks.get(bytesToHex(message.protocol) as NetworkId)
    if (!network) {
      this.logger(`Received TALKREQ message on unsupported network ${bytesToHex(message.protocol)}`)
      await this.sendPortalNetworkResponse(nodeAddress, message.id, new Uint8Array())

      return
    }

    await network.handle(message, nodeAddress)
  }

  private onTalkResp = (_: INodeAddress, src: ENR | null, message: ITalkRespMessage) => {
    this.metrics?.totalBytesReceived.inc(message.response.length)
    if (src) {
      this.updateENRCache([src])
    }
  }

  /**
   *
   * @param srcId nodeID that uTP packet originates from
   * @param msgId uTP message ID
   * @param packetBuffer uTP packet encoded to Buffer
   */
  private handleUTP = async (src: INodeAddress, msg: ITalkReqMessage, packetBuffer: Uint8Array) => {
    if (this.uTP.requestManagers[src.nodeId] === undefined) {
      this.logger.extend('handleUTP').extend('error')(
        `Received uTP packet from peer with no uTP stream history: ${src.nodeId}.  Blacklisting peer.`,
      )
      this.addToBlackList(src.socketAddr)
      return
    }
    await this.sendPortalNetworkResponse(src, msg.id, new Uint8Array())
    try {
      await this.uTP.handleUtpPacket(packetBuffer, src)
    } catch (err: any) {
      this.logger.extend('error')(
        `handleUTP error: ${err.message}.  SrcId: ${
          src.nodeId
        } MultiAddr: ${src.socketAddr.toString()}`,
      )
    }
  }

  /**
   *
   * @param dstId `NodeId` of message recipient
   * @param payload `Uint8Array` serialized payload of message
   * @param networkId subnetwork ID of subnetwork message is being sent on
   * @returns response from `dstId` as `Uint8Array` or empty array
   */
  public sendPortalNetworkMessage = async (
    enr: ENR | INodeAddress,
    payload: Uint8Array,
    networkId: NetworkId,
    utpMessage?: boolean,
  ): Promise<Uint8Array> => {
    if (enr instanceof ENR) {
      this.updateENRCache([enr])
    }
    const messageNetwork = utpMessage !== undefined ? NetworkId.UTPNetwork : networkId
    const remote =
      enr instanceof ENR
        ? enr
        : (this.findENR(enr.nodeId) ?? fromNodeAddress(enr.socketAddr.nodeAddress(), 'udp'))
    try {
      this.metrics?.totalBytesSent.inc(payload.length)
      const res = await this.discv5.sendTalkReq(remote, payload, hexToBytes(messageNetwork))
      this.eventLog && this.emit('SendTalkReq', enr.nodeId, bytesToHex(res), bytesToHex(payload))
      return res
    } catch (err: any) {
      if (networkId === NetworkId.UTPNetwork || utpMessage === true) {
        throw new Error(
          `Error sending uTP TALKREQ message using ${enr instanceof ENR ? 'ENR' : 'MultiAddr'}: ${err.message}`,
        )
      } else {
        const messageType = PortalWireMessageType.deserialize(payload).selector
        throw new Error(
          `Error sending TALKREQ ${MessageCodes[messageType]} message using ${enr instanceof ENR ? 'ENR' : 'MultiAddr'}: ${err}.  NetworkId: ${networkId} NodeId: ${enr.nodeId} MultiAddr: ${enr instanceof ENR ? enr.getLocationMultiaddr('udp')?.toString() : enr.socketAddr.toString()}`,
        )
      }
    }
  }

  public sendPortalNetworkResponse = async (
    src: INodeAddress,
    requestId: bigint,
    payload: Uint8Array,
  ) => {
    this.eventLog &&
      this.emit('SendTalkResp', src.nodeId, requestId.toString(16), bytesToHex(payload))
    try {
      await this.discv5.sendTalkResp(src, requestId, payload)
    } catch (err: any) {
      this.logger.extend('error')(
        `Error sending TALKRESP message: ${err}.  SrcId: ${src.nodeId} MultiAddr: ${src.socketAddr.toString()}`,
      )
    }
  }

  public addToBlackList = (ma: Multiaddr) => {
    (<RateLimiter>(<any>this.discv5.sessionService.transport)['rateLimiter']).addToBlackList(
      ma.nodeAddress().address,
    )
  }

  public isBlackListed = (ma: Multiaddr) => {
    return (<RateLimiter>(<any>this.discv5.sessionService.transport)['rateLimiter']).isBlackListed(
      ma.nodeAddress().address,
    )
  }

  public removeFromBlackList = (ma: Multiaddr) => {
    (<RateLimiter>(<any>this.discv5.sessionService.transport)['rateLimiter']).removeFromBlackList(
      ma.nodeAddress().address,
    )
  }

  public updateENRCache = (enrs: ENR[]) => {
    for (const enr of enrs) {
      this.enrCache.updateENR(enr)
    }
  }

  public findENR = (nodeId: string): ENR | undefined => {
    return this.enrCache.getENR(nodeId) ?? this.discv5.findEnr(nodeId)
  }

  public storeENRCache = async () => {
    const cache = Array.from(this.enrCache['peers'].values())
      .filter((peer) => peer.enr !== undefined)
      .map((peer) => {
        return peer.enr!.encodeTxt()
      })
    await this.db.put('enr_cache', JSON.stringify(cache))
  }

  public loadENRCache = async () => {
    try {
      const storedEnrCache = await this.db.get('enr_cache')
      if (storedEnrCache) {
        const enrs = JSON.parse(storedEnrCache)
        for (const enr of enrs) {
          this.enrCache.updateENR(ENR.decodeTxt(enr))
        }
      }
    } catch {
      // No action
    }
  }
}
