import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMealDb, toRecipe } from '@/lib/mealdb'

const fetchMock = vi.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const meal = (over: Record<string, string | null> = {}) => ({ idMeal: '1', strMeal: 'Soupe', ...over })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('toRecipe', () => {
  it('assemble les ingrédients et leur mesure', () => {
    const recipe = toRecipe(
      meal({ strIngredient1: 'Flour', strMeasure1: '200g', strIngredient2: 'Salt', strMeasure2: ' ', strIngredient3: 'Egg', strMeasure3: null }),
    )
    expect(recipe.ingredients).toEqual(['Flour (200g)', 'Salt', 'Egg'])
  })

  it('saute les ingrédients vides, sans décaler les suivants', () => {
    const recipe = toRecipe(meal({ strIngredient1: '', strMeasure1: '1 kg', strIngredient2: '  ', strIngredient3: 'Butter', strMeasure3: '50g' }))
    expect(recipe.ingredients).toEqual(['Butter (50g)'])
  })

  it('lit jusqu’au vingtième ingrédient', () => {
    expect(toRecipe(meal({ strIngredient20: 'Pepper' })).ingredients).toEqual(['Pepper'])
  })

  it('rend [] sans ingrédient ni instructions', () => {
    expect(toRecipe(meal())).toMatchObject({ ingredients: [], steps: [] })
  })

  it('découpe les instructions par ligne, CRLF ou LF, sans lignes vides', () => {
    const recipe = toRecipe(meal({ strInstructions: 'Mix.\r\n\r\nBake.\nServe.  \n' }))
    expect(recipe.steps).toEqual(['Mix.', 'Bake.', 'Serve.'])
  })

  it('retire les lignes de numérotation seules', () => {
    const recipe = toRecipe(meal({ strInstructions: 'STEP 1\nMix.\n1.\nBake.\n2\nstep 3:\nServe 4 people.\n3)' }))
    expect(recipe.steps).toEqual(['Mix.', 'Bake.', 'Serve 4 people.'])
  })

  it('garde strSource quand c’est une URL http(s)', () => {
    expect(toRecipe(meal({ strSource: 'https://example.com/soupe' })).source_url).toBe('https://example.com/soupe')
    expect(toRecipe(meal({ strSource: ' http://example.com/soupe ' })).source_url).toBe('http://example.com/soupe')
  })

  it.each([null, '', '   ', 'ftp://example.com', 'example.com/soupe'])('retombe sur la page TheMealDB pour la source %j', (source) => {
    expect(toRecipe(meal({ idMeal: '52772', strSource: source })).source_url).toBe('https://www.themealdb.com/meal/52772')
  })

  it('rend l’id TheMealDB et le titre rogné', () => {
    expect(toRecipe(meal({ idMeal: '7', strMeal: '  Soupe à l’oignon ' }))).toMatchObject({ mealdb_id: '7', title: 'Soupe à l’oignon' })
  })
})

describe('fetchMealDb', () => {
  it('interroge MEALDB_API_URL quand elle est définie', async () => {
    vi.stubEnv('MEALDB_API_URL', 'http://127.0.0.1:4010/mealdb/api/json/v1/1')
    fetchMock.mockResolvedValue(json({ meals: [meal()] }))
    await fetchMealDb('', 1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4010/mealdb/api/json/v1/1/random.php')
  })

  it('cherche par nom avec un seul appel, la requête encodée', async () => {
    fetchMock.mockResolvedValue(json({ meals: [meal({ idMeal: '1', strMeal: 'Chicken Soup' })] }))
    const result = await fetchMealDb('chicken & rice', 3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.themealdb.com/api/json/v1/1/search.php?s=chicken%20%26%20rice')
    expect(result.map((r) => r.title)).toEqual(['Chicken Soup'])
  })

  it('tire `count` recettes au hasard sans requête, doublons retirés', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ meals: [meal({ idMeal: '1', strMeal: 'A' })] }))
      .mockResolvedValueOnce(json({ meals: [meal({ idMeal: '2', strMeal: 'B' })] }))
      .mockResolvedValueOnce(json({ meals: [meal({ idMeal: '1', strMeal: 'A' })] }))
    const result = await fetchMealDb('', 3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const call of fetchMock.mock.calls) expect(call[0]).toBe('https://www.themealdb.com/api/json/v1/1/random.php')
    expect(result.map((r) => r.mealdb_id)).toEqual(['1', '2'])
  })

  it('rend au plus `count` recettes', async () => {
    fetchMock.mockResolvedValue(
      json({ meals: [1, 2, 3, 4].map((n) => meal({ idMeal: String(n), strMeal: `Plat ${n}` })) }),
    )
    const result = await fetchMealDb('plat', 2)
    expect(result.map((r) => r.mealdb_id)).toEqual(['1', '2'])
  })

  it('rend [] quand `meals` vaut null', async () => {
    fetchMock.mockResolvedValue(json({ meals: null }))
    expect(await fetchMealDb('inconnu', 5)).toEqual([])
  })

  it('écarte les recettes sans id ou sans titre', async () => {
    fetchMock.mockResolvedValue(
      json({
        meals: [
          { strMeal: 'Sans id' },
          { idMeal: '', strMeal: 'Id vide' },
          { idMeal: '2', strMeal: '   ' },
          { idMeal: '3' },
          { idMeal: '4', strMeal: 'Bonne' },
        ],
      }),
    )
    expect((await fetchMealDb('x', 5)).map((r) => r.mealdb_id)).toEqual(['4'])
  })

  it('rejette une réponse non OK', async () => {
    fetchMock.mockResolvedValue(json({}, 500))
    await expect(fetchMealDb('x', 1)).rejects.toThrow('TheMealDB 500')
  })

  it('laisse remonter un échec réseau', async () => {
    const error = new TypeError('fetch failed')
    fetchMock.mockRejectedValue(error)
    await expect(fetchMealDb('x', 1)).rejects.toBe(error)
  })
})
