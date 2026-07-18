import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StegoError } from '../../src/domain/errors'
import { DecodeView, type DecodeViewProps } from '../../src/features/decode/DecodeView'

const encodedImage = new File([new Uint8Array([1, 2, 3])], 'message.png', {
  type: 'image/png',
})

function setup(overrides: Partial<DecodeViewProps> = {}) {
  const startDecode = vi.fn(() => ({
    promise: Promise.resolve({
      kind: 'text' as const,
      name: '',
      mime: 'text/plain;charset=utf-8',
      bytes: new TextEncoder().encode('decoded secret').buffer,
    }),
    cancel: vi.fn(),
  }))
  const props: DecodeViewProps = { startDecode, ...overrides }
  render(<DecodeView {...props} />)
  return { startDecode }
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:result'),
    revokeObjectURL: vi.fn(),
  })
})

describe('DecodeView', () => {
  it('shows decoded text', async () => {
    const user = userEvent.setup()
    setup()

    await user.upload(screen.getByLabelText('选择含密 PNG'), encodedImage)
    await user.type(screen.getByLabelText('解码口令'), 'password')
    await user.click(screen.getByRole('button', { name: '提取隐藏信息' }))

    expect(await screen.findByLabelText('隐藏文本')).toHaveTextContent('decoded secret')
  })

  it('shows the safe authentication error', async () => {
    const user = userEvent.setup({ delay: null })
    setup({
      startDecode: vi.fn(() => ({
        promise: Promise.reject(new StegoError('AUTH_FAILED')),
        cancel: vi.fn(),
      })),
    })

    await user.upload(screen.getByLabelText('选择含密 PNG'), encodedImage)
    await user.type(screen.getByLabelText('解码口令'), 'wrong')
    await user.click(screen.getByRole('button', { name: '提取隐藏信息' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('口令错误或图片已损坏。')
  })
})
