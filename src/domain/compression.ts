import { gunzipSync, gzipSync } from 'fflate'
import { StegoError } from './errors'

export interface CompressionResult {
  bytes: Uint8Array
  compressed: boolean
}

export function maybeCompress(source: Uint8Array): CompressionResult {
  const compressed = gzipSync(source, { level: 6, mtime: 0 })
  if (source.length - compressed.length < 32) {
    return { bytes: source, compressed: false }
  }
  return { bytes: compressed, compressed: true }
}

export function decompress(source: Uint8Array): Uint8Array {
  try {
    return gunzipSync(source)
  } catch {
    throw new StegoError('INVALID_PAYLOAD')
  }
}

