/**
 * Lecture de la table des matières d'un PDF, pour retrouver la page d'un
 * chapitre sans que l'utilisateur ait à la chercher.
 *
 * Tout se passe dans le navigateur : le fichier n'est jamais transmis.
 */

export interface OutlineEntry {
  title: string
  page: number
}

/** Normalise un titre pour la comparaison : minuscules, sans accents ni ponctuation. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist")
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  }
  return pdfjs
}

/**
 * Aplatit la table des matières d'un PDF en couples titre / page (1-indexée).
 * Renvoie un tableau vide si le document n'a pas de signets.
 */
export async function readOutline(blob: Blob): Promise<OutlineEntry[]> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await blob.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise

  try {
    const outline = await doc.getOutline()
    if (!outline) return []

    const entries: OutlineEntry[] = []

    const walk = async (nodes: Awaited<ReturnType<typeof doc.getOutline>>) => {
      for (const node of nodes ?? []) {
        try {
          const dest = typeof node.dest === "string" ? await doc.getDestination(node.dest) : node.dest
          const ref = Array.isArray(dest) ? dest[0] : null
          if (ref) {
            const index = await doc.getPageIndex(ref)
            // Certains signets contiennent des retours à la ligne : « Hematology\net Oncology ».
            entries.push({ title: node.title.replace(/\s+/g, " ").trim(), page: index + 1 })
          }
        } catch {
          // signet sans destination exploitable : on l'ignore
        }
        if (node.items?.length) await walk(node.items)
      }
    }

    await walk(outline)
    return entries
  } finally {
    await doc.cleanup()
  }
}

/**
 * Retrouve la page d'un chapitre à partir de sa table des matières.
 * Un titre de signet qui contient l'un des alias l'emporte ; à égalité, on
 * garde le signet le plus court, c'est-à-dire le titre le plus proche du
 * terme cherché plutôt qu'une sous-section.
 */
export function findChapterPage(entries: OutlineEntry[], aliases: string[]): number | null {
  const needles = aliases.map(normalize).filter(Boolean)
  if (needles.length === 0) return null

  let best: OutlineEntry | null = null
  for (const entry of entries) {
    const title = normalize(entry.title)
    if (!needles.some((needle) => title.includes(needle))) continue
    if (!best || title.length < normalize(best.title).length) best = entry
  }
  return best ? best.page : null
}

/**
 * Sommaire d'un document et page trouvée pour chaque étape.
 * Les entrées sont conservées pour que l'utilisateur puisse corriger lui-même
 * le chapitre d'une étape sans connaître le numéro de page.
 */
export async function scanDocument(
  blob: Blob,
  targets: { id: string; aliases: string[] }[],
): Promise<{ entries: OutlineEntry[]; pages: Record<string, number> }> {
  const entries = await readOutline(blob)
  const pages: Record<string, number> = {}
  for (const target of targets) {
    const page = findChapterPage(entries, target.aliases)
    if (page !== null) pages[target.id] = page
  }
  return { entries, pages }
}
