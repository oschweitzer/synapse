import { test, expect } from '@playwright/test'
import postgres from 'postgres'
import { assertLocalTarget } from './guard'
import { resetDatabase } from './support/db'
import { databaseUrl, STORAGE_STATE } from './support/env'

test.beforeAll(async () => {
  await resetDatabase()
})

test.use({ storageState: STORAGE_STATE.allowed })

const TITLE = 'Carte e2e'
const TEXT = 'Idée e2e'

// Supprimer la carte est la dernière étape du test : si un test échoue avant, la carte reste et fausserait
// les assertions d'une relance. On la retire donc après chaque test, sans toucher aux sessions enregistrées
// (resetDatabase recrée les utilisateurs, ce qui invaliderait la session déjà chargée par le test).
test.afterEach(async () => {
  assertLocalTarget(process.env)
  const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} })
  try {
    await sql`delete from synapse.mindmaps where title = ${TITLE}`
  } finally {
    await sql.end()
  }
})

test('créer, éditer, annuler/rétablir, recharger puis supprimer une carte', async ({ page }) => {
  const nodes = page.locator('.react-flow__node')
  const status = page.locator('header').getByRole('status')

  await test.step('créer la carte', async () => {
    await page.goto('/mindmaps')
    await page.getByLabel('Titre de la carte').fill(TITLE)
    await page.getByRole('button', { name: 'Créer' }).click()
    await expect(page).toHaveURL(/\/mindmaps\/[0-9a-f-]{36}$/)
    await expect(page.getByLabel('Titre de la carte')).toHaveValue(TITLE)
  })

  await test.step('ajouter un nœud rectangle', async () => {
    const rect = page.getByRole('group', { name: 'Ajouter' }).getByRole('button', { name: 'Rectangle', exact: true })
    // Avant l'hydratation le clic est perdu : on ne clique que s'il n'y a pas encore de nœud.
    await expect(async () => {
      if ((await nodes.count()) === 0) await rect.click()
      await expect(nodes).toHaveCount(1, { timeout: 1000 })
    }).toPass()
  })

  await test.step('éditer le texte du nœud', async () => {
    await nodes.first().dblclick()
    const box = page.getByRole('textbox', { name: 'Texte du nœud' })
    await box.fill(TEXT)
    await box.press('Escape')
    await expect(nodes.first()).toHaveText(TEXT)
  })

  await test.step('annuler puis rétablir', async () => {
    await page.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(nodes.first()).not.toContainText(TEXT)
    await expect(nodes).toHaveCount(1)
    // La réponse de l'action serveur qui enregistre la carte, écoutée avant le clic qui relance la sauvegarde.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined),
      page.getByRole('button', { name: 'Rétablir', exact: true }).click(),
    ])
    await expect(nodes.first()).toHaveText(TEXT)
  })

  await test.step('attendre l’enregistrement automatique', async () => {
    // Obligatoire avant le rechargement : tant que l'état n'est pas « Enregistré », beforeunload bloque la sortie.
    // Le texte transitoire « Enregistrement… » dépend du délai du debounce : on n'asserte que l'état final.
    await expect(status).toHaveText('Enregistré')
  })

  await test.step('recharger : la carte est relue', async () => {
    await page.reload()
    await expect(nodes).toHaveCount(1)
    await expect(nodes.first()).toHaveText(TEXT)
    await expect(page.getByLabel('Titre de la carte')).toHaveValue(TITLE)
  })

  await test.step('supprimer la carte', async () => {
    await page.goto('/mindmaps')
    const item = page.getByRole('listitem').filter({ hasText: TITLE })
    await expect(item).toHaveCount(1)
    // DeleteMindmap demande une confirmation (window.confirm) : l'accepter avant de cliquer.
    page.once('dialog', (d) => void d.accept())
    await item.getByRole('button', { name: 'Supprimer' }).click()
    await expect(page).toHaveURL(/\/mindmaps$/)
    await expect(item).toHaveCount(0)
    await expect(page.getByText('Aucune carte pour l’instant.')).toBeVisible()
  })
})
