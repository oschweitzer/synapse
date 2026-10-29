import { test, expect } from '@playwright/test'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'

test.beforeAll(async () => {
  await resetDatabase()
})

test.use({ storageState: STORAGE_STATE.allowed })

test('une ville trouvée par l’autocomplétion est ajoutée sur place et affiche la prévision simulée', async ({ page }) => {
  await page.goto('/settings')
  const meteo = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Météo', exact: true }) })

  // Le serveur interroge le géocodage simulé (e2e/mock-server.ts) : Strasbourg, Grand Est, France.
  await meteo.getByLabel('Rechercher une ville').fill('Strasbourg')
  const suggestion = meteo.getByRole('option', { name: /Strasbourg/ })
  await expect(suggestion).toContainText('Grand Est, France')
  await suggestion.click()

  await meteo.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(meteo.getByRole('status').filter({ hasText: 'Ville ajoutée.' })).toBeVisible()
  // Ajout sur place : ni ?city= ni ?weather= dans l'URL.
  await expect(page).toHaveURL(/\/settings$/)
  // Paris, la ville par défaut, n'a pas de bouton « Retirer » : celui-ci prouve que la ville est enregistrée.
  await expect(meteo.getByRole('button', { name: 'Retirer « Strasbourg »' })).toBeVisible()

  // Le widget affiche la prévision simulée (18,5 °C, code 2, min 12, max 22, pluie 20 %).
  await page.goto('/')
  const widget = page.locator('.hud-dash__item').filter({ has: page.getByRole('button', { name: 'Déplacer « Météo »' }) })
  await expect(widget).toContainText('19°')
  await expect(widget).toContainText('Peu nuageux · Strasbourg')
  await expect(widget).toContainText('Min 12° · Max 22° · Pluie 20 %')
})
