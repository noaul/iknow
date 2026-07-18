import { describe, expect, it } from 'vitest'
import { HEADER_BITS } from '../../src/domain/capacity'
import { encryptSecret } from '../../src/domain/crypto'
import {
  KDF_ITERATIONS,
  encodePublicHeader,
  type SecretPayload,
} from '../../src/domain/envelope'
import { createSlotOrder } from '../../src/domain/slot-order'
import {
  decodePixels,
  embedEnvelope,
  encodePixels,
  extractEnvelope,
  rgbSlotToRgbaIndex,
} from '../../src/domain/stego'

function carrier(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = (index * 13) % 256
    pixels[index + 1] = (index * 29) % 256
    pixels[index + 2] = (index * 47) % 256
    pixels[index + 3] = (index * 61) % 256
  }
  return pixels
}

const textPayload = (text: string): SecretPayload => ({
  kind: 'text',
  name: '',
  mime: 'text/plain;charset=utf-8',
  bytes: new TextEncoder().encode(text),
})

describe('pixel steganography', () => {
  it('round-trips an encrypted text payload', async () => {
    const source = carrier(160, 120)
    const encoded = await encodePixels(
      source,
      160,
      120,
      textPayload('只在本机出现的内容'),
      'correct horse battery staple',
    )

    const decoded = await decodePixels(
      encoded,
      160,
      120,
      'correct horse battery staple',
    )

    expect(new TextDecoder().decode(decoded.bytes)).toBe('只在本机出现的内容')
  })

  it('does not mutate the source, alpha, or the high seven RGB bits', async () => {
    const source = carrier(96, 96)
    const snapshot = source.slice()
    const encoded = await encodePixels(
      source,
      96,
      96,
      textPayload('small secret'),
      'correct horse battery staple',
    )

    expect(source).toEqual(snapshot)
    for (let index = 0; index < source.length; index += 4) {
      expect(encoded[index] & 0xfe).toBe(source[index] & 0xfe)
      expect(encoded[index + 1] & 0xfe).toBe(source[index + 1] & 0xfe)
      expect(encoded[index + 2] & 0xfe).toBe(source[index + 2] & 0xfe)
      expect(encoded[index + 3]).toBe(source[index + 3])
    }
  })

  it('rejects a payload that cannot fit', async () => {
    await expect(
      encodePixels(
        carrier(16, 16),
        16,
        16,
        textPayload('x'.repeat(1_000)),
        'correct horse battery staple',
      ),
    ).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' })
  })

  it('rejects an ordinary image without deriving a key', async () => {
    await expect(
      decodePixels(new Uint8ClampedArray(80 * 80 * 4), 80, 80, 'some password'),
    ).rejects.toMatchObject({ code: 'NO_STEGO_HEADER' })
  })

  it('does not return partial plaintext for a wrong password', async () => {
    const encoded = await encodePixels(
      carrier(96, 96),
      96,
      96,
      textPayload('authenticated'),
      'correct horse battery staple',
    )

    await expect(decodePixels(encoded, 96, 96, 'incorrect password')).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    })
  })

  it('detects a bit change at a used ciphertext slot', async () => {
    const width = 96
    const height = 96
    const encrypted = await encryptSecret(
      textPayload('authenticated'),
      'correct horse battery staple',
    )
    const encoded = await embedEnvelope(
      carrier(width, height),
      width,
      height,
      encrypted.headerBytes,
      encrypted.ciphertext,
      encrypted.layoutKey,
    )
    const order = await createSlotOrder(encrypted.layoutKey, width * height * 3 - HEADER_BITS)
    const rgbaIndex = rgbSlotToRgbaIndex(HEADER_BITS + order.at(0))
    encoded[rgbaIndex] ^= 1

    await expect(
      decodePixels(encoded, width, height, 'correct horse battery staple'),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })
})

describe('raw envelope embedding', () => {
  it('round-trips 100 different image and ciphertext sizes', async () => {
    const layoutKey = Uint8Array.from({ length: 32 }, (_, index) => index * 3)

    for (let round = 0; round < 100; round += 1) {
      const width = 24 + (round % 10)
      const height = 24 + (round % 7)
      const ciphertext = Uint8Array.from(
        { length: 16 + (round % 40) },
        (_, index) => (index * 17 + round) % 256,
      )
      const headerBytes = encodePublicHeader({
        version: 1,
        compressed: false,
        kdfIterations: KDF_ITERATIONS,
        salt: new Uint8Array(16).fill(round),
        iv: new Uint8Array(12).fill(100 - round),
        cipherLength: ciphertext.length,
      })

      const pixels = await embedEnvelope(
        carrier(width, height),
        width,
        height,
        headerBytes,
        ciphertext,
        layoutKey,
      )
      const extracted = await extractEnvelope(pixels, width, height, layoutKey)

      expect(Array.from(extracted.headerBytes)).toEqual(Array.from(headerBytes))
      expect(Array.from(extracted.ciphertext)).toEqual(Array.from(ciphertext))
    }
  })
})
