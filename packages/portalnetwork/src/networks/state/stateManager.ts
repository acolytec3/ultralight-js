import { AccountCache, CacheType, StorageCache } from '@ethereumjs/statemanager'
import { Account, KECCAK256_NULL, KECCAK256_NULL_S, bytesToHex, hexToBytes } from '@ethereumjs/util'

import { OriginalStorageCache } from './originalStorageCache/cache.js'

import type { EVMStateManagerInterface, Proof, StorageDump, StorageRange } from '@ethereumjs/common'
import type { Address } from '@ethereumjs/util'
import type { StateNetwork } from './state.js'

export class UltralightStateManager implements EVMStateManagerInterface {
  protected _contractCache: Map<string, Uint8Array>
  protected _storageCache: StorageCache
  protected _accountCache: AccountCache
  originalStorageCache: OriginalStorageCache
  state: StateNetwork
  stateRoot: string
  stateRootBytes: Uint8Array
  constructor(stateNetwork: StateNetwork) {
    this._contractCache = new Map()
    this._storageCache = new StorageCache({ size: 100000, type: CacheType.ORDERED_MAP })
    this._accountCache = new AccountCache({ size: 100000, type: CacheType.ORDERED_MAP })

    this.state = stateNetwork
    this.stateRoot = KECCAK256_NULL_S
    this.stateRootBytes = KECCAK256_NULL
    this.originalStorageCache = new OriginalStorageCache(this.getContractStorage.bind(this))
  }

  clearCaches(): void {
    this._contractCache.clear()
    this._storageCache.clear()
    this._accountCache.clear()
  }

  dumpStorage(address: Address): Promise<StorageDump> {
    const storageMap = this._storageCache.dump(address)
    const dump: StorageDump = {}
    if (storageMap !== undefined) {
      for (const slot of storageMap) {
        dump[slot[0]] = bytesToHex(slot[1])
      }
    }
    return Promise.resolve(dump)
  }

  dumpStorageRange(_address: Address, _startKey: bigint, _limit: number): Promise<StorageRange> {
    throw new Error('Method not implemented.')
  }
  generateCanonicalGenesis(_initState: any): Promise<void> {
    return Promise.resolve()
  }
  getProof(_address: Address, _storageSlots?: Uint8Array[] | undefined): Promise<Proof> {
    throw new Error('Method not implemented.')
  }
  shallowCopy(): EVMStateManagerInterface {
    return new UltralightStateManager(this.state)
  }
  getAccount = async (address: Address): Promise<Account | undefined> => {
    const elem = this._accountCache?.get(address)
    if (elem !== undefined) {
      return elem.accountRLP !== undefined
        ? Account.fromRlpSerializedAccount(elem.accountRLP)
        : undefined
    }
    let account: Account | undefined
    const accountRLP = await this.state.manager.getAccount(
      address.toBytes(),
      hexToBytes(this.stateRoot),
    )
    if (accountRLP !== undefined) {
      account = Account.fromRlpSerializedAccount(accountRLP)
      this._accountCache?.put(address, account)
    }
    return account
  }
  putAccount = async (address: Address, account?: Account | undefined): Promise<void> => {
    if (account !== undefined) {
      this._accountCache!.put(address, account)
    } else {
      this._accountCache!.del(address)
    }
  }
  deleteAccount = async (address: Address): Promise<void> => {
    this._accountCache.del(address)
  }
  modifyAccountFields = async (
    address: Address,
    accountFields: Partial<Pick<Account, 'nonce' | 'balance' | 'storageRoot' | 'codeHash'>>,
  ): Promise<void> => {
    let account: Account | undefined
    // let account = await this.getAccount(address)
    if (!account) {
      account = new Account()
    }
    account.nonce = accountFields.nonce ?? account.nonce
    account.balance = accountFields.balance ?? account.balance
    account.storageRoot = accountFields.storageRoot ?? account.storageRoot
    account.codeHash = accountFields.codeHash ?? account.codeHash
    await this.putAccount(address, account)
  }
  putContractCode = async (address: Address, value: Uint8Array): Promise<void> => {
    // Store contract code in the cache
    this._contractCache.set(address.toString(), value)
  }
  getContractCode = async (address: Address): Promise<Uint8Array> => {
    let code = this._contractCache.get(address.toString())
    if (code !== undefined) return code
    code = await this.state.manager.getCode(address.toBytes(), hexToBytes(this.stateRoot))
    if (code !== undefined) {
      this._contractCache.set(address.toString(), code)
    }
    return code ?? new Uint8Array()
  }
  getContractStorage = async (address: Address, key: Uint8Array): Promise<Uint8Array> => {
    // Check storage slot in cache
    if (key.length !== 32) {
      throw new Error('Storage key must be 32 bytes long')
    }

    let value: Uint8Array | null | undefined = this._storageCache!.get(address, key)
    if (value !== undefined) {
      return value
    }

    value = await this.state.manager.getStorageAt(
      address.toBytes(),
      key,
      hexToBytes(this.stateRoot),
    )
    if (value !== undefined) {
      this._storageCache.put(address, key, value ?? new Uint8Array())
    }
    return value ?? new Uint8Array()
  }
  putContractStorage = async (
    address: Address,
    key: Uint8Array,
    value: Uint8Array,
  ): Promise<void> => {
    this._storageCache.put(address, key, value)
  }

  clearContractStorage = async (address: Address): Promise<void> => {
    this._storageCache.clearContractStorage(address)
  }
  checkpoint = async (): Promise<void> => {
    this._accountCache.checkpoint()
    this._storageCache.checkpoint()
  }
  commit = async (): Promise<void> => {
    this._accountCache.commit()
    this._storageCache.commit()
  }
  revert = async (): Promise<void> => {
    this._accountCache.revert()
    this._storageCache.revert()
    this._contractCache.clear()
  }
  getStateRoot = async (): Promise<Uint8Array> => {
    return this.stateRootBytes
  }
  setStateRoot = async (
    stateRoot: Uint8Array,
    _clearCache?: boolean | undefined,
  ): Promise<void> => {
    this.stateRootBytes = stateRoot
    this.stateRoot = bytesToHex(stateRoot)
  }
  hasStateRoot = async (root: Uint8Array): Promise<boolean> => {
    return [...this.state.stateroots.values()].map(bytesToHex).includes(bytesToHex(root))
  }
}
