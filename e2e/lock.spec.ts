import { test, expect, type Page } from '@playwright/test'
import { resetDatabase, setLockIdleMinutes } from './support/db'
import { STORAGE_STATE } from './support/env'
import { testUserId } from './support/users'

// Les tests s'enchaînent : le code est posé par le premier, les suivants le réutilisent.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await resetDatabase()
})

/** Au moins 6 caractères (CODE_MIN de lib/lock/code.ts). */
const CODE = '246810'

/** La carte d'une section des réglages, repérée par son titre. */
const section = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

/** Saisit le code et valide. Avant l'hydratation le bouton reste désactivé : on ressaisit jusqu'à ce qu'il s'active. */
async function submitCode(page: Page, code: string) {
  const submit = page.getByRole('button', { name: 'Déverrouiller' })
  await expect(async () => {
    await page.getByLabel('Code de déverrouillage').fill(code)
    await expect(submit).toBeEnabled({ timeout: 1000 })
  }).toPass()
  await submit.click()
}

async function unlock(page: Page, code: string) {
  await submitCode(page, code)
  await expect(page).not.toHaveURL(/\/unlock/)
}

test('code : activer, verrouiller, refuser un mauvais code, déverrouiller', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.allowed })
  const page = await context.newPage()

  await page.goto('/settings')
  await page.getByLabel('Code', { exact: true }).fill(CODE)
  await page.getByLabel('Confirmer le code').fill(CODE)
  await page.getByRole('button', { name: 'Activer le verrouillage' }).click()
  const lock = section(page, 'Verrouillage')
  await expect(lock.getByRole('status').filter({ hasText: 'Verrouillage activé' })).toBeVisible()
  // Mise à jour sur place : pas de navigation, et la section est passée au changement de code sans rechargement.
  await expect(page).toHaveURL(/\/settings$/)
  await expect(lock.getByRole('button', { name: 'Changer le code' })).toBeVisible()
  await expect(lock.getByRole('button', { name: 'Verrouiller maintenant' })).toBeVisible()

  await page.getByRole('button', { name: 'Verrouiller maintenant' }).click()
  await expect(page).toHaveURL(/\/unlock/)

  // Un mauvais code est refusé et on reste sur l'écran de verrouillage.
  await submitCode(page, '000000')
  await expect(page.locator('#unlock-error')).toBeVisible()
  await expect(page).toHaveURL(/\/unlock/)

  await unlock(page, CODE)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Verrouiller', exact: true })).toBeVisible()
  await context.close()
})

test('verrouillage automatique après inactivité (horloge Playwright)', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE.allowed })
  const page = await context.newPage()
  try {
    // Avant la première navigation : AutoLock lit Date.now() et ses minuteries sur l'horloge simulée.
    await page.clock.install()

    await page.goto('/')
    await expect(page).toHaveURL(/\/unlock/)
    await unlock(page, CODE)

    await page.goto('/settings')
    await page.locator('#idle_minutes').selectOption('1')
    await page.getByRole('button', { name: 'Enregistrer le délai' }).click()
    await expect(section(page, 'Verrouillage').getByRole('status').filter({ hasText: 'Délai enregistré.' })).toBeVisible()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('#idle_minutes')).toHaveValue('1')
    await page.reload()
    await expect(page.locator('#idle_minutes')).toHaveValue('1')

    // AutoLock contrôle l'inactivité toutes les 10 s : 1 min 05 s suffisent à dépasser le délai.
    // Avant l'hydratation, AutoLock n'est pas encore monté : on avance l'horloge jusqu'au verrouillage.
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Verrouiller', exact: true })).toBeVisible()
    await expect(async () => {
      await page.clock.fastForward('01:05')
      await expect(page).toHaveURL(/\/unlock/, { timeout: 2000 })
    }).toPass()
  } finally {
    // Le délai d'une minute resterait sur le compte autorisé : le test de l'empreinte, qui suit, pourrait être verrouillé.
    await setLockIdleMinutes(await testUserId('allowed'), 5)
  }
  await context.close()
})

test('empreinte : enregistrement et déverrouillage avec un authentificateur WebAuthn virtuel', async ({ browser }) => {
  // Doit tourner sur http://localhost:3000 (baseURL), jamais 127.0.0.1 : relyingParty() en tire rpID et origine.
  const context = await browser.newContext({ storageState: STORAGE_STATE.allowed })
  const page = await context.newPage()

  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  // Interne et avec vérification d'utilisateur : isUserVerifyingPlatformAuthenticatorAvailable() vaut true,
  // donc l'application affiche ses boutons d'empreinte.
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  await page.goto('/')
  await expect(page).toHaveURL(/\/unlock/)
  await unlock(page, CODE)

  await page.goto('/settings')
  await page.getByLabel('Nom de l’appareil').fill('Chromium e2e')
  await page.getByRole('button', { name: 'Ajouter l’empreinte de cet appareil' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Empreinte enregistrée.' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Chromium e2e' })).toBeVisible()
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
  expect(credentials).toHaveLength(1)

  await page.getByRole('button', { name: 'Verrouiller maintenant' }).click()
  await expect(page).toHaveURL(/\/unlock/)
  await page.getByRole('button', { name: 'Utiliser l’empreinte' }).click()
  await expect(page).not.toHaveURL(/\/unlock/)
  await expect(page.getByRole('button', { name: 'Verrouiller', exact: true })).toBeVisible()
  await context.close()
})
