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
    const toolbar = page.getByRole('toolbar', { name: 'Outils de la carte' })
    const rect = toolbar.getByRole('button', { name: 'Rectangle', exact: true })
    // Avant l'hydratation le clic est perdu : on ne clique que s'il n'y a pas encore de nœud.
    await expect(async () => {
      if ((await nodes.count()) === 0) {
        await rect.click()
        await page.locator('.react-flow__pane').click()
      }
      await expect(nodes).toHaveCount(1, { timeout: 1000 })
    }).toPass()
    // L'outil revient sur Sélection après le placement.
    await expect(rect).toHaveAttribute('aria-pressed', 'false')
  })

  await test.step('régler le tracé des prochains liens', async () => {
    // Sans lien sélectionné, la boîte à outils règle le style des prochains liens.
    const toolbar = page.getByRole('toolbar', { name: 'Outils de la carte' })
    const route = toolbar.getByRole('group', { name: 'Tracé' })
    const curve = route.getByRole('button', { name: 'Courbe', exact: true })
    const straight = route.getByRole('button', { name: 'Droit', exact: true })
    await expect(curve).toHaveAttribute('aria-pressed', 'true')
    await straight.click()
    await expect(straight).toHaveAttribute('aria-pressed', 'true')
    await expect(curve).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('textbox', { name: 'Texte du lien' })).toHaveCount(0)
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

  await test.step('tracer un lien : il prend le tracé par défaut, puis se règle une fois sélectionné', async () => {
    const toolbar = page.getByRole('toolbar', { name: 'Outils de la carte' })
    const edges = page.locator('.react-flow__edge')
    const route = toolbar.getByRole('group', { name: 'Tracé' })
    const straight = route.getByRole('button', { name: 'Droit', exact: true })
    const curve = route.getByRole('button', { name: 'Courbe', exact: true })
    const dash = toolbar.getByRole('group', { name: 'Trait' })
    const dotted = dash.getByRole('button', { name: 'Pointillés', exact: true })
    const label = page.getByRole('textbox', { name: 'Texte du lien' })

    // Un second nœud, loin du premier (placé au centre du canevas).
    await toolbar.getByRole('button', { name: 'Rectangle', exact: true }).click()
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 80 } })
    await expect(nodes).toHaveCount(2)

    // On glisse de la poignée droite du premier nœud vers la poignée gauche du second.
    const from = await nodes.nth(0).locator('.react-flow__handle[data-handleid="right"]').boundingBox()
    const to = await nodes.nth(1).locator('.react-flow__handle[data-handleid="left"]').boundingBox()
    if (!from || !to) throw new Error('poignées introuvables')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await expect(edges).toHaveCount(1)

    // Sélectionner le lien : la boîte à outils relit son style (Droit, choisi plus haut) et propose son texte.
    await edges.first().locator('.react-flow__edge-interaction').dispatchEvent('click')
    await expect(label).toBeVisible()
    await expect(straight).toHaveAttribute('aria-pressed', 'true')
    await expect(curve).toHaveAttribute('aria-pressed', 'false')

    await label.fill('lien e2e')
    await expect(page.locator('.react-flow__edge-text')).toHaveText('lien e2e')
    await dotted.click()
    await expect(dotted).toHaveAttribute('aria-pressed', 'true')

    // Désélectionner : les réglages reviennent aux valeurs par défaut des prochains liens.
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 500 } })
    await expect(label).toHaveCount(0)
    await expect(dotted).toHaveAttribute('aria-pressed', 'false')

    // Resélectionner : le style a bien été écrit sur le lien.
    await edges.first().locator('.react-flow__edge-interaction').dispatchEvent('click')
    await expect(dotted).toHaveAttribute('aria-pressed', 'true')
    await expect(label).toHaveValue('lien e2e')
  })

  await test.step('attendre l’enregistrement automatique', async () => {
    // Obligatoire avant le rechargement : tant que l'état n'est pas « Enregistré », beforeunload bloque la sortie.
    // Le texte transitoire « Enregistrement… » dépend du délai du debounce : on n'asserte que l'état final.
    await expect(status).toHaveText('Enregistré')
  })

  await test.step('recharger : la carte est relue', async () => {
    await page.reload()
    await expect(nodes).toHaveCount(2)
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
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
