import { describe, expect, it } from 'vitest'
import { StegoError } from '../../src/domain/errors'
import { workerError } from '../../src/workers/protocol'

describe('worker protocol', () => {
  it('serializes a domain error without stack details', () => {
    const result = workerError('job-1', new StegoError('AUTH_FAILED'))

    expect(result).toEqual({
      type: 'error',
      id: 'job-1',
      code: 'AUTH_FAILED',
      message: '口令错误或图片已损坏。',
    })
    expect(result).not.toHaveProperty('stack')
  })

  it('maps unknown failures to a safe image error', () => {
    expect(workerError('job-2', new Error('C:\\private\\secret.png'))).toEqual({
      type: 'error',
      id: 'job-2',
      code: 'UNSUPPORTED_IMAGE',
      message: '无法读取该图片，请选择 PNG、JPEG 或 WebP 文件。',
    })
  })
})
