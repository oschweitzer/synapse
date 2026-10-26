'use client'

import { useEffect, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; signedOut?: boolean } & Record<string, unknown>
  return { ok: res.ok, json }
}

export function UnlockForm({ next, hasPasskeys }: { next: string; hasPasskeys: boolean }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canUsePasskey, setCanUsePasskey] = useState(false)

  useEffect(() => {
    if (!hasPasskeys || !window.PublicKeyCredential) return
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setCanUsePasskey)
      .catch(() => setCanUsePasskey(false))
  }, [hasPasskeys])

  function done() {
    // Navigation complète : le cookie de déverrouillage doit partir avec la requête.
    window.location.assign(next)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!code || busy) return
    setBusy(true)
    setError(null)
    const { ok, json } = await post('/api/lock/verify', { code })
    if (ok) return done()
    setBusy(false)
    setCode('')
    if (json.signedOut) return window.location.assign('/login')
    setError(json.error ?? 'Vérification impossible, réessaie.')
  }

  async function useFingerprint() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const options = await post('/api/lock/passkey/auth-options')
      if (!options.ok) throw new Error(options.json.error)
      const response = await startAuthentication({ optionsJSON: options.json as never })
      const verified = await post('/api/lock/passkey/auth-verify', { response })
      if (!verified.ok) throw new Error(verified.json.error)
      return done()
    } catch (e) {
      // Annulation par l'utilisateur : pas de message d'erreur bruyant.
      const cancelled = e instanceof Error && e.name === 'NotAllowedError'
      setError(cancelled ? 'Empreinte annulée. Tu peux saisir ton code.' : (e instanceof Error && e.message) || 'Empreinte non reconnue.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="unlock-code" className="sr-only">
          Code de déverrouillage
        </label>
        <input
          id="unlock-code"
          type="password"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={error ? 'unlock-error' : undefined}
          className="hud-input"
          placeholder="Code"
        />
        <button type="submit" disabled={busy || !code} className="hud-btn hud-btn--primary">
          Déverrouiller
        </button>
      </form>
      {canUsePasskey && (
        <button type="button" onClick={useFingerprint} disabled={busy} className="hud-btn hud-btn--ghost">
          Utiliser l’empreinte
        </button>
      )}
      {error && (
        <p id="unlock-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
