import { useState, type FormEvent } from 'react'

interface Props {
  onUnlock: (code: string) => Promise<void>
}

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'error'; message: string }

/**
 * Unlocks the encrypted flight log. Decryption happens in the browser; the code
 * is never sent anywhere. The key derivation (PBKDF2, 600k iterations) is what
 * slows guessing: this form's cooldown only discourages casual retries.
 */
export default function UnlockForm({ onUnlock }: Props) {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [failures, setFailures] = useState(0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim() || status.kind === 'working') return
    setStatus({ kind: 'working' })
    try {
      await onUnlock(code)
      setCode('')
      setStatus({ kind: 'idle' })
    } catch (error) {
      const wrong = error instanceof Error && error.name === 'WrongCodeError'
      setFailures((n) => n + 1)
      if (failures + 1 >= 5) await new Promise((r) => setTimeout(r, 3000))
      setStatus({
        kind: 'error',
        message: wrong ? 'That code didn’t work.' : 'Couldn’t load the detailed log. Try again.',
      })
    }
  }

  return (
    <form className="unlock" onSubmit={submit}>
      <div className="unlock__head">
        <svg className="unlock__icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
        </svg>
        <div>
          <h3>Detailed log is private</h3>
          <p>
            The public view shows where I’ve flown, not how often or when. Visit counts, dates, the monthly chart,
            punctuality and the replay are encrypted.
          </p>
        </div>
      </div>
      <label className="unlock__field">
        <span className="sr-only">Access code</span>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={status.kind === 'error'}
          aria-describedby="unlock-status"
        />
        <button type="submit" className="btn btn--signal" disabled={status.kind === 'working' || !code.trim()}>
          {status.kind === 'working' ? 'Unlocking…' : 'Unlock'}
        </button>
      </label>
      <p id="unlock-status" className="unlock__status" role="status">
        {status.kind === 'error' ? status.message : 'Decrypted in your browser. The code never leaves this page.'}
      </p>
    </form>
  )
}
