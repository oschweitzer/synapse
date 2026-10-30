import { test, expect, type Page } from '@playwright/test'
import { resetDatabase, seedDashboard } from './support/db'
import { STORAGE_STATE } from './support/env'
import { testUserId } from './support/users'

// Les tests s'enchaînent : le dashboard « Salon » créé par le premier sert au suivant.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await resetDatabase()
})

const handleNames = (page: Page) =>
  page.getByRole('button', { name: /^Déplacer « / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

test('un admin ajoute des widgets à un dashboard public avec le sélecteur', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.allowed })
  const page = await context.newPage()

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Dashboards (admin)' })).toBeVisible()

  const admin = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Dashboards (admin)' }) })
  const create = page.locator('form').filter({ has: page.getByLabel('Nouveau dashboard') })
  await create.getByRole('textbox', { name: 'Nouveau dashboard' }).fill('Salon')
  await create.getByLabel('Visibilité').selectOption({ label: 'Public (connexion seule)' })
  await create.getByRole('button', { name: 'Créer' }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Dashboard créé. Choisis ses widgets ci-dessous.' })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)

  const salon = () => page.locator('form').filter({ has: page.locator('input[name="name"][value="Salon"]') })

  // Sur un dashboard public, le sélecteur désactive les widgets sensibles.
  await salon().getByRole('button', { name: /^Ajouter un widget/ }).click()
  const dialog = salon().getByRole('dialog')
  await expect(dialog.getByRole('checkbox', { name: /^Mails/ })).toBeDisabled()
  await expect(dialog.getByText('Un dashboard public ne peut pas afficher de widget sensible.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toBeHidden()

  // Le serveur refuse quand même un widget sensible : privé, on ajoute Mails, puis on repasse en public.
  await salon().getByLabel('Visibilité').selectOption({ label: 'Privé (verrouillage)' })
  await salon().getByRole('button', { name: /^Ajouter un widget/ }).click()
  await salon().getByRole('dialog').getByRole('checkbox', { name: /^Mails/ }).check()
  await salon().getByRole('dialog').getByRole('button', { name: 'Ajouter (1)' }).click()
  await salon().getByLabel('Visibilité').selectOption({ label: 'Public (connexion seule)' })
  await expect(salon().getByText('Retire les widgets sensibles avant d’enregistrer')).toBeVisible()
  await salon().getByRole('button', { name: 'Enregistrer' }).click()
  await expect(admin.getByRole('alert').filter({ hasText: 'ne peut pas afficher de widget sensible' })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)
  await salon().getByRole('button', { name: /^Retirer « Mails »/ }).click()
  await expect(salon().locator('input[name="widgets"][value="mail"]')).toHaveCount(0)

  // On ajoute deux widgets non sensibles d'un coup.
  await salon().getByRole('button', { name: /^Ajouter un widget/ }).click()
  await salon().getByRole('dialog').getByRole('checkbox', { name: /^Météo/ }).check()
  await salon().getByRole('dialog').getByRole('checkbox', { name: /^À faire/ }).check()
  await salon().getByRole('dialog').getByRole('button', { name: 'Ajouter (2)' }).click()
  expect(await salon().locator('input[name="widgets"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['todo', 'weather'])
  await salon().getByRole('button', { name: 'Enregistrer' }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Dashboard enregistré.' })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)

  await page.goto('/')
  await page.getByRole('navigation', { name: 'Dashboards' }).getByRole('link', { name: 'Salon' }).click()
  await expect(page).toHaveURL(/\?d=/)
  // Ajoutés ensemble : ordre du catalogue, « À faire » avant « Météo ».
  await expect.poll(() => handleNames(page)).toEqual(['Déplacer « À faire »', 'Déplacer « Météo »'])
  await context.close()
})

test('un utilisateur autorisé non admin n’a pas la zone admin', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.member })
  const page = await context.newPage()
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dashboards (admin)' })).toHaveCount(0)
  await context.close()
})

test('visibilité publique et privée respectée', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.member })
  const page = await context.newPage()

  // Crée le dashboard par défaut (privé) du membre, puis lui ajoute un dashboard public.
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/(login|unlock)/)
  const publicId = await seedDashboard(await testUserId('member'), {
    name: 'Salon',
    visibility: 'public',
    widgets: ['weather'],
  })
  // Dashboard privé d'un autre utilisateur : le membre ne doit ni le voir ni y accéder.
  const foreignId = await seedDashboard(await testUserId('allowed'), {
    name: 'Bureau secret',
    visibility: 'private',
    widgets: ['weather'],
  })

  await page.goto('/settings')
  await page.getByLabel('Code', { exact: true }).fill('246810')
  await page.getByLabel('Confirmer le code').fill('246810')
  await page.getByRole('button', { name: 'Activer le verrouillage' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Verrouillage activé' })).toBeVisible()
  await context.close()

  // Nouveau contexte : pas de cookie de déverrouillage.
  const locked = await browser.newContext({ storageState: STORAGE_STATE.member })
  const lockedPage = await locked.newPage()
  await lockedPage.goto('/')
  await expect(lockedPage).toHaveURL(/\/unlock/)

  await lockedPage.goto(`/?d=${publicId}`)
  await expect(lockedPage).not.toHaveURL(/\/unlock/)
  await expect(lockedPage.getByRole('button', { name: 'Déplacer « Météo »' })).toBeVisible()

  // Le dashboard privé d'un autre utilisateur n'est pas servi : l'identifiant est ignoré (RLS), on retombe
  // sur le dashboard privé du membre, qui reste verrouillé.
  await lockedPage.goto(`/?d=${foreignId}`)
  await expect(lockedPage).toHaveURL(/\/unlock/)
  expect(lockedPage.url()).not.toContain(foreignId)
  await locked.close()

  // Une fois déverrouillé, le membre voit ses propres dashboards, jamais celui de l'autre utilisateur.
  const unlocked = await browser.newContext({ storageState: STORAGE_STATE.member })
  const unlockedPage = await unlocked.newPage()
  await unlockedPage.goto(`/?d=${foreignId}`)
  const submit = unlockedPage.getByRole('button', { name: 'Déverrouiller' })
  await expect(async () => {
    await unlockedPage.getByLabel('Code de déverrouillage').fill('246810')
    await expect(submit).toBeEnabled({ timeout: 1000 })
  }).toPass()
  await submit.click()
  await expect(unlockedPage).not.toHaveURL(/\/unlock/)
  const nav = unlockedPage.getByRole('navigation', { name: 'Dashboards' })
  await expect(nav.getByRole('link', { name: 'Salon' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Bureau secret' })).toHaveCount(0)
  await expect(unlockedPage.getByText('Bureau secret')).toHaveCount(0)
  await unlocked.close()
})
