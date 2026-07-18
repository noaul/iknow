import { StegoError, type StegoErrorCode } from './errors'

export class ByteWriter {
  private readonly chunks: Uint8Array[] = []
  private length = 0

  uint8(value: number): this {
    this.chunks.push(Uint8Array.of(value & 0xff))
    this.length += 1
    return this
  }

  uint16(value: number): this {
    const chunk = new Uint8Array(2)
    new DataView(chunk.buffer).setUint16(0, value)
    this.chunks.push(chunk)
    this.length += chunk.length
    return this
  }

  uint32(value: number): this {
    const chunk = new Uint8Array(4)
    new DataView(chunk.buffer).setUint32(0, value)
    this.chunks.push(chunk)
    this.length += chunk.length
    return this
  }

  bytes(value: Uint8Array): this {
    this.chunks.push(value)
    this.length += value.length
    return this
  }

  finish(): Uint8Array {
    const result = new Uint8Array(this.length)
    let offset = 0
    for (const chunk of this.chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }
}

export class ByteReader {
  private offset = 0
  private readonly source: Uint8Array
  private readonly errorCode: StegoErrorCode

  constructor(source: Uint8Array, errorCode: StegoErrorCode) {
    this.source = source
    this.errorCode = errorCode
  }

  get remaining(): number {
    return this.source.length - this.offset
  }

  uint8(): number {
    this.ensure(1)
    return this.source[this.offset++]
  }

  uint16(): number {
    this.ensure(2)
    const value = new DataView(
      this.source.buffer,
      this.source.byteOffset + this.offset,
      2,
    ).getUint16(0)
    this.offset += 2
    return value
  }

  uint32(): number {
    this.ensure(4)
    const value = new DataView(
      this.source.buffer,
      this.source.byteOffset + this.offset,
      4,
    ).getUint32(0)
    this.offset += 4
    return value
  }

  bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new StegoError(this.errorCode)
    }
    this.ensure(length)
    const value = this.source.slice(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  private ensure(length: number): void {
    if (length > this.remaining) throw new StegoError(this.errorCode)
  }
}
