import { test, expect } from '@playwright/test'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'

test.beforeAll(async () => {
  await resetDatabase()
})

// L'ordre compte : la déconnexion révoque les sessions de l'utilisateur côté serveur,
// elle passe donc en dernier.

test('un visiteur anonyme est renvoyé vers /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible()
})

test('un utilisateur autorisé accède au tableau de bord', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.allowed })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/(login|unlock)/)
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Réglages' })).toBeVisible()
  await context.close()
})

test('un utilisateur non autorisé est refusé', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.denied })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?error=denied$/)
  await expect(page.getByText('Accès refusé.')).toBeVisible()
  await context.close()
})

test('la déconnexion renvoie vers /login', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.allowed })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await context.close()
})
