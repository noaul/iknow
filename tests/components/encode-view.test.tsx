import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EncodeView, type EncodeViewProps } from '../../src/features/encode/EncodeView'

const cover = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })

function setup(overrides: Partial<EncodeViewProps> = {}) {
  const startEncode = vi.fn(() => ({
    promise: Promise.resolve({
      png: Uint8Array.of(137, 80, 78, 71).buffer,
      width: 800,
      height: 600,
    }),
    cancel: vi.fn(),
  }))
  const props: EncodeViewProps = {
    inspectImage: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    startEncode,
    ...overrides,
  }
  render(<EncodeView {...props} />)
  return { startEncode }
}

beforeEach(() => {
  let counter = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:preview-${counter++}`),
    revokeObjectURL: vi.fn(),
  })
})

describe('EncodeView', () => {
  it('requires matching strong passwords', async () => {
    const user = userEvent.setup()
    setup()

    await user.upload(screen.getByLabelText('选择载体图片'), cover)
    await user.type(screen.getByLabelText('秘密文本'), 'private note')
    await user.type(screen.getByLabelText('设置口令'), 'correct horse battery staple')
    await user.type(screen.getByLabelText('确认口令'), 'not the same password')

    expect(screen.getByText('两次输入的口令不一致。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成含密 PNG' })).toBeDisabled()
  })

  it('blocks content that exceeds the image capacity', async () => {
    const user = userEvent.setup()
    setup({ inspectImage: vi.fn().mockResolvedValue({ width: 20, height: 20 }) })

    await user.upload(screen.getByLabelText('选择载体图片'), cover)
    fireEvent.change(screen.getByLabelText('秘密文本'), { target: { value: 'x'.repeat(500) } })
    await user.type(screen.getByLabelText('设置口令'), 'correct horse battery staple')
    await user.type(screen.getByLabelText('确认口令'), 'correct horse battery staple')

    expect(
      screen.getByText('容量不足：请缩小内容或选择分辨率更高的载体图片。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成含密 PNG' })).toBeDisabled()
  })

  it('submits text to the worker and exposes the generated PNG', async () => {
    const user = userEvent.setup()
    const { startEncode } = setup()

    await user.upload(screen.getByLabelText('选择载体图片'), cover)
    await user.type(screen.getByLabelText('秘密文本'), 'private note')
    await user.type(screen.getByLabelText('设置口令'), 'correct horse battery staple')
    await user.type(screen.getByLabelText('确认口令'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: '生成含密 PNG' }))

    await waitFor(() => expect(startEncode).toHaveBeenCalledTimes(1))
    expect(new TextDecoder().decode(new Uint8Array(startEncode.mock.calls[0][0].payload.bytes))).toBe(
      'private note',
    )
    expect(await screen.findByRole('link', { name: '下载含密 PNG' })).toHaveAttribute(
      'download',
      'cover-stego.png',
    )
  })
})
