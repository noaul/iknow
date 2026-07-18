export type StegoErrorCode =
  | 'NO_STEGO_HEADER'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_HEADER'
  | 'INVALID_PAYLOAD'
  | 'INVALID_PASSWORD'
  | 'AUTH_FAILED'
  | 'CAPACITY_EXCEEDED'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE'
  | 'CANCELLED'

const messages: Record<StegoErrorCode, string> = {
  NO_STEGO_HEADER: '这张图片中没有可识别的隐藏信息。',
  UNSUPPORTED_VERSION: '隐藏信息由不兼容的 StegoSend 版本生成。',
  INVALID_HEADER: '图片中的隐藏信息头部无效或已损坏。',
  INVALID_PAYLOAD: '隐藏内容格式无效或已损坏。',
  INVALID_PASSWORD: '口令长度必须为 12 至 1,024 个 UTF-8 字节。',
  AUTH_FAILED: '口令错误或图片已损坏。',
  CAPACITY_EXCEEDED: '载体图片容量不足，请选择更大的图片或更小的内容。',
  IMAGE_TOO_LARGE: '图片尺寸过大，最多支持 2,500 万像素。',
  UNSUPPORTED_IMAGE: '无法读取该图片，请选择 PNG、JPEG 或 WebP 文件。',
  CANCELLED: '操作已取消。',
}

export class StegoError extends Error {
  readonly code: StegoErrorCode

  constructor(code: StegoErrorCode, message = messages[code]) {
    super(message)
    this.name = 'StegoError'
    this.code = code
  }
}

export function toStegoError(error: unknown): StegoError {
  if (error instanceof StegoError) return error
  return new StegoError('INVALID_PAYLOAD')
}

