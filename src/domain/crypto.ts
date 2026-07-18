import { decompress, maybeCompress } from './compression'
import {
  KDF_ITERATIONS,
  MAX_KDF_ITERATIONS,
  decodePublicHeader,
  encodePublicHeader,
  parseSecretPayload,
  serializeSecretPayload,
  type PublicHeader,
  type SecretPayload,
} from './envelope'
import { StegoError } from './errors'

const textEncoder = new TextEncoder()
const MIN_NEW_PASSWORD_BYTES = 12
const MAX_PASSWORD_BYTES = 1024

export interface DerivedKeys {
  encryptionKey: CryptoKey
  layoutKey: Uint8Array
}

export interface EncryptedSecret {
  header: PublicHeader
  headerBytes: Uint8Array
  ciphertext: Uint8Array
  layoutKey: Uint8Array
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

export function normalizePassword(password: string, requireStrong: boolean): Uint8Array {
  const bytes = textEncoder.encode(password.normalize('NFC'))
  if (
    bytes.length === 0 ||
    bytes.length > MAX_PASSWORD_BYTES ||
    (requireStrong && bytes.length < MIN_NEW_PASSWORD_BYTES)
  ) {
    throw new StegoError('INVALID_PASSWORD')
  }
  return bytes
}

async function deriveFromBytes(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<DerivedKeys> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_KDF_ITERATIONS) {
    throw new StegoError('INVALID_HEADER')
  }
  const baseKey = await crypto.subtle.importKey(
    'raw',
    arrayBuffer(passwordBytes),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: arrayBuffer(salt),
      iterations,
    },
    baseKey,
    512,
  )
  const material = new Uint8Array(bits)
  const encryptionBytes = material.slice(0, 32)
  const layoutKey = material.slice(32, 64)
  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    arrayBuffer(encryptionBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
  material.fill(0)
  encryptionBytes.fill(0)
  return { encryptionKey, layoutKey }
}

export async function deriveKeys(
  password: string,
  salt: Uint8Array,
  iterations: number,
  requireStrong = false,
): Promise<DerivedKeys> {
  const passwordBytes = normalizePassword(password, requireStrong)
  try {
    return await deriveFromBytes(passwordBytes, salt, iterations)
  } finally {
    passwordBytes.fill(0)
  }
}

export async function encryptSecret(
  payload: SecretPayload,
  password: string,
): Promise<EncryptedSecret> {
  const serialized = serializeSecretPayload(payload)
  const prepared = maybeCompress(serialized)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header: PublicHeader = {
    version: 1,
    compressed: prepared.compressed,
    kdfIterations: KDF_ITERATIONS,
    salt,
    iv,
    cipherLength: prepared.bytes.length + 16,
  }
  const headerBytes = encodePublicHeader(header)
  const keys = await deriveKeys(password, salt, header.kdfIterations, true)
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: arrayBuffer(iv),
      additionalData: arrayBuffer(headerBytes),
      tagLength: 128,
    },
    keys.encryptionKey,
    arrayBuffer(prepared.bytes),
  )

  return {
    header,
    headerBytes,
    ciphertext: new Uint8Array(encrypted),
    layoutKey: keys.layoutKey,
  }
}

export async function decryptWithKeys(
  headerBytes: Uint8Array,
  ciphertext: Uint8Array,
  keys: DerivedKeys,
): Promise<SecretPayload> {
  const header = decodePublicHeader(headerBytes)
  if (ciphertext.length !== header.cipherLength) {
    throw new StegoError('INVALID_HEADER')
  }

  let decrypted: Uint8Array
  try {
    const result = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: arrayBuffer(header.iv),
        additionalData: arrayBuffer(headerBytes),
        tagLength: 128,
      },
      keys.encryptionKey,
      arrayBuffer(ciphertext),
    )
    decrypted = new Uint8Array(result)
  } catch {
    throw new StegoError('AUTH_FAILED')
  }

  const serialized = header.compressed ? decompress(decrypted) : decrypted
  return parseSecretPayload(serialized)
}

export async function decryptSecret(
  headerBytes: Uint8Array,
  ciphertext: Uint8Array,
  password: string,
): Promise<SecretPayload> {
  const header = decodePublicHeader(headerBytes)
  const keys = await deriveKeys(password, header.salt, header.kdfIterations)
  return decryptWithKeys(headerBytes, ciphertext, keys)
}

