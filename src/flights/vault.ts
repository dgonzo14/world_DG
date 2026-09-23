/**
 * Encrypt the detailed flight log so it can live on a public static site.
 *
 * A PIN check in JavaScript protects nothing on GitHub Pages: anyone can fetch
 * the data file directly. So the detailed log is published only as ciphertext,
 * and the browser decrypts it locally when the right code is entered.
 *
 *   key        = PBKDF2-SHA256(code, random 16-byte salt, 600k iterations)
 *   ciphertext = AES-256-GCM(key, random 12-byte IV, JSON)
 *
 * GCM is authenticated, so a wrong code or a tampered file fails to decrypt
 * rather than producing garbage. The iteration count makes each guess slow;
 * even so, the real protection is a code with enough entropy (a 6-digit PIN
 * can be brute-forced offline from the public file).
 *
 * Uses only Web Crypto, which is identical in browsers and Node ≥ 20.
 */

export interface Vault {
  version: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  data: string
}

/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000

export class WrongCodeError extends Error {
  constructor() {
    super('That code did not unlock the flight log.')
    this.name = 'WrongCodeError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(code: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  // NFKC so the same code typed on different keyboards derives the same key.
  const material = await crypto.subtle.importKey('raw', encoder.encode(code.trim().normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(plaintext: string, code: string, iterations = DEFAULT_ITERATIONS): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(code, salt, iterations)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)))
  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(data),
  }
}

export async function unseal(vault: Vault, code: string): Promise<string> {
  if (vault.version !== 1 || vault.kdf !== 'PBKDF2-SHA256' || vault.cipher !== 'AES-256-GCM') {
    throw new Error('Unsupported vault format')
  }
  const key = await deriveKey(code, fromBase64(vault.salt), vault.iterations)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.data))
    return decoder.decode(plain)
  } catch {
    // GCM authentication failed: wrong code, or the file was modified.
    throw new WrongCodeError()
  }
}
