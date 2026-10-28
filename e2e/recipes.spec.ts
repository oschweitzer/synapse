import { test, expect } from '@playwright/test'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'
import { seedShoppingChecklist } from './support/seed'

test.beforeAll(async () => {
  await resetDatabase()
  // Checklist « Courses » vide, choisie dans les réglages : elle reçoit les ingrédients.
  await seedShoppingChecklist([])
})

test.use({ storageState: STORAGE_STATE.allowed })

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('créer, modifier, envoyer aux courses puis supprimer une recette', async ({ page }) => {
  const ingredients = ['Pommes de terre', 'Crème']
  let recipeUrl = ''

  await test.step('créer', async () => {
    await page.goto('/recipes/new')
    await page.getByLabel('Titre').fill('Gratin e2e')
    await page.getByLabel('Ingrédients').fill(ingredients.join('\n'))
    await page.getByLabel('Étapes').fill('Éplucher\nCuire')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Gratin e2e' })).toBeVisible()
    recipeUrl = page.url()
  })

  await test.step('modifier', async () => {
    await page.getByRole('link', { name: 'Modifier' }).click()
    await expect(page).toHaveURL(/\/edit$/)
    await page.getByLabel('Titre').fill('Gratin e2e modifié')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Gratin e2e modifié' })).toBeVisible()
  })

  await test.step('envoyer les ingrédients aux courses', async () => {
    await page.getByRole('button', { name: 'Ajouter les ingrédients aux courses' }).click()
    await expect(page.getByRole('status')).toHaveText('2 ingrédients ajoutés aux courses.')

    await page.goto('/')
    const courses = page.getByRole('region', { name: 'Courses', exact: true })
    for (const ingredient of ingredients) {
      await expect(courses.getByRole('checkbox', { name: ingredient })).toBeVisible()
    }
  })

  await test.step('supprimer', async () => {
    await page.goto(recipeUrl)
    // DeleteRecipe demande confirmation avec window.confirm.
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Supprimer' }).click()

    await expect(page).toHaveURL(/\/recipes\?deleted=1$/)
    await expect(page.getByRole('status')).toHaveText('Recette supprimée.')
    await expect(page.getByText('Gratin e2e modifié')).toHaveCount(0)
  })
})

test('importer depuis TheMealDB et afficher la recette du jour', async ({ page }) => {
  await page.goto('/recipes')
  // Recherche vide : le mock répond à random.php avec toujours la même recette.
  await page.getByRole('button', { name: 'Importer' }).click()
  await expect(page.getByRole('status')).toContainText('importée')
  await expect(page.getByRole('link', { name: /Teriyaki Chicken Casserole/ })).toBeVisible()

  const titles = await page
    .locator('main a[href^="/recipes/"]:not([href="/recipes/new"])')
    .evaluateAll((links) => links.map((a) => a.querySelector('span')?.textContent?.trim() ?? ''))
  expect(titles.filter(Boolean)).not.toHaveLength(0)

  await page.goto('/')
  const daily = page.getByRole('region', { name: 'Recette du jour', exact: true })
  const title = daily.locator('a[href^="/recipes/"]').first()
  await expect(title).toBeVisible()
  await expect(title).toHaveText(new RegExp(`^(${titles.filter(Boolean).map(escapeRegExp).join('|')})$`))
})
