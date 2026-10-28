import { test, expect, type Page } from '@playwright/test'
import { resetDatabase, seedCairnChecklist } from './support/db'
import { STORAGE_STATE } from './support/env'
import { testUserId } from './support/users'

test.beforeAll(async () => {
  await resetDatabase()
})

test.use({ storageState: STORAGE_STATE.allowed })

const section = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

test('la checklist des courses est enregistrée et relue', async ({ page }) => {
  const noteId = await seedCairnChecklist(await testUserId('allowed'), 'Courses e2e')

  await page.goto('/settings')
  const courses = section(page, 'Liste de courses')
  await courses.getByLabel('Checklist des courses').selectOption({ label: 'Courses e2e' })
  await courses.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(courses.getByRole('status').filter({ hasText: 'Enregistré.' })).toBeVisible()

  // Relue depuis la base après un nouveau chargement.
  await page.goto('/settings')
  await expect(section(page, 'Liste de courses').getByLabel('Checklist des courses')).toHaveValue(noteId)
})

test('une habitude ajoutée est relue puis retirée', async ({ page }) => {
  await page.goto('/settings')
  const habits = section(page, 'Habitudes')
  await habits.getByLabel('Nouvelle habitude').fill('Lire 20 min')
  await habits.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(habits.getByRole('status').filter({ hasText: 'Habitude ajoutée.' })).toBeVisible()

  await page.goto('/settings')
  await expect(section(page, 'Habitudes').getByRole('listitem').filter({ hasText: 'Lire 20 min' })).toBeVisible()

  await section(page, 'Habitudes').getByRole('button', { name: 'Retirer « Lire 20 min »' }).click()
  await expect(section(page, 'Habitudes').getByRole('status').filter({ hasText: 'Habitude retirée' })).toBeVisible()

  await page.goto('/settings')
  await expect(section(page, 'Habitudes').getByRole('listitem').filter({ hasText: 'Lire 20 min' })).toHaveCount(0)
})
