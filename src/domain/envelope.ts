import { ByteReader, ByteWriter } from './binary'
import { StegoError } from './errors'

const MAGIC = Uint8Array.of(0x53, 0x54, 0x47, 0x32)
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export const PROTOCOL_VERSION = 1
export const PUBLIC_HEADER_BYTES = 42
export const KDF_ITERATIONS = 600_000
export const MAX_KDF_ITERATIONS = 1_000_000
export const MAX_SECRET_BYTES = 5 * 1024 * 1024
export const MAX_CIPHER_BYTES = MAX_SECRET_BYTES + 1024
export const MAX_NAME_BYTES = 255
export const MAX_MIME_BYTES = 127

export interface SecretPayload {
  kind: 'text' | 'file'
  name: string
  mime: string
  bytes: Uint8Array
}

export interface PublicHeader {
  version: number
  compressed: boolean
  kdfIterations: number
  salt: Uint8Array
  iv: Uint8Array
  cipherLength: number
}

function invalidPayload(): never {
  throw new StegoError('INVALID_PAYLOAD')
}

function decodeText(bytes: Uint8Array): string {
  try {
    return textDecoder.decode(bytes)
  } catch {
    return invalidPayload()
  }
}

export function serializeSecretPayload(payload: SecretPayload): Uint8Array {
  const name = textEncoder.encode(payload.name)
  const mime = textEncoder.encode(payload.mime)

  if (payload.kind !== 'text' && payload.kind !== 'file') invalidPayload()
  if (name.length > MAX_NAME_BYTES || mime.length > MAX_MIME_BYTES) invalidPayload()
  if (payload.bytes.length > MAX_SECRET_BYTES) invalidPayload()

  return new ByteWriter()
    .uint8(payload.kind === 'text' ? 0 : 1)
    .uint16(name.length)
    .uint16(mime.length)
    .uint32(payload.bytes.length)
    .bytes(name)
    .bytes(mime)
    .bytes(payload.bytes)
    .finish()
}

export function parseSecretPayload(source: Uint8Array): SecretPayload {
  const reader = new ByteReader(source, 'INVALID_PAYLOAD')
  const kindValue = reader.uint8()
  const nameLength = reader.uint16()
  const mimeLength = reader.uint16()
  const dataLength = reader.uint32()

  if (kindValue > 1) invalidPayload()
  if (nameLength > MAX_NAME_BYTES || mimeLength > MAX_MIME_BYTES) invalidPayload()
  if (dataLength > MAX_SECRET_BYTES) invalidPayload()

  const name = decodeText(reader.bytes(nameLength))
  const mime = decodeText(reader.bytes(mimeLength))
  const bytes = reader.bytes(dataLength)
  if (reader.remaining !== 0) invalidPayload()

  return { kind: kindValue === 0 ? 'text' : 'file', name, mime, bytes }
}

function validateHeader(header: PublicHeader): void {
  if (header.version !== PROTOCOL_VERSION) {
    throw new StegoError('UNSUPPORTED_VERSION')
  }
  if (
    !Number.isInteger(header.kdfIterations) ||
    header.kdfIterations < 1 ||
    header.kdfIterations > MAX_KDF_ITERATIONS ||
    header.salt.length !== 16 ||
    header.iv.length !== 12 ||
    !Number.isInteger(header.cipherLength) ||
    header.cipherLength < 16 ||
    header.cipherLength > MAX_CIPHER_BYTES
  ) {
    throw new StegoError('INVALID_HEADER')
  }
}

export function encodePublicHeader(header: PublicHeader): Uint8Array {
  validateHeader(header)
  return new ByteWriter()
    .bytes(MAGIC)
    .uint8(header.version)
    .uint8(header.compressed ? 1 : 0)
    .uint32(header.kdfIterations)
    .bytes(header.salt)
    .bytes(header.iv)
    .uint32(header.cipherLength)
    .finish()
}

export function decodePublicHeader(source: Uint8Array): PublicHeader {
  if (source.length !== PUBLIC_HEADER_BYTES) {
    throw new StegoError('INVALID_HEADER')
  }
  const reader = new ByteReader(source, 'INVALID_HEADER')
  const magic = reader.bytes(MAGIC.length)
  if (!magic.every((value, index) => value === MAGIC[index])) {
    throw new StegoError('NO_STEGO_HEADER')
  }

  const version = reader.uint8()
  if (version !== PROTOCOL_VERSION) {
    throw new StegoError('UNSUPPORTED_VERSION')
  }
  const flags = reader.uint8()
  if ((flags & 0xfe) !== 0) throw new StegoError('INVALID_HEADER')

  const header: PublicHeader = {
    version,
    compressed: Boolean(flags & 1),
    kdfIterations: reader.uint32(),
    salt: reader.bytes(16),
    iv: reader.bytes(12),
    cipherLength: reader.uint32(),
  }
  validateHeader(header)
  return header
}

