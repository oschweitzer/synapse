import { test, expect, type Page } from '@playwright/test'
import { WIDGETS } from '../lib/dashboard'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'

test.beforeAll(async () => {
  await resetDatabase()
})

test.use({ storageState: STORAGE_STATE.allowed })

const handles = (page: Page) => page.getByRole('button', { name: /^Déplacer « / })

/** Les poignées de déplacement, dans l'ordre d'affichage : une par widget, au nom unique. */
const handleNames = (page: Page) => handles(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

test('le dashboard affiche ses widgets', async ({ page }) => {
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/(login|unlock)/)

  // Le dashboard par défaut (créé par ensure_default_dashboard) porte tout le catalogue, dans son ordre.
  await expect.poll(() => handleNames(page)).toEqual(WIDGETS.map((w) => `Déplacer « ${w.label} »`))

  const weather = page.locator('.hud-dash__item').filter({ has: page.getByRole('button', { name: 'Déplacer « Météo »' }) })
  await expect(weather).toBeVisible()
})

test('le nouvel ordre survit au rechargement', async ({ page }) => {
  await page.goto('/')
  await expect(handles(page)).toHaveCount(WIDGETS.length)
  const initial = await handleNames(page)

  const handle = page.getByRole('button', { name: 'Déplacer « Activités »' })
  // Tant que la page n'est pas hydratée, la touche Espace ne saisit rien : on recommence jusqu'à la saisie.
  await expect(async () => {
    await handle.focus()
    await page.keyboard.press('Space')
    await expect(handle).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass()

  // On ne dépose qu'une fois le déplacement pris en compte (annonce de dnd-kit) : tant que la mise en page bouge,
  // la cible reste le widget lui-même, donc on rappuie sur la flèche jusqu'à voir une autre cible.
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText(/« Activités » déplacé à la place de « (?!Activités)/)).toBeAttached({ timeout: 1000 })
  }).toPass()
  // La réponse de l'action serveur qui enregistre l'ordre, écoutée juste avant le dépôt.
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined,
  )
  await page.keyboard.press('Space')
  await saved

  await expect.poll(() => handleNames(page)).not.toEqual(initial)
  const reordered = await handleNames(page)

  await page.reload()
  await expect.poll(() => handleNames(page)).toEqual(reordered)
})

test('un widget se soulève au survol, sans mouvement en mouvement réduit', async ({ page }) => {
  await page.goto('/')
  // On fixe explicitement le mouvement : le test ne dépend pas du réglage par défaut de l'environnement.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(handles(page)).toHaveCount(WIDGETS.length)

  const weather = page.locator('.hud-dash__item').filter({ has: page.getByRole('button', { name: 'Déplacer « Météo »' }) })
  const panel = weather.locator(':scope > .hud-panel')
  const transform = () => panel.evaluate((el) => getComputedStyle(el).transform)

  // Au survol, le panneau est soulevé : le transform calculé n'est plus « none ».
  await panel.locator('.hud-panel__head').hover()
  await expect.poll(transform).not.toBe('none')

  // En mouvement réduit, le même survol ne produit aucun transform.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(0, 0)
  await panel.locator('.hud-panel__head').hover()
  await expect.poll(transform).toBe('none')
})
