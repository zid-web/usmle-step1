/**
 * Stockage local des PDF de cours First Aid.
 *
 * Les fichiers restent sur l'appareil : ils sont conservés dans IndexedDB,
 * jamais téléversés ni versionnés. Chaque entrée est indexée par la clé de
 * l'étape à laquelle le cours est rattaché (ou "book" pour l'ouvrage entier).
 */

const DB_NAME = "usmle-step1"
const DB_VERSION = 1
const STORE = "first-aid-pdfs"

/** Clés des documents de référence, indépendantes d'une étape précise. */
export const BOOK_KEY = "book"
export const PATHOMA_BOOK_KEY = "book-pathoma"

export interface StoredPdf {
  key: string
  name: string
  size: number
  blob: Blob
  savedAt: number
}

export type PdfMeta = Omit<StoredPdf, "blob">

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

export async function savePdf(key: string, file: File): Promise<PdfMeta> {
  const entry: StoredPdf = {
    key,
    name: file.name,
    size: file.size,
    blob: file,
    savedAt: Date.now(),
  }
  await run("readwrite", (store) => store.put(entry))
  const { blob, ...meta } = entry
  void blob
  return meta
}

export async function deletePdf(key: string): Promise<void> {
  await run("readwrite", (store) => store.delete(key))
}

export async function loadPdf(key: string): Promise<StoredPdf | null> {
  const entry = await run<StoredPdf | undefined>("readonly", (store) => store.get(key))
  return entry ?? null
}

/** Métadonnées de tous les PDF enregistrés, sans charger les fichiers eux-mêmes. */
export async function listPdfMeta(): Promise<Record<string, PdfMeta>> {
  const entries = await run<StoredPdf[]>("readonly", (store) => store.getAll())
  return Object.fromEntries(
    entries.map(({ blob, ...meta }) => {
      void blob
      return [meta.key, meta]
    }),
  )
}
