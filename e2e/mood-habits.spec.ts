import { test, expect, type Page } from '@playwright/test'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'

test.beforeAll(async () => {
  await resetDatabase()
})

test.use({ storageState: STORAGE_STATE.allowed })

const section = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

const HABIT = 'Boire 2 L d’eau'

test('l’humeur et l’habitude du jour survivent au rechargement', async ({ page }) => {
  const mood = page.getByRole('radiogroup', { name: 'Humeur du jour' })
  const bien = mood.getByRole('radio', { name: 'Bien', exact: true })
  const check = page.getByRole('checkbox', { name: HABIT })

  await test.step('créer l’habitude dans les réglages', async () => {
    await page.goto('/settings')
    const habits = section(page, 'Habitudes')
    await habits.getByLabel('Nouvelle habitude').fill(HABIT)
    await habits.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(habits.getByRole('status').filter({ hasText: 'Habitude ajoutée.' })).toBeVisible()
  })

  await test.step('choisir l’humeur et cocher l’habitude', async () => {
    await page.goto('/')

    // Avant l'hydratation le clic est perdu : on réessaie, mais seulement tant que « Bien » n'est pas coché,
    // pour qu'un essai tardif ne lance pas une seconde action serveur pendant que la première est en cours.
    await expect(async () => {
      if ((await bien.getAttribute('aria-checked')) !== 'true') await bien.click()
      await expect(bien).toHaveAttribute('aria-checked', 'true', { timeout: 1000 })
    }).toPass()
    // Le bouton est désactivé tant que l'action serveur est en cours.
    await expect(bien).toBeEnabled()
    const widget = page
      .locator('.hud-dash__item')
      .filter({ has: page.getByRole('button', { name: 'Déplacer « Humeur »' }) })
    await expect(widget.getByRole('alert')).toHaveCount(0)

    // On ne clique que si la case est décochée, pour qu'un clic tardif ne la décoche pas.
    await expect(async () => {
      if (!(await check.isChecked())) await check.click()
      await expect(check).toBeChecked({ timeout: 1000 })
    }).toPass()
    await expect(check).toBeEnabled()
  })

  await test.step('recharger : les deux sont relus depuis la base', async () => {
    await page.reload()
    await expect(bien).toHaveAttribute('aria-checked', 'true')
    for (const label of ['Très mal', 'Pas terrible', 'Neutre', 'Très bien']) {
      await expect(mood.getByRole('radio', { name: label, exact: true })).toHaveAttribute('aria-checked', 'false')
    }
    await expect(check).toBeChecked()
  })
})
