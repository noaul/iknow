import { calculateCapacity } from '../domain/capacity'
import { StegoError } from '../domain/errors'

export const MAX_IMAGE_FILE_BYTES = 30 * 1024 * 1024
const INSPECTION_BYTES = 1024 * 1024
const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export interface DecodedImage {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface ImageDimensions {
  width: number
  height: number
}

function containsAscii(bytes: Uint8Array, marker: string): boolean {
  const encoded = new TextEncoder().encode(marker)
  outer: for (let offset = 0; offset <= bytes.length - encoded.length; offset += 1) {
    for (let index = 0; index < encoded.length; index += 1) {
      if (bytes[offset + index] !== encoded[index]) continue outer
    }
    return true
  }
  return false
}

export function hasAnimationMarker(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/png') return containsAscii(bytes, 'acTL')
  if (type === 'image/webp') return containsAscii(bytes, 'ANIM')
  return false
}

export function assertSupportedImage(file: File): void {
  if (!supportedTypes.has(file.type) || file.size === 0) {
    throw new StegoError('UNSUPPORTED_IMAGE')
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new StegoError('IMAGE_TOO_LARGE')
}

export function validateImageDimensions(width: number, height: number): void {
  calculateCapacity(width, height)
}

async function inspectAnimation(file: File): Promise<void> {
  const prefix = new Uint8Array(
    await file.slice(0, Math.min(file.size, INSPECTION_BYTES)).arrayBuffer(),
  )
  if (hasAnimationMarker(prefix, file.type)) {
    throw new StegoError('UNSUPPORTED_IMAGE', '暂不支持动画 PNG 或动画 WebP。')
  }
}

export async function inspectImageFile(file: File): Promise<ImageDimensions> {
  assertSupportedImage(file)
  try {
    await inspectAnimation(file)
    const bitmap = await createImageBitmap(file)
    try {
      validateImageDimensions(bitmap.width, bitmap.height)
      return { width: bitmap.width, height: bitmap.height }
    } finally {
      bitmap.close()
    }
  } catch (error) {
    if (error instanceof StegoError) throw error
    throw new StegoError('UNSUPPORTED_IMAGE')
  }
}

function drawToPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new StegoError('UNSUPPORTED_IMAGE')
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data.slice()
  }

  if (typeof document === 'undefined') throw new StegoError('UNSUPPORTED_IMAGE')
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new StegoError('UNSUPPORTED_IMAGE')
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, bitmap.width, bitmap.height).data.slice()
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  assertSupportedImage(file)
  try {
    await inspectAnimation(file)
    const bitmap = await createImageBitmap(file)
    try {
      validateImageDimensions(bitmap.width, bitmap.height)
      return {
        width: bitmap.width,
        height: bitmap.height,
        pixels: drawToPixels(bitmap),
      }
    } finally {
      bitmap.close()
    }
  } catch (error) {
    if (error instanceof StegoError) throw error
    throw new StegoError('UNSUPPORTED_IMAGE')
  }
}

function copyPixelsToContext(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const imageData = context.createImageData(width, height)
  imageData.data.set(pixels)
  context.putImageData(imageData, 0, 0)
}

export async function pixelsToPng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  validateImageDimensions(width, height)
  if (pixels.length !== width * height * 4) throw new StegoError('UNSUPPORTED_IMAGE')

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new StegoError('UNSUPPORTED_IMAGE')
    copyPixelsToContext(context, pixels, width, height)
    return canvas.convertToBlob({ type: 'image/png' })
  }

  if (typeof document === 'undefined') throw new StegoError('UNSUPPORTED_IMAGE')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new StegoError('UNSUPPORTED_IMAGE')
  copyPixelsToContext(context, pixels, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new StegoError('UNSUPPORTED_IMAGE'))
    }, 'image/png')
  })
}
