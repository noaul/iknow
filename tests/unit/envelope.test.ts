import { describe, expect, it } from 'vitest'
import {
  KDF_ITERATIONS,
  MAX_CIPHER_BYTES,
  PUBLIC_HEADER_BYTES,
  decodePublicHeader,
  encodePublicHeader,
  parseSecretPayload,
  serializeSecretPayload,
  type PublicHeader,
} from '../../src/domain/envelope'
import { maybeCompress, decompress } from '../../src/domain/compression'
import { StegoError } from '../../src/domain/errors'

const header = (overrides: Partial<PublicHeader> = {}): PublicHeader => ({
  version: 1,
  compressed: false,
  kdfIterations: KDF_ITERATIONS,
  salt: new Uint8Array(16).fill(1),
  iv: new Uint8Array(12).fill(2),
  cipherLength: 32,
  ...overrides,
})

describe('secret payload envelope', () => {
  it('round-trips a Unicode file name and bytes', () => {
    const encoded = serializeSecretPayload({
      kind: 'file',
      name: '会议记录-最终版.txt',
      mime: 'text/plain',
      bytes: new Uint8Array([0, 1, 2, 255]),
    })

    expect(parseSecretPayload(encoded)).toEqual({
      kind: 'file',
      name: '会议记录-最终版.txt',
      mime: 'text/plain',
      bytes: new Uint8Array([0, 1, 2, 255]),
    })
  })

  it('supports an empty text payload', () => {
    const encoded = serializeSecretPayload({
      kind: 'text',
      name: '',
      mime: 'text/plain;charset=utf-8',
      bytes: new Uint8Array(),
    })

    expect(parseSecretPayload(encoded).bytes).toHaveLength(0)
  })

  it('rejects a file name longer than 255 UTF-8 bytes', () => {
    expect(() =>
      serializeSecretPayload({
        kind: 'file',
        name: '密'.repeat(86),
        mime: 'application/octet-stream',
        bytes: new Uint8Array([1]),
      }),
    ).toThrowError(StegoError)
  })

  it('rejects a truncated payload instead of exposing DataView errors', () => {
    const encoded = serializeSecretPayload({
      kind: 'text',
      name: '',
      mime: 'text/plain',
      bytes: new Uint8Array([1, 2, 3]),
    })

    expect(() => parseSecretPayload(encoded.subarray(0, encoded.length - 1))).toThrow(
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    )
  })
})

describe('public header', () => {
  it('uses the fixed 42-byte format', () => {
    const encoded = encodePublicHeader(header())

    expect(encoded).toHaveLength(PUBLIC_HEADER_BYTES)
    expect(decodePublicHeader(encoded)).toEqual(header())
  })

  it('rejects a truncated header', () => {
    expect(() => decodePublicHeader(new Uint8Array(PUBLIC_HEADER_BYTES - 1))).toThrow(
      expect.objectContaining({ code: 'INVALID_HEADER' }),
    )
  })

  it('rejects an unsupported protocol version', () => {
    const encoded = encodePublicHeader(header())
    encoded[4] = 9

    expect(() => decodePublicHeader(encoded)).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }),
    )
  })

  it('rejects excessive KDF work before deriving a key', () => {
    const encoded = encodePublicHeader(header())
    new DataView(encoded.buffer).setUint32(6, 1_000_001)

    expect(() => decodePublicHeader(encoded)).toThrow(
      expect.objectContaining({ code: 'INVALID_HEADER' }),
    )
  })

  it('rejects a declared ciphertext beyond the hard limit', () => {
    const encoded = encodePublicHeader(header())
    new DataView(encoded.buffer).setUint32(38, MAX_CIPHER_BYTES + 1)

    expect(() => decodePublicHeader(encoded)).toThrow(
      expect.objectContaining({ code: 'INVALID_HEADER' }),
    )
  })
})

describe('compression policy', () => {
  it('compresses only when gzip saves at least 32 bytes', () => {
    const compressible = new TextEncoder().encode('private note\n'.repeat(300))
    const result = maybeCompress(compressible)

    expect(result.compressed).toBe(true)
    expect(Array.from(decompress(result.bytes))).toEqual(Array.from(compressible))
  })

  it('keeps a small payload uncompressed', () => {
    const source = new Uint8Array([1, 2, 3, 4])

    expect(maybeCompress(source)).toEqual({ bytes: source, compressed: false })
  })
})
