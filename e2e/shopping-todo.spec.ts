import { test, expect } from '@playwright/test'
import { resetDatabase } from './support/db'
import { STORAGE_STATE } from './support/env'
import { seedShoppingChecklist, seedTodoItems } from './support/seed'

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
