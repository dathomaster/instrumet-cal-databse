/**
 * Offline sign-in. After a successful online sign-in we keep a salted,
 * slow (PBKDF2) fingerprint of the password — never the password itself — so
 * the same person can unlock their local data later without internet.
 */
const KEY = 'cal.localLogin'
const ITERATIONS = 210_000

interface Stored { email: string; salt: string; hash: string; iterations: number }

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return b64(bits)
}

export async function rememberLocalLogin(email: string, password: string): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const stored: Stored = { email: email.toLowerCase(), salt: b64(salt), hash: await derive(password, salt, ITERATIONS), iterations: ITERATIONS }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* storage unavailable — offline sign-in just won't be possible */
  }
}

export async function checkLocalLogin(email: string, password: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const s = JSON.parse(raw) as Stored
    if (s.email !== email.toLowerCase()) return false
    const hash = await derive(password, unb64(s.salt), s.iterations)
    // constant-time-ish compare
    let diff = hash.length ^ s.hash.length
    for (let i = 0; i < Math.min(hash.length, s.hash.length); i++) diff |= hash.charCodeAt(i) ^ s.hash.charCodeAt(i)
    return diff === 0
  } catch {
    return false
  }
}

export function hasLocalLogin(): boolean {
  try { return !!localStorage.getItem(KEY) } catch { return false }
}

export function forgetLocalLogin(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
