import { assertLocalTarget } from '../guard'
import { encryptToken } from '../../lib/google/crypto'
import { SCOPE_DRIVE_FILE } from '../../lib/google/oauth'
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

/** Connecte Google pour l'utilisateur autorisé : compte avec `drive.file`, refresh token chiffré (le serveur factice accepte tout jeton). */
export async function seedGoogleConnection(): Promise<void> {
  assertLocalTarget(process.env)
  const uid = await userId()
  const cipher = await encryptToken('e2e-refresh-token')
  await withSql(async (sql) => {
    await sql`
      insert into synapse.google_accounts (user_id, google_email, scopes, needs_reauth)
      values (${uid}, ${TEST_USERS.allowed.email}, ${sql.array(['openid', 'email', SCOPE_DRIVE_FILE], 1009)}, false)
      on conflict (user_id) do update
        set google_email = excluded.google_email, scopes = excluded.scopes, needs_reauth = false
    `
    await sql`
      insert into synapse.google_credentials (user_id, refresh_token_encrypted)
      values (${uid}, ${cipher})
      on conflict (user_id) do update set refresh_token_encrypted = excluded.refresh_token_encrypted
    `
  })
}

/** Choisit `sheetId` comme fichier des dépenses cash de l'utilisateur autorisé (même format que la contrainte de la base). */
export async function seedCashSheet(sheetId: string): Promise<void> {
  assertLocalTarget(process.env)
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(sheetId)) throw new Error(`Identifiant de fichier invalide : ${sheetId}`)
  const uid = await userId()
  await withSql(async (sql) => {
    await sql`
      insert into synapse.settings (user_id, cash_sheet_id) values (${uid}, ${sheetId})
      on conflict (user_id) do update set cash_sheet_id = excluded.cash_sheet_id
    `
  })
}
