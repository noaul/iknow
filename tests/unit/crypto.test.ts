import { describe, expect, it } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  normalizePassword,
} from '../../src/domain/crypto'
import { StegoError } from '../../src/domain/errors'

const payload = {
  kind: 'text' as const,
  name: '',
  mime: 'text/plain;charset=utf-8',
  bytes: new TextEncoder().encode('真正的秘密'),
}

describe('authenticated encryption', () => {
  it('round-trips a secret payload', async () => {
    const encrypted = await encryptSecret(payload, 'correct horse battery staple')

    const decrypted = await decryptSecret(
      encrypted.headerBytes,
      encrypted.ciphertext,
      'correct horse battery staple',
    )

    expect(decrypted).toMatchObject({
      kind: payload.kind,
      name: payload.name,
      mime: payload.mime,
    })
    expect(Array.from(decrypted.bytes)).toEqual(Array.from(payload.bytes))
    expect(encrypted.layoutKey).toHaveLength(32)
  })

  it('uses fresh salt and IV for every encryption', async () => {
    const first = await encryptSecret(payload, 'correct horse battery staple')
    const second = await encryptSecret(payload, 'correct horse battery staple')

    expect(first.headerBytes).not.toEqual(second.headerBytes)
    expect(first.ciphertext).not.toEqual(second.ciphertext)
  })

  it('maps a wrong password to AUTH_FAILED', async () => {
    const encrypted = await encryptSecret(payload, 'correct horse battery staple')

    await expect(
      decryptSecret(encrypted.headerBytes, encrypted.ciphertext, 'incorrect password'),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('rejects a one-bit ciphertext change', async () => {
    const encrypted = await encryptSecret(payload, 'correct horse battery staple')
    encrypted.ciphertext[0] ^= 1

    await expect(
      decryptSecret(encrypted.headerBytes, encrypted.ciphertext, 'correct horse battery staple'),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('authenticates the public header', async () => {
    const encrypted = await encryptSecret(payload, 'correct horse battery staple')
    encrypted.headerBytes[5] ^= 1

    await expect(
      decryptSecret(encrypted.headerBytes, encrypted.ciphertext, 'correct horse battery staple'),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })
})

describe('password normalization', () => {
  it('normalizes canonically equivalent Unicode passwords', () => {
    expect(normalizePassword('Cafe\u0301 password', true)).toEqual(
      normalizePassword('Café password', true),
    )
  })

  it('rejects short passwords for new messages', () => {
    expect(() => normalizePassword('short', true)).toThrowError(StegoError)
  })

  it('allows short passwords when decoding older messages', () => {
    expect(normalizePassword('old', false)).toEqual(new TextEncoder().encode('old'))
  })
})
