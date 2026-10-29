import { test, expect, type Page } from '@playwright/test'
import { resetDatabase, seedCairnChecklist } from './support/db'
import { STORAGE_STATE } from './support/env'
import { seedCashSheet, seedGoogleConnection } from './support/seed'
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
  // Enregistrement sur place : ni ?saved= ni rechargement de la page.
  await expect(page).toHaveURL(/\/settings$/)

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
  await expect(page).toHaveURL(/\/settings$/)

  await page.goto('/settings')
  await expect(section(page, 'Habitudes').getByRole('listitem').filter({ hasText: 'Lire 20 min' })).toBeVisible()

  await section(page, 'Habitudes').getByRole('button', { name: 'Retirer « Lire 20 min »' }).click()
  await expect(section(page, 'Habitudes').getByRole('status').filter({ hasText: 'Habitude retirée' })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)

  await page.goto('/settings')
  await expect(section(page, 'Habitudes').getByRole('listitem').filter({ hasText: 'Lire 20 min' })).toHaveCount(0)
})

test('ajouter une habitude garde la saisie des autres sections et n’y affiche aucun message', async ({ page }) => {
  await page.goto('/settings')
  const meteo = section(page, 'Météo')
  await meteo.getByLabel('Rechercher une ville').fill('Strasbourg')
  // Ferme la liste de suggestions sans rien choisir.
  await page.keyboard.press('Escape')

  const habits = section(page, 'Habitudes')
  await habits.getByLabel('Nouvelle habitude').fill('Marcher 30 min')
  await habits.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(habits.getByRole('status').filter({ hasText: 'Habitude ajoutée.' })).toBeVisible()

  await expect(page).toHaveURL(/\/settings$/)
  // La page n'a pas été rechargée : la saisie de la météo est intacte et seule la section éditée a un message.
  await expect(meteo.getByLabel('Rechercher une ville')).toHaveValue('Strasbourg')
  await expect(meteo.getByRole('status')).toHaveCount(0)
  await expect(section(page, 'Liste de courses').getByRole('status')).toHaveCount(0)
})

test('déconnecter Google met à jour les sections Google et Dépenses cash sur place', async ({ page }) => {
  await seedGoogleConnection()
  await seedCashSheet('e2e-cash-sheet-0000000002')

  await page.goto('/settings')
  const google = section(page, 'Google (agenda et mails)')
  const cash = section(page, 'Dépenses cash')
  await expect(google).toContainText('Connecté en tant que')
  await expect(google.getByRole('button', { name: 'Déconnecter' })).toBeVisible()
  // Compte connecté : la section cash ne demande pas de connecter Google.
  await expect(cash).not.toContainText('Connecte Google dans la section')

  await google.getByRole('button', { name: 'Déconnecter' }).click()
  await expect(google.getByRole('status').filter({ hasText: 'Google déconnecté' })).toBeVisible()
  await expect(google.getByText('Non connecté.')).toBeVisible()
  await expect(google.getByRole('button', { name: 'Déconnecter' })).toHaveCount(0)
  // Déconnexion sur place : l'URL ne change pas, et la section cash suit sans rechargement.
  await expect(page).toHaveURL(/\/settings$/)
  await expect(cash).toContainText('Connecte Google dans la section « Google (agenda et mails) » pour choisir le fichier.')
})
