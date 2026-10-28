import { assertLocalTarget } from '../guard'
import { seedCairnChecklist, withSql } from './db'
import { TEST_USERS } from './env'

/** Id de l'utilisateur de test `email` (par défaut l'utilisateur autorisé), tel que créé par `resetDatabase`. */
export async function userId(email: string = TEST_USERS.allowed.email): Promise<string> {
  assertLocalTarget(process.env)
  return withSql(async (sql) => {
    const [row] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = lower(${email})`
    if (!row) throw new Error(`Utilisateur de test introuvable : ${email} (resetDatabase a-t-il été appelé ?).`)
    return row.id
  })
}

/** Ajoute `items` à la checklist `noteId` (non cochés, dans l'ordre) ; renvoie leurs ids. `dueToday` : échéance à maintenant. */
async function insertItems(uid: string, noteId: string, items: string[], dueToday: boolean): Promise<string[]> {
  return withSql(async (sql) => {
    const ids: string[] = []
    for (const [position, content] of items.entries()) {
      const [row] = await sql<{ id: string }[]>`
        insert into public.checklist_items (note_id, user_id, content, is_done, position, due_at)
        values (${noteId}, ${uid}, ${content}, false, ${position}, ${dueToday ? sql`now()` : null})
        returning id
      `
      ids.push(row.id)
    }
    return ids
  })
}

/** Crée la checklist « Courses » de l'utilisateur autorisé, la choisit dans les réglages et y met `items`. */
export async function seedShoppingChecklist(items: string[]): Promise<{ noteId: string; itemIds: string[] }> {
  assertLocalTarget(process.env)
  const uid = await userId()
  const noteId = await seedCairnChecklist(uid, 'Courses')
  const itemIds = await insertItems(uid, noteId, items, false)
  await withSql(async (sql) => {
    await sql`
      insert into synapse.settings (user_id, cairn_shopping_checklist_id) values (${uid}, ${noteId})
      on conflict (user_id) do update set cairn_shopping_checklist_id = excluded.cairn_shopping_checklist_id
    `
  })
  return { noteId, itemIds }
}

/** Crée une checklist « À faire » (hors courses) dont les items `items` sont dus aujourd'hui. */
export async function seedTodoItems(items: string[]): Promise<{ noteId: string; itemIds: string[] }> {
  assertLocalTarget(process.env)
  const uid = await userId()
  const noteId = await seedCairnChecklist(uid, 'À faire')
  const itemIds = await insertItems(uid, noteId, items, true)
  return { noteId, itemIds }
}
