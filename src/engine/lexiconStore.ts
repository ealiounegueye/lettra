const DB = 'lettra'
const STORE = 'lexicon'
const KEY = 'imported'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('base indisponible'))
  })
}

export async function loadImportedLexicon(): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY)
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as string[] : [])
    request.onerror = () => reject(request.error ?? new Error('lecture impossible'))
  })
}

export async function saveImportedLexicon(words: string[]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(words, KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('enregistrement impossible'))
  })
}

export async function clearImportedLexicon(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('effacement impossible'))
  })
}

export function wordsInText(text: string): string[] {
  const found = new Set<string>()
  for (const chunk of text.split(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/)) {
    if (chunk.length >= 2 && chunk.length <= 24) found.add(chunk)
  }
  return [...found]
}
