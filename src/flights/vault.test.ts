import { describe, expect, it } from 'vitest'
import { DEFAULT_ITERATIONS, seal, unseal, WrongCodeError } from './vault'

// Low iteration count keeps the suite fast; production uses DEFAULT_ITERATIONS.
const FAST = 1_000
const secret = JSON.stringify({ flights: [{ month: '2024-01', from: 'ATL', to: 'RDU' }] })

describe('vault', () => {
  it('round-trips with the right code', async () => {
    const vault = await seal(secret, 'K7QF-M2XP-9TRD', FAST)
    expect(await unseal(vault, 'K7QF-M2XP-9TRD')).toBe(secret)
  })

  it('tolerates surrounding whitespace and Unicode normalization differences', async () => {
    const vault = await seal(secret, 'café-2026', FAST)
    // "e" + combining acute accent (NFD) vs the precomposed "é" used above.
    expect(await unseal(vault, '  café-2026 ')).toBe(secret)
  })

  it('rejects a wrong code', async () => {
    const vault = await seal(secret, 'right-code', FAST)
    await expect(unseal(vault, 'wrong-code')).rejects.toBeInstanceOf(WrongCodeError)
  })

  it('rejects a tampered ciphertext (GCM authentication)', async () => {
    const vault = await seal(secret, 'right-code', FAST)
    const bytes = atob(vault.data).split('')
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1)
    await expect(unseal({ ...vault, data: btoa(bytes.join('')) }, 'right-code')).rejects.toBeInstanceOf(WrongCodeError)
  })

  it('uses a fresh salt and IV every time, so identical input never repeats', async () => {
    const [a, b] = await Promise.all([seal(secret, 'same', FAST), seal(secret, 'same', FAST)])
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('never contains the plaintext', async () => {
    const vault = await seal(secret, 'code', FAST)
    const serialized = JSON.stringify(vault)
    // Quoted JSON keys can't occur by chance: `"` isn't in the base64 alphabet.
    for (const leak of ['"month"', '"from"', '"flights"']) expect(serialized).not.toContain(leak)
    expect(Object.keys(vault).sort()).toEqual(['cipher', 'data', 'iterations', 'iv', 'kdf', 'salt', 'version'])
  })

  it('defaults to a strong key-derivation cost', () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })
})
