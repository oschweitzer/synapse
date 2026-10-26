'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startRegistration } from '@simplewebauthn/browser'

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>
  return { ok: res.ok, json }
}

/** Enregistre l'empreinte (ou le déverrouillage biométrique) de l'appareil courant. */
export function PasskeyEnroll() {
  const router = useRouter()
  const [supported, setSupported] = useState<boolean | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    if (!window.PublicKeyCredential) return setSupported(false)
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  async function enroll(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const options = await post('/api/lock/passkey/register-options')
      if (!options.ok) throw new Error(options.json.error)
      const response = await startRegistration({ optionsJSON: options.json as never })
      const verified = await post('/api/lock/passkey/register-verify', { response, label })
      if (!verified.ok) throw new Error(verified.json.error)
      setLabel('')
      setMessage({ text: 'Empreinte enregistrée.', error: false })
      router.refresh()
    } catch (e) {
      const cancelled = e instanceof Error && e.name === 'NotAllowedError'
      setMessage({
        text: cancelled ? 'Enregistrement annulé.' : (e instanceof Error && e.message) || 'Enregistrement impossible, réessaie.',
        error: true,
      })
    }
    setBusy(false)
  }

  if (supported === null) return null
  if (!supported) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cet appareil ne propose pas de déverrouillage par empreinte (ou HTTPS est requis).
      </p>
    )
  }

  return (
    <form onSubmit={enroll} className="flex flex-col gap-3 sm:flex-row">
      <label htmlFor="passkey-label" className="sr-only">
        Nom de l’appareil
      </label>
      <input
        id="passkey-label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={60}
        placeholder="Nom de l’appareil (ex. Téléphone)"
        className="hud-input flex-1"
      />
      <button type="submit" disabled={busy} className="hud-btn hud-btn--primary">
        Ajouter l’empreinte de cet appareil
      </button>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
          {message.text}
        </p>
      )}
    </form>
  )
}
