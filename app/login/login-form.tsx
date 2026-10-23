'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return setError('Email ou mot de passe incorrect.')
    router.replace('/')
    router.refresh()
  }

  async function signInWithGoogle() {
    setError(null)
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError('Connexion Google impossible.')
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          Se connecter
        </button>
      </form>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="rounded border border-slate-300 px-3 py-2 font-medium dark:border-slate-700"
      >
        Continuer avec Google
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
