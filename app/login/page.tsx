import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Synapse</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">Connecte-toi avec ton compte Google.</p>
      {error && (
        <p className="border border-danger bg-danger-wash px-3 py-2 text-sm text-danger">
          {error === 'denied' ? 'Accès refusé.' : 'La connexion a échoué. Réessaie.'}
        </p>
      )}
      <LoginForm />
    </main>
  )
}
