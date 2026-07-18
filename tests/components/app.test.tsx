import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'jest-axe'
import App from '../../src/app/App'

describe('App', () => {
  it('opens the encoding workspace by default and switches to decoding', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByRole('heading', { name: '藏入信息' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '提取信息' }))
    expect(screen.getByRole('heading', { name: '提取信息' })).toBeInTheDocument()
  })

  it('has no serious accessibility violations in its initial state', async () => {
    const { container } = render(<App />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
