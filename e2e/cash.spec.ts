import { test, expect, type Page } from '@playwright/test'
import { monthLabel } from '../lib/cash'
import { dayKey } from '../lib/time'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'
import { seedCashSheet, seedGoogleConnection } from './support/seed'

const SHEET_ID = 'e2e-cash-sheet-0000000001'

test.beforeAll(async () => {
  await resetDatabase()
  await seedGoogleConnection()
  await seedCashSheet(SHEET_ID)
})

test.use({ storageState: STORAGE_STATE.allowed })

const isCashApi = (method: string, suffix = '') => (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === `/api/cash${suffix}` && r.request().method() === method

/** Section de la liste des dépenses du mois (son titre est « N dépense(s) »). */
const list = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: /^\d+ dépenses?$/ }) })

test('ajouter, modifier puis supprimer une dépense', async ({ page }) => {
  const total = page.locator('p', { hasText: /^Total/ })

  await test.step('le mois et le formulaire d’ajout s’affichent', async () => {
    await page.goto('/cash')
    await expect(page.getByRole('heading', { name: monthLabel(dayKey(new Date()).slice(0, 7)) })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ajouter une dépense' })).toBeVisible()
    await expect(page.getByText('Aucune dépense ce mois-ci.')).toBeVisible()
  })

  await test.step('ajouter une dépense', async () => {
    // Avant l'hydratation le formulaire part en GET et se vide : on remplit et on envoie à nouveau.
    await expect(async () => {
      await page.getByLabel('Montant en CHF').fill('12.5')
      await page.getByLabel('Remarque').fill('Déjeuner')
      const [response] = await Promise.all([
        page.waitForResponse(isCashApi('POST'), { timeout: 3000 }),
        page.getByRole('button', { name: 'Ajouter', exact: true }).click(),
      ])
      expect(response.ok()).toBe(true)
    }).toPass()
    await expect(list(page).getByText('Déjeuner')).toBeVisible()
    await expect(page.getByRole('heading', { name: '1 dépense' })).toBeVisible()
    await expect(list(page)).toContainText(/12,5\s+CHF/)
    await expect(total).toContainText(/12,5\s+CHF/)
  })

  await test.step('modifier le montant', async () => {
    await list(page).getByRole('button', { name: /^Modifier/ }).click()
    await list(page).getByLabel('Montant en CHF').fill('20')
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/api/cash/') && r.request().method() === 'PATCH'),
      list(page).getByRole('button', { name: 'Enregistrer' }).click(),
    ])
    expect(response.ok()).toBe(true)
    await expect(list(page)).toContainText(/20\s+CHF/)
    await expect(list(page)).not.toContainText(/12,5\s+CHF/)
    await expect(total).toContainText(/20\s+CHF/)
  })

  await test.step('supprimer la dépense', async () => {
    page.once('dialog', (dialog) => dialog.accept())
    await list(page).getByRole('button', { name: /^Supprimer/ }).click()
    await expect(page.getByText('Aucune dépense ce mois-ci.')).toBeVisible()
    await expect(page.getByRole('heading', { name: '0 dépense' })).toBeVisible()
    await expect(total).toContainText(/0\s+CHF/)
  })
})

test('oublier le fichier puis le choisir à nouveau avec le Picker', async ({ page }) => {
  // Doublures des bibliothèques Google : le Picker « choisit » aussitôt le fichier des tests.
  await page.route('https://apis.google.com/js/api.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.gapi = { load: function (name, callback) { callback() } }',
    }),
  )
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        function Chainable() {}
        ['setMode', 'setQuery', 'addView', 'setOAuthToken', 'setDeveloperKey', 'setAppId', 'setLocale', 'setTitle'].forEach(function (name) {
          Chainable.prototype[name] = function () { return this }
        })
        function PickerBuilder() {}
        PickerBuilder.prototype = Object.create(Chainable.prototype)
        PickerBuilder.prototype.setCallback = function (callback) { this.callback = callback; return this }
        PickerBuilder.prototype.build = function () {
          var callback = this.callback
          return { setVisible: function () { callback({ action: 'picked', docs: [{ id: ${JSON.stringify(SHEET_ID)} }] }) } }
        }
        function DocsView() {}
        DocsView.prototype = Object.create(Chainable.prototype)
        window.google = {
          accounts: {
            oauth2: {
              initTokenClient: function (config) {
                return { requestAccessToken: function () { config.callback({ access_token: 'e2e-picker-token' }) } }
              },
            },
          },
          picker: {
            ViewId: { SPREADSHEETS: 'SPREADSHEETS' },
            DocsViewMode: { LIST: 'LIST' },
            Action: { PICKED: 'picked', CANCEL: 'cancel' },
            DocsView: DocsView,
            PickerBuilder: PickerBuilder,
          },
        }
      `,
    }),
  )

  await test.step('oublier le fichier dans les réglages', async () => {
    await page.goto('/settings')
    const unlink = page.getByRole('button', { name: 'Oublier ce fichier' })
    await expect(async () => {
      const [response] = await Promise.all([page.waitForResponse(isCashApi('DELETE', '/sheet'), { timeout: 3000 }), unlink.click()])
      expect(response.ok()).toBe(true)
    }).toPass()
    await expect(page.getByText('Aucun fichier choisi.')).toBeVisible()
  })

  await test.step('l’état de configuration revient sur /cash', async () => {
    await page.goto('/cash')
    await expect(page.getByText('Choisis le Google Sheet des dépenses')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ajouter une dépense' })).toHaveCount(0)
  })

  await test.step('choisir le fichier avec le Picker', async () => {
    const pick = page.getByRole('button', { name: 'Choisir le fichier' })
    // Désactivé tant que les bibliothèques Google ne sont pas chargées.
    await expect(pick).toBeEnabled()
    const [response] = await Promise.all([page.waitForResponse(isCashApi('PUT', '/sheet')), pick.click()])
    expect(response.ok()).toBe(true)
    await expect(page.getByRole('heading', { name: 'Ajouter une dépense' })).toBeVisible()
  })
})
