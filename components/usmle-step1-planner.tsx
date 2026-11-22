"use client"

import { useEffect, useRef, useState } from "react"
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Layers,
  Paperclip,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { scanDocument, type OutlineEntry } from "@/lib/usmle-pdf-outline"
import {
  DECK_PREFIXES,
  DEFAULT_LAYOUT,
  NBME_WEEKS,
  RES,
  STAGES,
  STEP_INDEX,
  TOTAL_STEPS,
  WEEKS,
  ankiSearch,
  normalizeLayout,
  type DeckPrefix,
  type Layout,
  type Stage,
  type Step,
  type Week,
} from "@/lib/usmle-plan"
import {
  BOOK_KEY,
  PATHOMA_BOOK_KEY,
  deletePdf,
  listPdfMeta,
  loadPdf,
  savePdf,
  type PdfMeta,
} from "@/lib/usmle-pdf-store"

const newsreader = Newsreader({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"] })
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] })
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"] })

const serif = newsreader.style.fontFamily
const sans = plexSans.style.fontFamily
const mono = plexMono.style.fontFamily

const STORAGE_KEY = "usmle-step1-planner-v3"

type DoneMap = Record<string, boolean>
type PageMap = Record<string, string>
type NbmeKey = "w8" | "w10" | "w12"
type NbmeScores = Record<NbmeKey, string>

const EMPTY_NBME: NbmeScores = { w8: "", w10: "", w12: "" }

const weekDroppableId = (n: number) => `week-${n}`

/**
 * Documents de référence gardés sur l'appareil, communs à toutes les semaines.
 * Une étape rattachée à l'un d'eux ouvre le document plutôt qu'un lien externe.
 */
const BOOK_SLOTS = [
  { key: BOOK_KEY, title: "Cours First Aid — PDF complet", open: "Ouvrir le PDF First Aid" },
  { key: PATHOMA_BOOK_KEY, title: "Pathoma — document complet", open: "Ouvrir le document Pathoma" },
] as const

/** Document de référence d'une étape, ou null si elle n'en a pas. */
function bookSlotForStep(step: Step) {
  if (step.stage === "firstaid") return BOOK_SLOTS[0]
  if (step.stage === "pathoma") return BOOK_SLOTS[1]
  return null
}

/** Nombre de jours consacrés à chaque type d'étape dans une semaine de 7 jours. */
const STAGE_DAYS: Record<Stage, number> = {
  pathoma: 1,
  video: 1,
  firstaid: 2,
  uworld: 2,
  annotation: 1,
  anki: 0, // révision quotidienne : présente tous les jours
  nbme: 1,
  rest: 1,
}

const todayIso = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/** Étape à traiter chaque jour de la semaine ; null = journée de consolidation. */
function dayPlan(stepIds: string[]): (string | null)[] {
  const planned = stepIds.filter((id) => STEP_INDEX[id] && STAGE_DAYS[STEP_INDEX[id].stage] > 0)

  const slots: (string | null)[] = []
  for (const id of planned) {
    for (let i = 0; i < STAGE_DAYS[STEP_INDEX[id].stage]; i++) slots.push(id)
  }

  // Semaine chargée : chaque étape retombe à une journée, plutôt que d'en voir
  // certaines disparaître du plan.
  const days = slots.length > 7 ? [...planned] : slots
  while (days.length < 7) days.push(null)
  return days.slice(0, 7)
}

type PlanPosition =
  | { state: "before"; days: number }
  | { state: "running"; week: number; day: number }
  | { state: "after" }

/** Où l'on en est dans le plan, d'après la date de début. */
function planPosition(startIso: string, now = new Date()): PlanPosition | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso)) return null
  const [y, m, d] = startIso.split("-").map(Number)
  const start = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = Math.round((today.getTime() - start.getTime()) / 86_400_000)
  if (offset < 0) return { state: "before", days: -offset }
  const week = Math.floor(offset / 7) + 1
  if (week > 12) return { state: "after" }
  return { state: "running", week, day: (offset % 7) + 1 }
}

/** Étapes dont le chapitre est à chercher dans le sommaire d'un document donné. */
function chapterTargets(bookKey: string) {
  return Object.values(STEP_INDEX)
    .filter((step) => step.docAliases?.length && bookSlotForStep(step)?.key === bookKey)
    .map((step) => ({ id: step.id, aliases: step.docAliases as string[] }))
}

/**
 * Ouvre un PDF conservé localement, à la page demandée.
 * L'onglet est ouvert de façon synchrone pour rester dans le geste de
 * l'utilisateur, puis pointé vers le fichier une fois celui-ci relu.
 */
async function openStoredPdf(key: string, page: string) {
  const tab = window.open("", "_blank")
  try {
    const entry = await loadPdf(key)
    if (!entry) {
      tab?.close()
      return
    }
    const url = URL.createObjectURL(entry.blob)
    const target = page ? `${url}#page=${page}` : url
    if (tab) tab.location.href = target
    else window.open(target, "_blank")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    tab?.close()
  }
}

export function UsmleStep1Planner() {
  const [done, setDone] = useState<DoneMap>({})
  const [nbme, setNbme] = useState<NbmeScores>(EMPTY_NBME)
  const [prefix, setPrefix] = useState<DeckPrefix>("#AK_Step1_v12")
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  const [pages, setPages] = useState<PageMap>({})
  const [pdfs, setPdfs] = useState<Record<string, PdfMeta>>({})
  const [autoPages, setAutoPages] = useState<PageMap>({})
  const [outlines, setOutlines] = useState<Record<string, OutlineEntry[]>>({})
  const [scanning, setScanning] = useState<string | null>(null)
  const [startDate, setStartDate] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setDone(parsed.done || {})
        setNbme({ ...EMPTY_NBME, ...(parsed.nbme || {}) })
        setPages(parsed.pages || {})
        setAutoPages(parsed.autoPages || {})
        setOutlines(parsed.outlines || {})
        setLayout(normalizeLayout(parsed.layout))
        setStartDate(typeof parsed.startDate === "string" ? parsed.startDate : todayIso())
        if (DECK_PREFIXES.includes(parsed.prefix)) setPrefix(parsed.prefix)
      } else {
        setStartDate(todayIso())
      }
    } catch {
      // pas de progression enregistrée ou stockage indisponible
    } finally {
      setLoaded(true)
    }
    listPdfMeta()
      .then(setPdfs)
      .catch(() => {
        // IndexedDB indisponible (navigation privée) : on reste sans cours joints
      })
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ done, nbme, prefix, layout, pages, autoPages, outlines, startDate }),
      )
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [loaded, done, nbme, prefix, layout, pages, autoPages, outlines, startDate])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findWeekOf = (id: string): number | null => {
    if (id.startsWith("week-")) return Number(id.slice(5))
    const entry = Object.entries(layoutRef.current).find(([, ids]) => ids.includes(id))
    return entry ? Number(entry[0]) : null
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeWeek = findWeekOf(String(active.id))
    const overWeek = findWeekOf(String(over.id))
    if (activeWeek === null || overWeek === null || activeWeek === overWeek) return

    setLayout((prev) => {
      const overIds = prev[overWeek]
      const overIndex = overIds.indexOf(String(over.id))
      const insertAt = overIndex >= 0 ? overIndex : overIds.length
      return {
        ...prev,
        [activeWeek]: prev[activeWeek].filter((id) => id !== String(active.id)),
        [overWeek]: [...overIds.slice(0, insertAt), String(active.id), ...overIds.slice(insertAt)],
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const week = findWeekOf(String(active.id))
    const overWeek = findWeekOf(String(over.id))
    if (week === null || week !== overWeek) return

    setLayout((prev) => {
      const ids = prev[week]
      const from = ids.indexOf(String(active.id))
      const to = ids.indexOf(String(over.id))
      if (from === -1 || to === -1 || from === to) return prev
      return { ...prev, [week]: arrayMove(ids, from, to) }
    })
  }

  const attachPdf = async (key: string, file: File) => {
    try {
      const meta = await savePdf(key, file)
      setPdfs((prev) => ({ ...prev, [key]: meta }))
    } catch {
      setSaveError(true)
      return
    }

    const targets = chapterTargets(key)
    if (targets.length === 0) return

    // Le sommaire du document donne la page de chaque chapitre : l'appli ouvre
    // ensuite l'étape au bon endroit sans saisie manuelle.
    setScanning(key)
    try {
      const { entries, pages: found } = await scanDocument(file, targets)
      setOutlines((prev) => ({ ...prev, [key]: entries }))
      setAutoPages((prev) => {
        const next = { ...prev }
        for (const target of targets) delete next[target.id]
        for (const [id, page] of Object.entries(found)) next[id] = String(page)
        return next
      })
    } catch {
      // PDF illisible ou sans sommaire : la saisie manuelle de la page reste possible
    } finally {
      setScanning(null)
    }
  }

  const detachPdf = async (key: string) => {
    try {
      await deletePdf(key)
      setPdfs((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setAutoPages((prev) => {
        const next = { ...prev }
        for (const target of chapterTargets(key)) delete next[target.id]
        return next
      })
      setOutlines((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch {
      setSaveError(true)
    }
  }

  const resetAll = () => {
    setDone({})
    setNbme(EMPTY_NBME)
    setPages({})
    setLayout(DEFAULT_LAYOUT)
  }

  /** Page à ouvrir : la saisie manuelle prime sur la page détectée au sommaire. */
  const pageFor = (id: string) => pages[id] || autoPages[id] || ""

  const completedCount = Object.values(done).filter(Boolean).length
  const overallPct = Math.round((completedCount / TOTAL_STEPS) * 100)
  const scores = [nbme.w8, nbme.w10, nbme.w12].filter((v) => v !== "")
  const lastScore = scores.length > 0 ? scores[scores.length - 1] : null
  const activeStep = activeId ? STEP_INDEX[activeId] : null

  return (
    <div className="min-h-screen bg-[#F2F4F1] text-[#131B2E]" style={{ fontFamily: sans }}>
      <header className="border-b-2 border-[#131B2E] bg-[#F2F4F1] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-5">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <p className="text-[11px] tracking-[0.18em] uppercase text-[#5B6660]" style={{ fontFamily: mono }}>
                Séquences AnKing Step 1 — 12 semaines
              </p>
              <h1
                className="text-[28px] sm:text-[34px] leading-tight italic mt-0.5"
                style={{ fontFamily: serif, fontWeight: 600 }}
              >
                USMLE Step 1
              </h1>
            </div>
            <button
              onClick={resetAll}
              title="Remet la progression et l'ordre des étapes à zéro"
              className="flex items-center gap-1.5 text-[12px] text-[#5B6660] hover:text-[#131B2E] border border-[#DCE1DB] hover:border-[#131B2E] rounded-full px-3 py-1.5 transition-colors"
              style={{ fontFamily: mono }}
            >
              <RotateCcw size={12} strokeWidth={2} />
              Réinitialiser
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-6 border-t border-[#DCE1DB] pt-4">
            <Vital label="Progression" value={`${overallPct}%`} sub={`${completedCount} / ${TOTAL_STEPS} étapes`} />
            <Vital label="Semaine" value={String(currentWeek(overallPct))} sub="sur 12" />
            <Vital label="NBME" value={lastScore !== null ? `${lastScore}%` : "—"} sub="dernier score saisi" />
          </div>
          <ProgressRail pct={overallPct} />

          <div
            className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] tracking-[0.08em] uppercase text-[#5B6660]"
            style={{ fontFamily: mono }}
          >
            {(["pathoma", "firstaid", "uworld", "annotation", "anki"] as const).map((stage, i) => (
              <span key={stage} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[#B5790A]">→</span>}
                {STAGES[stage].label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-5">
        <TodayCard
          startDate={startDate}
          onStartDate={setStartDate}
          layout={layout}
          done={done}
          onToggle={(id) => setDone((prev) => ({ ...prev, [id]: !prev[id] }))}
          prefix={prefix}
          pageFor={pageFor}
          pdfs={pdfs}
        />
        <DeckBar prefix={prefix} onChange={setPrefix} />
        <BookBar pdfs={pdfs} onAttach={attachPdf} onDetach={detachPdf} scanning={scanning} />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {WEEKS.map((week) => {
            const ids = layout[week.n] ?? []
            return (
              <WeekCard
                key={week.n}
                week={week}
                stepIds={ids}
                weekDone={ids.filter((id) => done[id]).length}
                done={done}
                onToggle={(id) => setDone((prev) => ({ ...prev, [id]: !prev[id] }))}
                prefix={prefix}
                nbme={nbme}
                onNbme={(key, value) => setNbme((prev) => ({ ...prev, [key]: value }))}
                pages={pages}
                autoPages={autoPages}
                outlines={outlines}
                onPage={(id, value) => setPages((prev) => ({ ...prev, [id]: value }))}
                pdfs={pdfs}
                onAttach={attachPdf}
                onDetach={detachPdf}
              />
            )
          })}

          <DragOverlay>
            {activeStep && (
              <div
                className="bg-white border border-[#131B2E] rounded-sm px-3 py-2 text-[13px] shadow-lg max-w-md"
                style={{ fontFamily: sans }}
              >
                {activeStep.label}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <footer className="pt-4 pb-10 text-center text-[11px] text-[#8A938C]" style={{ fontFamily: mono }}>
          {loaded
            ? saveError
              ? "Sauvegarde indisponible — les modifications restent visibles dans cette session."
              : "Progression, ordre des étapes et cours joints enregistrés sur cet appareil."
            : "Chargement de la fiche…"}
        </footer>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function currentWeek(pct: number): number {
  return Math.min(12, Math.max(1, Math.ceil((pct / 100) * 12) || 1))
}

function Vital({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.14em] uppercase text-[#5B6660]" style={{ fontFamily: mono }}>
        {label}
      </p>
      <p className="text-[22px] leading-none mt-1" style={{ fontFamily: mono, fontWeight: 600 }}>
        {value}
      </p>
      <p className="text-[11px] text-[#8A938C] mt-0.5">{sub}</p>
    </div>
  )
}

function ProgressRail({ pct }: { pct: number }) {
  return (
    <div className="mt-4 relative h-2">
      <div className="absolute inset-0 flex gap-[3px]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{ backgroundColor: pct > (i / 12) * 100 ? "#B5790A" : "#DCE1DB" }}
          />
        ))}
      </div>
    </div>
  )
}

function TodayCard({
  startDate,
  onStartDate,
  layout,
  done,
  onToggle,
  prefix,
  pageFor,
  pdfs,
}: {
  startDate: string
  onStartDate: (v: string) => void
  layout: Layout
  done: DoneMap
  onToggle: (id: string) => void
  prefix: DeckPrefix
  pageFor: (id: string) => string
  pdfs: Record<string, PdfMeta>
}) {
  const position = planPosition(startDate)
  const week = position?.state === "running" ? WEEKS.find((w) => w.n === position.week) : undefined
  const stepIds = position?.state === "running" ? (layout[position.week] ?? []) : []
  const todayId = position?.state === "running" ? dayPlan(stepIds)[position.day - 1] : null
  const ankiId = stepIds.find((id) => STEP_INDEX[id]?.stage === "anki")
  const todayStep = todayId ? STEP_INDEX[todayId] : null
  const ankiStep = ankiId && ankiId !== todayId ? STEP_INDEX[ankiId] : null

  return (
    <section className="bg-[#131B2E] text-[#F2F4F1] rounded-sm px-5 sm:px-6 py-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <p className="text-[10px] tracking-[0.18em] uppercase text-[#9AA3B2]" style={{ fontFamily: mono }}>
          Aujourd'hui
          {position?.state === "running" && ` · Semaine ${position.week} · Jour ${position.day} / 7`}
        </p>
        <label className="flex items-center gap-2 text-[11px] text-[#9AA3B2]" style={{ fontFamily: mono }}>
          Début du plan
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDate(e.target.value)}
            className="bg-transparent border border-[#3A4257] rounded-sm px-2 py-1 text-[#F2F4F1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A]"
            style={{ fontFamily: mono }}
          />
        </label>
      </div>

      {position?.state === "running" && week ? (
        <>
          <h2 className="text-[20px] mt-2" style={{ fontFamily: serif, fontWeight: 600 }}>
            {week.system}
          </h2>
          <div className="mt-3 space-y-3">
            {todayStep ? (
              <TodayStep
                step={todayStep}
                checked={!!done[todayStep.id]}
                onToggle={() => onToggle(todayStep.id)}
                prefix={prefix}
                page={pageFor(todayStep.id)}
                pdfs={pdfs}
              />
            ) : (
              <p className="text-[14px] text-[#C7CEC8]">
                Journée de consolidation : pas de nouveau contenu, on reprend les questions ratées et on termine les
                cartes dues.
              </p>
            )}
            {ankiStep && (
              <TodayStep
                step={ankiStep}
                checked={!!done[ankiStep.id]}
                onToggle={() => onToggle(ankiStep.id)}
                prefix={prefix}
                page=""
                pdfs={pdfs}
              />
            )}
          </div>
        </>
      ) : (
        <p className="text-[14px] text-[#C7CEC8] mt-2">
          {position?.state === "before"
            ? `Le plan démarre dans ${position.days} jour${position.days > 1 ? "s" : ""}.`
            : position?.state === "after"
              ? "Les 12 semaines sont écoulées : place aux blocs courts sur les zones faibles et au repos."
              : "Choisis une date de début pour que l'appli propose le chapitre du jour."}
        </p>
      )}
    </section>
  )
}

function TodayStep({
  step,
  checked,
  onToggle,
  prefix,
  page,
  pdfs,
}: {
  step: Step
  checked: boolean
  onToggle: () => void
  prefix: DeckPrefix
  page: string
  pdfs: Record<string, PdfMeta>
}) {
  const stage = STAGES[step.stage]
  const StageIcon = stage.icon
  const slot = bookSlotForStep(step)
  const ownPdf = pdfs[step.id]
  const hasDoc = slot && (ownPdf || pdfs[slot.key])

  return (
    <div className="flex items-start gap-3">
      <button
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={checked ? "Marquer comme non fait" : "Marquer comme fait"}
        className="shrink-0 w-5 h-5 mt-0.5 rounded-sm border flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A]"
        style={{
          borderColor: checked ? "#7FB3A6" : "#5B6680",
          backgroundColor: checked ? "#1F6F63" : "transparent",
        }}
      >
        {checked && <Check size={13} color="white" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <StageIcon size={12} strokeWidth={2} className="text-[#D9A43C] shrink-0" />
          <span className="text-[10px] tracking-[0.14em] uppercase text-[#9AA3B2]" style={{ fontFamily: mono }}>
            {stage.label}
          </span>
        </div>
        <p className={`text-[15px] mt-0.5 ${checked ? "text-[#8A938C] line-through" : ""}`}>{step.label}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {hasDoc && slot && (
            <button
              onClick={() => openStoredPdf(ownPdf ? step.id : slot.key, page)}
              className="flex items-center gap-1.5 text-[11px] border border-[#3A4257] hover:border-[#F2F4F1] rounded-full px-2.5 py-1 text-[#C7CEC8] hover:text-[#F2F4F1] transition-colors"
              style={{ fontFamily: mono }}
            >
              <FileText size={11} strokeWidth={2} />
              {page ? `Ouvrir au chapitre — page ${page}` : "Ouvrir le document"}
            </button>
          )}
          {step.tags.map((target) => (
            <TagChip key={`${target.ns}-${target.pattern}`} search={ankiSearch(prefix, target)} dark />
          ))}
        </div>
      </div>
    </div>
  )
}

function DeckBar({ prefix, onChange }: { prefix: DeckPrefix; onChange: (v: DeckPrefix) => void }) {
  return (
    <section className="bg-white border border-[#DCE1DB] rounded-sm px-5 sm:px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Layers size={14} className="text-[#B5790A]" strokeWidth={2} />
        <label htmlFor="deck-prefix" className="text-[12px] text-[#5B6660]" style={{ fontFamily: mono }}>
          Version du deck AnKing
        </label>
        <select
          id="deck-prefix"
          value={prefix}
          onChange={(e) => onChange(e.target.value as DeckPrefix)}
          className="text-[12px] border border-[#DCE1DB] rounded-sm px-2 py-1 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A]"
          style={{ fontFamily: mono }}
        >
          {DECK_PREFIXES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[12px] text-[#5B6660] mt-3 leading-relaxed">
        Chaque étape Anki porte la recherche à coller dans le navigateur de cartes. Une fois les cartes affichées :{" "}
        <span style={{ fontFamily: mono }}>Ctrl+A</span> puis <span style={{ fontFamily: mono }}>Ctrl+J</span> pour les
        désuspendre (<span style={{ fontFamily: mono }}>Cmd</span> sur Mac). Poignée{" "}
        <GripVertical size={11} className="inline align-[-1px]" strokeWidth={2} /> : réordonner une étape ou la faire
        glisser vers une autre semaine.
      </p>
    </section>
  )
}

function BookBar({
  pdfs,
  onAttach,
  onDetach,
  scanning,
}: {
  pdfs: Record<string, PdfMeta>
  onAttach: (key: string, file: File) => void
  onDetach: (key: string) => void
  scanning: string | null
}) {
  return (
    <section className="bg-white border border-[#DCE1DB] rounded-sm px-5 sm:px-6 py-4 space-y-2.5">
      {BOOK_SLOTS.map((slot) => {
        const meta = pdfs[slot.key]
        return (
          <div key={slot.key} className="flex flex-wrap items-center gap-3">
            <FileText size={14} className="text-[#B5790A] shrink-0" strokeWidth={2} />
            <span className="text-[12px] text-[#5B6660]" style={{ fontFamily: mono }}>
              {slot.title}
            </span>
            {meta ? (
              <span className="flex items-center gap-2 text-[12px] text-[#131B2E]">
                <span className="truncate max-w-[220px]">{meta.name}</span>
                {scanning === slot.key && (
                  <span className="text-[11px] text-[#8A938C]" style={{ fontFamily: mono }}>
                    lecture du sommaire…
                  </span>
                )}
                <button
                  onClick={() => onDetach(slot.key)}
                  aria-label={`Retirer : ${slot.title}`}
                  className="text-[#8A938C] hover:text-[#131B2E] transition-colors"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </span>
            ) : (
              <FilePicker id={`pdf-${slot.key}`} label="Choisir le PDF" onPick={(file) => onAttach(slot.key, file)} />
            )}
          </div>
        )
      })}
      <p className="text-[12px] text-[#5B6660] leading-relaxed pt-1">
        Les fichiers restent sur cet appareil (IndexedDB) : rien n'est envoyé sur un serveur. Au moment où tu joins un
        document entier, l'appli lit son sommaire et retient la page de chaque chapitre : les étapes s'ouvrent alors
        directement au bon endroit. Le champ « page » d'une étape sert à corriger la page trouvée, et tu peux toujours
        joindre un chapitre séparé.
      </p>
    </section>
  )
}

function FilePicker({ id, label, onPick }: { id: string; label: string; onPick: (file: File) => void }) {
  return (
    <>
      <label
        htmlFor={id}
        className="cursor-pointer flex items-center gap-1.5 text-[11px] border border-[#DCE1DB] hover:border-[#131B2E] rounded-full px-2.5 py-1 text-[#5B6660] hover:text-[#131B2E] transition-colors"
        style={{ fontFamily: mono }}
      >
        <Paperclip size={11} strokeWidth={2} />
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ""
        }}
      />
    </>
  )
}

interface StepCallbacks {
  done: DoneMap
  onToggle: (id: string) => void
  prefix: DeckPrefix
  pages: PageMap
  autoPages: PageMap
  outlines: Record<string, OutlineEntry[]>
  onPage: (id: string, value: string) => void
  pdfs: Record<string, PdfMeta>
  onAttach: (key: string, file: File) => void
  onDetach: (key: string) => void
}

function WeekCard({
  week,
  stepIds,
  weekDone,
  nbme,
  onNbme,
  ...steps
}: {
  week: Week
  stepIds: string[]
  weekDone: number
  nbme: NbmeScores
  onNbme: (key: NbmeKey, value: string) => void
} & StepCallbacks) {
  const { setNodeRef, isOver } = useDroppable({ id: weekDroppableId(week.n) })
  const isComplete = stepIds.length > 0 && weekDone === stepIds.length
  const nbmeKey = `w${week.n}` as NbmeKey

  return (
    <section
      className="bg-white border rounded-sm overflow-hidden transition-colors"
      style={{
        borderColor: isOver ? "#B5790A" : "#DCE1DB",
        borderLeft: `3px solid ${isComplete ? "#1F6F63" : "#131B2E"}`,
      }}
    >
      <div className="flex items-start justify-between px-5 sm:px-6 pt-4 pb-3 border-b border-[#EEF0EC]">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase text-[#5B6660]" style={{ fontFamily: mono }}>
            Semaine {week.n} · {week.range}
          </p>
          <h2 className="text-[19px] mt-0.5" style={{ fontFamily: serif, fontWeight: 600 }}>
            {week.system}
          </h2>
        </div>
        <span
          className="shrink-0 text-[12px] rounded-full px-2.5 py-1 mt-0.5"
          style={{
            fontFamily: mono,
            backgroundColor: isComplete ? "#E6F0EE" : "#F2F4F1",
            color: isComplete ? "#1F6F63" : "#5B6660",
          }}
        >
          {weekDone}/{stepIds.length}
        </span>
      </div>

      <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="px-5 sm:px-6 py-2 min-h-[60px]">
          {stepIds.length === 0 && (
            <li className="py-4 text-[12px] text-[#8A938C] text-center" style={{ fontFamily: mono }}>
              Déposer une étape ici
            </li>
          )}
          {stepIds.map((id, i) => (
            <SortableStep
              key={id}
              step={STEP_INDEX[id]}
              index={i + 1}
              isLast={i === stepIds.length - 1}
              {...steps}
            />
          ))}
        </ol>
      </SortableContext>

      {NBME_WEEKS.includes(week.n) && (
        <div className="flex items-center gap-3 px-5 sm:px-6 py-3 bg-[#F2F4F1] border-t border-[#EEF0EC]">
          <Activity size={14} className="text-[#B5790A]" strokeWidth={2} />
          <label htmlFor={`nbme-${nbmeKey}`} className="text-[12px] text-[#5B6660]" style={{ fontFamily: mono }}>
            Score NBME (%)
          </label>
          <input
            id={`nbme-${nbmeKey}`}
            type="number"
            min="0"
            max="100"
            value={nbme[nbmeKey]}
            onChange={(e) => onNbme(nbmeKey, e.target.value)}
            placeholder="—"
            className="w-16 text-[13px] border border-[#DCE1DB] rounded-sm px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A] bg-white"
            style={{ fontFamily: mono }}
          />
        </div>
      )}
    </section>
  )
}

function SortableStep({
  step,
  index,
  isLast,
  done,
  onToggle,
  prefix,
  pages,
  autoPages,
  outlines,
  onPage,
  pdfs,
  onAttach,
  onDetach,
}: { step: Step; index: number; isLast: boolean } & StepCallbacks) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const checked = !!done[step.id]
  const stage = STAGES[step.stage]
  const StageIcon = stage.icon
  const slot = bookSlotForStep(step)
  // Une étape avec document local ouvre le document ; les autres gardent leur lien externe.
  const resource = slot === null && step.res ? RES[step.res] : null
  const ResIcon = resource ? resource.icon : null
  const ownPdf = pdfs[step.id]
  const page = pages[step.id] ?? ""
  const autoPage = autoPages[step.id] ?? ""
  const outline = slot ? (outlines[slot.key] ?? []) : []

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex gap-2 sm:gap-3 bg-white"
    >
      {/* Poignée + rail fléché */}
      <div className="flex flex-col items-center shrink-0 pt-3">
        <div className="flex items-center gap-0.5">
          <button
            {...attributes}
            {...listeners}
            aria-label={`Déplacer : ${step.label}`}
            className="touch-none cursor-grab active:cursor-grabbing text-[#C7CEC8] hover:text-[#131B2E] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A] rounded-sm"
          >
            <GripVertical size={14} strokeWidth={2} />
          </button>
          <span
            className="w-6 h-6 rounded-full border flex items-center justify-center text-[11px] transition-colors"
            style={{
              fontFamily: mono,
              borderColor: checked ? "#1F6F63" : "#DCE1DB",
              backgroundColor: checked ? "#1F6F63" : "#FFFFFF",
              color: checked ? "#FFFFFF" : "#5B6660",
            }}
          >
            {index}
          </span>
        </div>
        {!isLast && (
          <span className="flex-1 flex flex-col items-center justify-center py-0.5 ml-4">
            <span className="flex-1 w-px" style={{ backgroundColor: checked ? "#1F6F63" : "#DCE1DB" }} />
            <ChevronDown size={12} strokeWidth={2} color={checked ? "#1F6F63" : "#C7CEC8"} />
          </span>
        )}
      </div>

      {/* Contenu de l'étape */}
      <div className="flex-1 min-w-0 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <StageIcon size={12} strokeWidth={2} className="text-[#B5790A] shrink-0" />
          <span className="text-[10px] tracking-[0.14em] uppercase text-[#5B6660]" style={{ fontFamily: mono }}>
            {stage.label}
          </span>
          {step.detail && <span className="text-[11px] text-[#8A938C]">· {step.detail}</span>}
        </div>

        <div className="flex items-start gap-3 mt-1.5">
          <button
            onClick={() => onToggle(step.id)}
            aria-pressed={checked}
            aria-label={checked ? "Marquer comme non fait" : "Marquer comme fait"}
            className="shrink-0 w-5 h-5 mt-0.5 rounded-sm border flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A] focus-visible:ring-offset-1"
            style={{
              borderColor: checked ? "#1F6F63" : "#B7BEB8",
              backgroundColor: checked ? "#1F6F63" : "transparent",
            }}
          >
            {checked && <Check size={13} color="white" strokeWidth={3} />}
          </button>
          <span className={`text-[14px] flex-1 ${checked ? "text-[#8A938C] line-through" : "text-[#131B2E]"}`}>
            {step.label}
          </span>
          {resource && ResIcon && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-[11px] border border-[#DCE1DB] hover:border-[#131B2E] rounded-full px-2.5 py-1 text-[#5B6660] hover:text-[#131B2E] transition-colors"
              style={{ fontFamily: mono }}
            >
              <ResIcon size={11} strokeWidth={2} />
              {resource.label}
              <ExternalLink size={10} strokeWidth={2} />
            </a>
          )}
        </div>

        {step.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 ml-8">
            {step.tags.map((target) => (
              <TagChip key={`${target.ns}-${target.pattern}`} search={ankiSearch(prefix, target)} />
            ))}
          </div>
        )}

        {slot && (
          <div className="flex flex-wrap items-center gap-2 mt-2 ml-8">
            {(ownPdf || pdfs[slot.key]) && (
              <button
                onClick={() => openStoredPdf(ownPdf ? step.id : slot.key, page || autoPage)}
                className="flex items-center gap-1.5 text-[11px] border border-[#DCE1DB] hover:border-[#131B2E] rounded-full px-2.5 py-1 text-[#5B6660] hover:text-[#131B2E] transition-colors"
                style={{ fontFamily: mono }}
              >
                <FileText size={11} strokeWidth={2} />
                {ownPdf ? "Ouvrir le chapitre" : slot.open}
              </button>
            )}
            {outline.length > 0 && (
              <select
                aria-label={`Chapitre du document pour : ${step.label}`}
                value={page || autoPage}
                onChange={(e) => onPage(step.id, e.target.value)}
                className="max-w-[240px] text-[11px] border border-[#DCE1DB] rounded-sm px-2 py-1 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A]"
                style={{ fontFamily: mono }}
              >
                <option value="">chapitre…</option>
                {outline.map((entry, i) => (
                  <option key={`${entry.page}-${i}`} value={String(entry.page)}>
                    {entry.title} — p. {entry.page}
                  </option>
                ))}
              </select>
            )}
            <label htmlFor={`page-${step.id}`} className="text-[11px] text-[#8A938C]" style={{ fontFamily: mono }}>
              page
            </label>
            <input
              id={`page-${step.id}`}
              type="number"
              min="1"
              value={page}
              onChange={(e) => onPage(step.id, e.target.value)}
              placeholder={autoPage || "—"}
              title={autoPage ? `Page ${autoPage} détectée dans le sommaire` : undefined}
              className="w-14 text-[12px] border border-[#DCE1DB] rounded-sm px-2 py-1 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5790A]"
              style={{ fontFamily: mono }}
            />
            {ownPdf ? (
              <span className="flex items-center gap-1.5 text-[11px] text-[#5B6660]" style={{ fontFamily: mono }}>
                <span className="truncate max-w-[160px]">{ownPdf.name}</span>
                <button
                  onClick={() => onDetach(step.id)}
                  aria-label="Retirer le chapitre joint"
                  className="text-[#8A938C] hover:text-[#131B2E] transition-colors"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </span>
            ) : (
              <FilePicker
                id={`pdf-${step.id}`}
                label="Joindre le chapitre"
                onPick={(file) => onAttach(step.id, file)}
              />
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function TagChip({ search, dark = false }: { search: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(search)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // presse-papiers indisponible : la recherche reste lisible et sélectionnable
    }
  }

  return (
    <button
      onClick={copy}
      title="Copier la recherche Anki"
      className={`group flex items-center gap-1.5 max-w-full text-[11px] border rounded-sm px-2 py-1 transition-colors ${
        dark
          ? "bg-transparent border-[#3A4257] text-[#C7CEC8] hover:border-[#F2F4F1] hover:text-[#F2F4F1]"
          : "bg-[#F2F4F1] border-[#DCE1DB] text-[#5B6660] hover:border-[#131B2E] hover:text-[#131B2E]"
      }`}
      style={{ fontFamily: mono }}
    >
      <span className="truncate">{search}</span>
      {copied ? (
        <Check size={11} strokeWidth={2.5} className="shrink-0 text-[#1F6F63]" />
      ) : (
        <Copy size={11} strokeWidth={2} className="shrink-0" />
      )}
    </button>
  )
}
