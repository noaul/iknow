import { HEADER_BITS, calculateCapacity } from './capacity'
import { decryptWithKeys, deriveKeys, encryptSecret } from './crypto'
import {
  PUBLIC_HEADER_BYTES,
  decodePublicHeader,
  type SecretPayload,
} from './envelope'
import { StegoError } from './errors'
import { createSlotOrder } from './slot-order'

export interface ExtractedEnvelope {
  headerBytes: Uint8Array
  ciphertext: Uint8Array
}

export function rgbSlotToRgbaIndex(slot: number): number {
  const pixel = Math.floor(slot / 3)
  const channel = slot % 3
  return pixel * 4 + channel
}

function validatePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ReturnType<typeof calculateCapacity> {
  const capacity = calculateCapacity(width, height)
  if (pixels.length !== capacity.pixels * 4) {
    throw new StegoError('UNSUPPORTED_IMAGE')
  }
  return capacity
}

function writeBit(pixels: Uint8ClampedArray, rgbSlot: number, bit: number): void {
  const index = rgbSlotToRgbaIndex(rgbSlot)
  pixels[index] = (pixels[index] & 0xfe) | (bit & 1)
}

function readBit(pixels: Uint8ClampedArray, rgbSlot: number): number {
  return pixels[rgbSlotToRgbaIndex(rgbSlot)] & 1
}

function writeSequential(
  pixels: Uint8ClampedArray,
  source: Uint8Array,
  startSlot: number,
): void {
  for (let bitIndex = 0; bitIndex < source.length * 8; bitIndex += 1) {
    const byte = source[Math.floor(bitIndex / 8)]
    const bit = (byte >> (7 - (bitIndex % 8))) & 1
    writeBit(pixels, startSlot + bitIndex, bit)
  }
}

function readSequential(
  pixels: Uint8ClampedArray,
  byteLength: number,
  startSlot: number,
): Uint8Array {
  const result = new Uint8Array(byteLength)
  for (let bitIndex = 0; bitIndex < byteLength * 8; bitIndex += 1) {
    const bit = readBit(pixels, startSlot + bitIndex)
    result[Math.floor(bitIndex / 8)] |= bit << (7 - (bitIndex % 8))
  }
  return result
}

export function extractHeaderBytes(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const capacity = validatePixels(pixels, width, height)
  if (capacity.totalSlots < HEADER_BITS) throw new StegoError('NO_STEGO_HEADER')
  const headerBytes = readSequential(pixels, PUBLIC_HEADER_BYTES, 0)
  decodePublicHeader(headerBytes)
  return headerBytes
}

export async function embedEnvelope(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  headerBytes: Uint8Array,
  ciphertext: Uint8Array,
  layoutKey: Uint8Array,
): Promise<Uint8ClampedArray> {
  const capacity = validatePixels(source, width, height)
  const header = decodePublicHeader(headerBytes)
  if (ciphertext.length !== header.cipherLength) {
    throw new StegoError('INVALID_HEADER')
  }
  if (capacity.totalSlots < HEADER_BITS || ciphertext.length > capacity.maxCipherBytes) {
    throw new StegoError('CAPACITY_EXCEEDED')
  }

  const result = new Uint8ClampedArray(source)
  writeSequential(result, headerBytes, 0)
  const order = await createSlotOrder(layoutKey, capacity.payloadSlots)
  for (let bitIndex = 0; bitIndex < ciphertext.length * 8; bitIndex += 1) {
    const byte = ciphertext[Math.floor(bitIndex / 8)]
    const bit = (byte >> (7 - (bitIndex % 8))) & 1
    writeBit(result, HEADER_BITS + order.at(bitIndex), bit)
  }
  return result
}

export async function extractEnvelope(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  layoutKey: Uint8Array,
): Promise<ExtractedEnvelope> {
  const capacity = validatePixels(pixels, width, height)
  const headerBytes = extractHeaderBytes(pixels, width, height)
  const header = decodePublicHeader(headerBytes)
  if (header.cipherLength > capacity.maxCipherBytes) {
    throw new StegoError('INVALID_HEADER')
  }

  const order = await createSlotOrder(layoutKey, capacity.payloadSlots)
  const ciphertext = new Uint8Array(header.cipherLength)
  for (let bitIndex = 0; bitIndex < ciphertext.length * 8; bitIndex += 1) {
    const bit = readBit(pixels, HEADER_BITS + order.at(bitIndex))
    ciphertext[Math.floor(bitIndex / 8)] |= bit << (7 - (bitIndex % 8))
  }
  return { headerBytes, ciphertext }
}

export async function encodePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  payload: SecretPayload,
  password: string,
): Promise<Uint8ClampedArray> {
  validatePixels(source, width, height)
  const encrypted = await encryptSecret(payload, password)
  return embedEnvelope(
    source,
    width,
    height,
    encrypted.headerBytes,
    encrypted.ciphertext,
    encrypted.layoutKey,
  )
}

export async function decodePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  password: string,
): Promise<SecretPayload> {
  const headerBytes = extractHeaderBytes(pixels, width, height)
  const header = decodePublicHeader(headerBytes)
  const keys = await deriveKeys(password, header.salt, header.kdfIterations)
  const extracted = await extractEnvelope(pixels, width, height, keys.layoutKey)
  return decryptWithKeys(extracted.headerBytes, extracted.ciphertext, keys)
}

