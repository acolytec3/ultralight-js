import { toHexString } from '@chainsafe/ssz'
import { BranchNode, LeafNode, Trie } from '@ethereumjs/trie'
import { bytesToUnprefixedHex } from '@ethereumjs/util'
import { bytesToHex } from 'ethereum-cryptography/utils'

import { ContentLookup } from '../contentLookup.js'

import { addressToNibbles, packNibbles, unpackNibbles } from './nibbleEncoding.js'
import { AccountTrieNodeRetrieval, StorageTrieNodeRetrieval } from './types.js'
import { AccountTrieNodeContentKey, StorageTrieNodeContentKey } from './util.js'

import type { StateManager } from './manager.js'
import type { PortalTrieDB } from './portalTrieDB.js'
import type { StateNetwork } from './state.js'
import type { Debugger } from 'debug'

export class PortalTrie {
  state: StateNetwork
  db: PortalTrieDB
  logger: Debugger
  constructor(stateManager: StateManager) {
    this.state = stateManager.state
    this.db = stateManager.db
    this.logger = stateManager.state.logger.extend('PortalTrie')
  }
  async lookupAccountTrieNode(key: Uint8Array) {
    const lookup = new ContentLookup(this.state, key)
    const request = await lookup.startLookup()
    const keyobj = AccountTrieNodeContentKey.decode(key)
    if (request === undefined || !('content' in request)) {
      throw new Error(
        `network doesn't have node [${unpackNibbles(keyobj.path)}]${toHexString(keyobj.nodeHash)}`,
      )
    }
    const node = AccountTrieNodeRetrieval.deserialize(request.content).node
    return { nodeHash: keyobj.nodeHash, node }
  }
  async lookupStorageTrieNode(key: Uint8Array) {
    const lookup = new ContentLookup(this.state, key)
    const request = await lookup.startLookup()
    const keyobj = StorageTrieNodeContentKey.decode(key)
    if (request === undefined || !('content' in request)) {
      throw new Error(
        `network doesn't have node [${unpackNibbles(keyobj.path)}]${toHexString(keyobj.nodeHash)}`,
      )
    }
    const node = StorageTrieNodeRetrieval.deserialize(request.content).node
    return { nodeHash: keyobj.nodeHash, node }
  }
  async findAccountPath(stateroot: Uint8Array, address: Uint8Array) {
    const lookupTrie = new Trie({
      useKeyHashing: true,
      db: this.db,
    })
    lookupTrie.root(stateroot)
    const addressPath = addressToNibbles(address)

    // Find RootNode
    const rootNodeKey = AccountTrieNodeContentKey.encode({
      path: packNibbles([]),
      nodeHash: stateroot,
    })

    this.logger.extend('findPath')(`RootNode not found locally`)
    const lookup = new ContentLookup(this.state, rootNodeKey)
    const request = await lookup.startLookup()
    if (request === undefined || !('content' in request)) {
      throw new Error(`network doesn't have root node ${toHexString(stateroot)}`)
    }
    const node = AccountTrieNodeRetrieval.deserialize(request.content).node
    this.logger.extend('findPath')(`RootNode found: (${node.length} bytes)`)
    this.db.temp.set(bytesToUnprefixedHex(stateroot), bytesToUnprefixedHex(node))

    // Find Account via trie walk
    let accountPath = await lookupTrie.findPath(lookupTrie['hash'](address))

    this.logger.extend('findPath')(`AccoutPath stack status: ${accountPath.stack.length}`)
    this.logger.extend('findPath')(
      `AccoutPath node status: ${accountPath.node === null ? 'null' : 'found'}`,
    )
    while (!accountPath.node) {
      const consumedNibbles = accountPath.stack
        .slice(1)
        .map((n) => (n instanceof BranchNode ? 1 : n.keyLength()))
        .reduce((a, b) => a + b, 0)
      const nodePath = addressPath.slice(0, consumedNibbles + 1)
      this.logger.extend('findPath')(`consumed nibbles: ${consumedNibbles}`)
      this.logger.extend('findPath')(`Looking for next node in path [${nodePath}]`)
      const current = accountPath.stack[accountPath.stack.length - 1]
      if (current instanceof LeafNode) {
        return { ...accountPath }
      }
      const nextNodeHash =
        current instanceof BranchNode
          ? current.getBranch(parseInt(addressPath[consumedNibbles], 16))
          : current.value()

      if (nextNodeHash === undefined || nextNodeHash === null) {
        return { ...accountPath }
      }
      this.logger.extend('findPath')(
        `Looking for node: [${bytesToHex(nextNodeHash as Uint8Array)}]`,
      )
      const nextContentKey = AccountTrieNodeContentKey.encode({
        path: packNibbles(nodePath),
        nodeHash: nextNodeHash as Uint8Array,
      })
      const found = await this.lookupAccountTrieNode(nextContentKey)
      this.logger.extend('findPath')(
        `Found node: [${bytesToHex(found.nodeHash)}] (${found.node.length} bytes)`,
      )
      this.db.temp.set(bytesToUnprefixedHex(found.nodeHash), bytesToUnprefixedHex(found.node))
      // if ((await this.state.get(nextContentKey)) === undefined) {
      // }
      const nextPath = await lookupTrie.findPath(lookupTrie['hash'](address))
      if (nextPath.stack.length === accountPath.stack.length) {
        this.logger.extend('findPath')(
          `nextPath node status: ${nextPath.node === null ? 'null' : 'found'}`,
        )
        this.logger.extend('findPath')(`nextPath stack status: ${nextPath.stack.length}`)
        return { ...nextPath }
      }
      accountPath = nextPath
      this.logger.extend('findPath')(
        `AccoutPath node status: ${accountPath.node === null ? 'null' : 'found'}`,
      )
      this.logger.extend('findPath')(`AccoutPath stack status: ${accountPath.stack.length}`)
    }
    return { ...accountPath }
  }
  async findContractPath(storageRoot: Uint8Array, slot: Uint8Array, address: Uint8Array) {
    const lookupTrie = new Trie({
      useKeyHashing: true,
      db: this.db,
    })
    lookupTrie.root(storageRoot)
    const addressPath = addressToNibbles(slot)

    // Find RootNode
    const rootNodeKey = StorageTrieNodeContentKey.encode({
      path: packNibbles([]),
      nodeHash: storageRoot,
      addressHash: new Trie({ useKeyHashing: true })['hash'](address),
    })

    this.logger.extend('findPath')(`RootNode not found locally`)
    const lookup = new ContentLookup(this.state, rootNodeKey)
    const request = await lookup.startLookup()
    if (request === undefined || !('content' in request)) {
      throw new Error(`network doesn't have root node ${toHexString(storageRoot)}`)
    }
    const node = AccountTrieNodeRetrieval.deserialize(request.content).node
    this.logger.extend('findPath')(`RootNode found: (${node.length} bytes)`)
    this.db.temp.set(bytesToUnprefixedHex(storageRoot), bytesToUnprefixedHex(node))

    // Find Account via trie walk
    let contractPath = await lookupTrie.findPath(lookupTrie['hash'](slot))

    this.logger.extend('findPath')(`ContractPath stack status: ${contractPath.stack.length}`)
    this.logger.extend('findPath')(
      `ContractPath node status: ${contractPath.node === null ? 'null' : 'found'}`,
    )
    while (!contractPath.node) {
      const consumedNibbles = contractPath.stack
        .slice(1)
        .map((n) => (n instanceof BranchNode ? 1 : n.keyLength()))
        .reduce((a, b) => a + b, 0)
      const nodePath = addressPath.slice(0, consumedNibbles + 1)
      this.logger.extend('findPath')(`consumed nibbles: ${consumedNibbles}`)
      this.logger.extend('findPath')(`Looking for next node in path [${nodePath}]`)
      const current = contractPath.stack[contractPath.stack.length - 1]
      if (current instanceof LeafNode) {
        return { ...contractPath }
      }
      const nextNodeHash =
        current instanceof BranchNode
          ? current.getBranch(parseInt(addressPath[consumedNibbles], 16))
          : current.value()

      if (nextNodeHash === undefined || nextNodeHash === null) {
        return { ...contractPath }
      }
      this.logger.extend('findPath')(
        `Looking for node: [${bytesToHex(nextNodeHash as Uint8Array)}]`,
      )
      const nextContentKey = StorageTrieNodeContentKey.encode({
        path: packNibbles(nodePath),
        nodeHash: nextNodeHash as Uint8Array,
        addressHash: new Trie({ useKeyHashing: true })['hash'](address),
      })
      const found = await this.lookupStorageTrieNode(nextContentKey)
      this.logger.extend('findPath')(
        `Found node: [${bytesToHex(found.nodeHash)}] (${found.node.length} bytes)`,
      )
      this.db.temp.set(bytesToUnprefixedHex(found.nodeHash), bytesToUnprefixedHex(found.node))
      // if ((await this.state.get(nextContentKey)) === undefined) {
      // }
      const nextPath = await lookupTrie.findPath(lookupTrie['hash'](slot))
      if (nextPath.stack.length === contractPath.stack.length) {
        this.logger.extend('findPath')(
          `nextPath node status: ${nextPath.node === null ? 'null' : 'found'}`,
        )
        this.logger.extend('findPath')(`nextPath stack status: ${nextPath.stack.length}`)
        return { ...nextPath }
      }
      contractPath = nextPath
      this.logger.extend('findPath')(
        `ContractPath node status: ${contractPath.node === null ? 'null' : 'found'}`,
      )
      this.logger.extend('findPath')(`ContractPath stack status: ${contractPath.stack.length}`)
    }
    return { ...contractPath }
  }
}
