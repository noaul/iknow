import { MAX_IMAGE_PIXELS } from './capacity'
import { StegoError } from './errors'

const domain = new TextEncoder().encode('StegoSend/layout/v1')
const MAX_SLOT_COUNT = MAX_IMAGE_PIXELS * 3

export interface SlotOrder {
  offset: number
  stride: number
  size: number
  at(index: number): number
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

export function gcd(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

export async function createSlotOrder(
  layoutKey: Uint8Array,
  size: number,
): Promise<SlotOrder> {
  if (layoutKey.length !== 32 || !Number.isSafeInteger(size) || size < 1 || size > MAX_SLOT_COUNT) {
    throw new StegoError('INVALID_HEADER')
  }

  const input = new Uint8Array(domain.length + layoutKey.length)
  input.set(domain)
  input.set(layoutKey, domain.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer(input)))
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
  const offset = view.getUint32(0) % size
  let stride = (view.getUint32(4) % size) || 1
  while (gcd(stride, size) !== 1) {
    stride = stride === size - 1 ? 1 : stride + 1
  }

  return {
    offset,
    stride,
    size,
    at(index: number): number {
      if (!Number.isSafeInteger(index) || index < 0) {
        throw new StegoError('INVALID_HEADER')
      }
      return (offset + ((index % size) * stride) % size) % size
    },
  }
}

