import { describe, expect, it } from 'vitest'
import { createSlotOrder, gcd } from '../../src/domain/slot-order'

const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1)

describe('keyed slot order', () => {
  it.each([2, 3, 16, 99, 1_000])('visits every one of %i slots exactly once', async (size) => {
    const order = await createSlotOrder(key, size)
    const visited = Array.from({ length: size }, (_, index) => order.at(index))

    expect(new Set(visited).size).toBe(size)
    expect(visited.every((value) => value >= 0 && value < size)).toBe(true)
    expect(order.at(size)).toBe(order.at(0))
    expect(gcd(order.stride, size)).toBe(1)
  })

  it('is deterministic for the same key and slot count', async () => {
    const first = await createSlotOrder(key, 100_000)
    const second = await createSlotOrder(key, 100_000)

    expect(first).toMatchObject({ offset: second.offset, stride: second.stride })
    expect(first.at(83_117)).toBe(second.at(83_117))
  })

  it('changes the layout for a different key', async () => {
    const first = await createSlotOrder(key, 10_007)
    const second = await createSlotOrder(new Uint8Array(32).fill(7), 10_007)

    expect([first.offset, first.stride]).not.toEqual([second.offset, second.stride])
  })

  it('enumerates 100,000 slots without allocating a permutation table', async () => {
    const order = await createSlotOrder(key, 100_000)
    const start = performance.now()
    let checksum = 0
    for (let index = 0; index < 100_000; index += 1) checksum ^= order.at(index)

    expect(performance.now() - start).toBeLessThan(1_000)
    expect(checksum).toBeGreaterThanOrEqual(0)
  })
})
