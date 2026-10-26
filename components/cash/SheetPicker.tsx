'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { cashApi } from './api'

const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'
/** Nom du fichier proposé en recherche à l'ouverture du Picker. */
const DEFAULT_QUERY = 'Dépenses Liquide'

type TokenResponse = { access_token?: string; error?: string }
type PickerResponse = { action: string; docs?: { id: string }[] }

/** Le strict nécessaire des bibliothèques Google chargées dans la page (gapi, Picker, Identity Services). */
type GoogleWindow = Window & {
  gapi?: { load(name: string, callback: () => void): void }
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string
          scope: string
          login_hint?: string
          prompt?: string
          callback: (response: TokenResponse) => void
          error_callback?: (error: { type: string }) => void
        }): { requestAccessToken(): void }
      }
    }
    picker: {
      ViewId: { SPREADSHEETS: string }
      DocsViewMode: { LIST: string }
      Action: { PICKED: string; CANCEL: string }
      DocsView: new (viewId: string) => PickerView
      PickerBuilder: new () => PickerBuilder
    }
  }
}
type PickerView = { setMode(mode: string): PickerView; setQuery(query: string): PickerView }
type PickerBuilder = {
  addView(view: PickerView): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(appId: string): PickerBuilder
  setLocale(locale: string): PickerBuilder
  setTitle(title: string): PickerBuilder
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder
  build(): { setVisible(visible: boolean): void }
}

const scripts = new Map<string, Promise<void>>()

function loadScript(src: string) {
  let promise = scripts.get(src)
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scripts.delete(src)
        reject(new Error(src))
      }
      document.head.append(script)
    })
    scripts.set(src, promise)
  }
  return promise
}

/**
 * Choix du Google Sheet des dépenses avec le Google Picker. Le jeton du Picker
 * est demandé ici, dans le navigateur, par Google Identity Services et limité
 * à `drive.file` : le refresh token du serveur (agenda, Gmail) n'en sort pas.
 * Le fichier choisi est accordé à l'application, et donc aussi au serveur.
 */
export function SheetPicker({
  clientId,
  apiKey,
  appId,
  loginHint,
  label = 'Choisir le fichier',
}: {
  clientId: string
  apiKey: string
  appId: string
  loginHint?: string | null
  label?: string
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenClient = useRef<{ requestAccessToken(): void } | null>(null)

  useEffect(() => {
    let cancelled = false
    const w = window as GoogleWindow

    function openPicker(token: string) {
      const picker = w.google!.picker
      const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST).setQuery(DEFAULT_QUERY)
      new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setLocale('fr')
        .setTitle('Fichier des dépenses cash')
        .setCallback(async (response) => {
          if (response.action === picker.Action.CANCEL) return setBusy(false)
          if (response.action !== picker.Action.PICKED || !response.docs?.[0]) return
          const result = await cashApi('/sheet', 'PUT', { id: response.docs[0].id })
          setBusy(false)
          if (!result.ok) return setError(result.error)
          router.refresh()
        })
        .build()
        .setVisible(true)
    }

    // Chargées dès l'affichage : la fenêtre de consentement doit s'ouvrir dans le clic, sans attente.
    Promise.all([loadScript('https://apis.google.com/js/api.js'), loadScript('https://accounts.google.com/gsi/client')])
      .then(() => new Promise<void>((resolve) => w.gapi!.load('picker', resolve)))
      .then(() => {
        if (cancelled) return
        tokenClient.current = w.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE_DRIVE_FILE,
          login_hint: loginHint ?? undefined,
          prompt: '',
          callback: (response) => {
            if (!response.access_token) {
              setBusy(false)
              return setError('Google n’a pas accordé l’accès aux fichiers.')
            }
            openPicker(response.access_token)
          },
          error_callback: () => setBusy(false),
        })
        setReady(true)
      })
      .catch(() => !cancelled && setError('Google Picker indisponible (bloqueur de contenu ?).'))

    return () => {
      cancelled = true
    }
  }, [clientId, apiKey, appId, loginHint, router])

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="primary"
        loading={busy}
        disabled={!ready}
        onClick={() => {
          setError(null)
          setBusy(true)
          tokenClient.current?.requestAccessToken()
        }}
      >
        {busy ? 'Choix en cours…' : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
