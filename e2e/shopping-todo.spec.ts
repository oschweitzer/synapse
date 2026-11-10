import { test, expect } from '@playwright/test'
import { resetDatabase, seedCairnChecklist } from './support/db'
import { STORAGE_STATE } from './support/env'
import { seedPrivateTodoItems, seedShoppingChecklist, seedTodoItems, userId } from './support/seed'

test.beforeAll(async () => {
  await resetDatabase()
  await seedShoppingChecklist(['Lait', 'Pain'])
  await seedTodoItems(['Appeler le garage'])
})

test.use({ storageState: STORAGE_STATE.allowed })

test('les articles de courses apparaissent et disparaissent une fois cochés', async ({ page }) => {
  await page.goto('/')
  const courses = page.getByRole('region', { name: 'Courses', exact: true })
  const lait = courses.getByRole('checkbox', { name: 'Lait' })
  const pain = courses.getByRole('checkbox', { name: 'Pain' })
  await expect(lait).toBeVisible()
  await expect(pain).toBeVisible()

  await lait.check()
  await expect(lait).toHaveCount(0)
  await expect(pain).toBeVisible()

  await page.reload()
  await expect(lait).toHaveCount(0)
  await expect(pain).toBeVisible()
})

test('un item à faire du jour apparaît et disparaît une fois coché', async ({ page }) => {
  await page.goto('/')
  const todo = page.getByRole('region', { name: 'À faire', exact: true })
  const item = todo.getByRole('checkbox', { name: 'Appeler le garage' })
  await expect(item).toBeVisible()
  // La checklist des courses a son propre widget.
  await expect(todo.getByText('Lait')).toHaveCount(0)
  await expect(todo.getByText('Pain')).toHaveCount(0)

  await item.check()
  await expect(item).toHaveCount(0)

  await page.reload()
  await expect(item).toHaveCount(0)
  await expect(todo.getByText('Rien à faire.')).toBeVisible()
})

test.describe('ajout et modification', () => {
  // Les tests ci-dessus vident la base : on repart de données neuves.
  test.beforeAll(async () => {
    await resetDatabase()
    await seedShoppingChecklist(['Lait', 'Pain'])
    await seedTodoItems(['Appeler le garage'])
    await seedCairnChecklist(await userId(), 'Maison')
    await seedPrivateTodoItems(['Secret'])
  })

  test('Courses : un article ajouté arrive en fin de liste et reste après rechargement', async ({ page }) => {
    await page.goto('/')
    const courses = page.getByRole('region', { name: 'Courses', exact: true })
    const input = courses.getByRole('textbox', { name: 'Ajouter un article' })
    await input.fill('Beurre')
    await input.press('Enter')
    await expect(courses.getByRole('checkbox', { name: 'Beurre' })).toBeVisible()
    await expect(input).toHaveValue('')

    await page.reload()
    const boxes = courses.getByRole('checkbox')
    await expect(boxes).toHaveCount(3)
    await expect(boxes.last()).toHaveAccessibleName('Beurre')
  })

  test('À faire : un item s’ajoute à la checklist choisie', async ({ page }) => {
    await page.goto('/')
    const todo = page.getByRole('region', { name: 'À faire', exact: true })
    await todo.getByRole('combobox', { name: 'Liste' }).selectOption({ label: 'Maison' })
    const input = todo.getByRole('textbox', { name: 'Ajouter un item' })
    await input.fill('Rappeler le plombier')
    await input.press('Enter')

    await page.reload()
    await expect(todo.getByRole('checkbox', { name: 'Rappeler le plombier' })).toBeVisible()
  })

  test('Courses : le texte d’un article se modifie sur place', async ({ page }) => {
    await page.goto('/')
    const courses = page.getByRole('region', { name: 'Courses', exact: true })
    await courses.getByRole('button', { name: 'Modifier « Pain »' }).click()
    const edit = courses.getByRole('textbox', { name: 'Modifier « Pain »' })
    await edit.fill('Pain complet')
    await edit.press('Enter')

    await page.reload()
    await expect(courses.getByRole('checkbox', { name: 'Pain complet' })).toBeVisible()
    await expect(courses.getByRole('checkbox', { name: 'Pain', exact: true })).toHaveCount(0)
  })

  test('un item d’une checklist privée reste masqué, sans bouton Modifier', async ({ page }) => {
    await page.goto('/')
    const todo = page.getByRole('region', { name: 'À faire', exact: true })
    const masked = todo.getByRole('listitem').filter({ hasText: 'Élément masqué' })
    await expect(masked).toBeVisible()
    await expect(masked.getByRole('button', { name: /Modifier/ })).toHaveCount(0)
    await expect(todo.getByText('Secret')).toHaveCount(0)
  })
})
