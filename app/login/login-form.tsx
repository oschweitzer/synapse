'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const [error, setError] = useState<string | null>(null)

  async function signInWithGoogle() {
    setError(null)
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Identité seulement : les données Google (agenda, mails) ont leur propre consentement.
        scopes: 'openid email profile',
      },
    })
    if (error) setError('Connexion Google impossible.')
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={signInWithGoogle}
        className="hud-btn hud-btn--primary"
      >
        Se connecter avec Google
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
