import { PUBLIC_HEADER_BYTES } from './envelope'
import { StegoError } from './errors'

export const MAX_IMAGE_PIXELS = 25_000_000
export const HEADER_BITS = PUBLIC_HEADER_BYTES * 8

export interface ImageCapacity {
  width: number
  height: number
  pixels: number
  totalSlots: number
  headerBits: number
  payloadSlots: number
  maxCipherBytes: number
}

export function calculateCapacity(width: number, height: number): ImageCapacity {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > Math.floor(Number.MAX_SAFE_INTEGER / height)
  ) {
    throw new StegoError('UNSUPPORTED_IMAGE')
  }

  const pixels = width * height
  if (pixels > MAX_IMAGE_PIXELS) throw new StegoError('IMAGE_TOO_LARGE')

  const totalSlots = pixels * 3
  const payloadSlots = Math.max(0, totalSlots - HEADER_BITS)
  return {
    width,
    height,
    pixels,
    totalSlots,
    headerBits: HEADER_BITS,
    payloadSlots,
    maxCipherBytes: Math.floor(payloadSlots / 8),
  }
}

