import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_IMAGE_FILE_BYTES,
  assertSupportedImage,
  decodeImageFile,
  hasAnimationMarker,
  validateImageDimensions,
} from '../../src/image/decode-image'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('image input validation', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(() => assertSupportedImage(new File([Uint8Array.of(1)], 'cover', { type }))).not.toThrow()
  })

  it('rejects SVG even when it has an image extension', () => {
    expect(() =>
      assertSupportedImage(new File(['<svg/>'], 'cover.png', { type: 'image/svg+xml' })),
    ).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_IMAGE' }))
  })

  it('rejects files larger than 30 MiB', () => {
    const oversized = new File(
      [new Uint8Array(MAX_IMAGE_FILE_BYTES + 1)],
      'large.png',
      { type: 'image/png' },
    )

    expect(() => assertSupportedImage(oversized)).toThrow(
      expect.objectContaining({ code: 'IMAGE_TOO_LARGE' }),
    )
  })

  it('detects APNG and animated WebP markers', () => {
    const apng = new TextEncoder().encode('\x89PNG\r\n\x1a\n0000acTL0000')
    const webp = new TextEncoder().encode('RIFF0000WEBPVP8X0000ANIM')

    expect(hasAnimationMarker(apng, 'image/png')).toBe(true)
    expect(hasAnimationMarker(webp, 'image/webp')).toBe(true)
    expect(hasAnimationMarker(new TextEncoder().encode('plain'), 'image/png')).toBe(false)
  })

  it('rejects dimensions above 25 million pixels', () => {
    expect(() => validateImageDimensions(5_001, 5_000)).toThrow(
      expect.objectContaining({ code: 'IMAGE_TOO_LARGE' }),
    )
  })

  it('maps browser decode failures to UNSUPPORTED_IMAGE', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decoder failed')))

    await expect(
      decodeImageFile(new File([Uint8Array.of(1)], 'broken.png', { type: 'image/png' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' })
  })
})
