import { describe, expect, it } from 'vitest'
import { HEADER_BITS, MAX_IMAGE_PIXELS, calculateCapacity } from '../../src/domain/capacity'

describe('image capacity', () => {
  it('reports zero bytes when the public header does not fit', () => {
    expect(calculateCapacity(1, 1)).toMatchObject({
      totalSlots: 3,
      headerBits: HEADER_BITS,
      maxCipherBytes: 0,
    })
  })

  it('reports one byte when nine payload bits are available', () => {
    expect(calculateCapacity(115, 1).maxCipherBytes).toBe(1)
  })

  it('handles the maximum supported image size', () => {
    expect(calculateCapacity(5_000, 5_000).pixels).toBe(MAX_IMAGE_PIXELS)
  })

  it('rejects dimensions beyond 25 million pixels', () => {
    expect(() => calculateCapacity(5_001, 5_000)).toThrow(
      expect.objectContaining({ code: 'IMAGE_TOO_LARGE' }),
    )
  })

  it.each([
    [0, 10],
    [-1, 10],
    [1.5, 10],
    [Number.MAX_SAFE_INTEGER, 2],
  ])('rejects invalid dimensions %s x %s', (width, height) => {
    expect(() => calculateCapacity(width, height)).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_IMAGE' }),
    )
  })
})
