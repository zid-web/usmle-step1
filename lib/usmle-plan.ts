import type { LucideIcon } from "lucide-react"
import { Activity, BookOpen, Layers, ListChecks, Moon, PenLine, PlayCircle } from "lucide-react"

// ---------------------------------------------------------------------------
// Ressources externes
// ---------------------------------------------------------------------------
export interface Resource {
  label: string
  url: string
  icon: LucideIcon
}

// Les étapes de lecture n'ont pas de lien externe : elles ouvrent le PDF du
// cours conservé sur l'appareil.
export const RES = {
  pathoma: { label: "Pathoma", url: "https://www.pathoma.com/", icon: PlayCircle },
  bnb: { label: "Boards & Beyond", url: "https://www.boardsbeyond.com/", icon: PlayCircle },
  uworld: { label: "UWorld", url: "https://www.uworld.com/step-1", icon: ListChecks },
  sketchy: { label: "Sketchy", url: "https://www.sketchy.com/", icon: PlayCircle },
  anki: { label: "Mes decks Anki", url: "https://ankiweb.net/decks", icon: Layers },
  nbme: {
    label: "NBME",
    url: "https://www.nbme.org/students-residents/self-assessment-services",
    icon: Activity,
  },
} satisfies Record<string, Resource>

export type ResourceKey = keyof typeof RES

// ---------------------------------------------------------------------------
// Étapes de la séquence hebdomadaire
// Workflow : vidéo (si besoin) → First Aid → UWorld par système →
//            annotation First Aid → révision Anki quotidienne
// ---------------------------------------------------------------------------
export type Stage = "pathoma" | "video" | "firstaid" | "uworld" | "annotation" | "anki" | "nbme" | "rest"

export const STAGES: Record<Stage, { label: string; icon: LucideIcon }> = {
  pathoma: { label: "Pathoma", icon: BookOpen },
  video: { label: "Vidéo", icon: PlayCircle },
  firstaid: { label: "Lecture", icon: BookOpen },
  uworld: { label: "Questions", icon: ListChecks },
  annotation: { label: "Annotation", icon: PenLine },
  anki: { label: "Anki", icon: Layers },
  nbme: { label: "Bilan", icon: Activity },
  rest: { label: "Repos", icon: Moon },
}

/** Cible de tag dans le deck AnKing Step 1 : espace de noms + motif. */
export interface AnkiTarget {
  ns: string
  pattern: string
}

const t = (ns: string, pattern: string): AnkiTarget => ({ ns, pattern })

export interface Step {
  id: string
  stage: Stage
  label: string
  detail?: string
  res: ResourceKey | null
  tags: AnkiTarget[]
  /** Chapitre First Aid visé, pour rattacher le PDF du cours. */
  faChapter?: string
  /** Titres de chapitre à chercher dans le sommaire du PDF du cours. */
  docAliases?: string[]
}

export interface Week {
  n: number
  range: string
  system: string
  steps: Step[]
}

/** Un chapitre de First Aid : une étape de lecture, un fichier à joindre. */
interface Reading {
  label: string
  tags: AnkiTarget[]
  chapter: string
  aliases: string[]
}

interface WeekSpec {
  n: number
  range: string
  system: string
  videoRes: ResourceKey
  video: string
  videoTags: AnkiTarget[]
  videoAliases?: string[]
  readings: Reading[]
  uworld: string
  annotation: string
  review: string
  reviewTags: AnkiTarget[]
  extra?: Step[]
}

function buildWeek(s: WeekSpec): Week {
  return {
    n: s.n,
    range: s.range,
    system: s.system,
    steps: [
      {
        id: `w${s.n}-video`,
        stage: s.videoRes === "pathoma" ? "pathoma" : "video",
        label: s.video,
        res: s.videoRes,
        tags: s.videoTags,
        detail: s.videoRes === "pathoma" ? undefined : "Si besoin",
        docAliases: s.videoAliases,
      },
      ...s.readings.map((reading, i) => ({
        id: i === 0 ? `w${s.n}-fa` : `w${s.n}-fa${i + 1}`,
        stage: "firstaid" as const,
        label: reading.label,
        res: null,
        tags: reading.tags,
        faChapter: reading.chapter,
        docAliases: reading.aliases,
      })),
      { id: `w${s.n}-uw`, stage: "uworld", label: s.uworld, res: "uworld", tags: [] },
      { id: `w${s.n}-annot`, stage: "annotation", label: s.annotation, res: null, tags: [] },
      { id: `w${s.n}-anki`, stage: "anki", label: s.review, res: "anki", tags: s.reviewTags },
      ...(s.extra ?? []),
    ],
  }
}

export const WEEKS: Week[] = [
  buildWeek({
    n: 1,
    range: "7–11 %",
    system: "Cardiovasculaire",
    videoRes: "pathoma",
    video: "Pathoma — vasculaire puis cardiaque",
    videoTags: [t("#Pathoma", "*Vascular*"), t("#Pathoma", "*Cardiac*")],
    videoAliases: ["Vascular", "Cardiac"],
    readings: [
      { label: "First Aid — chapitre cardiovasculaire, lecture active", tags: [t("#FirstAid", "*Cardiovascular*")], chapter: "Cardiovascular", aliases: ["Cardiovascular"] },
    ],
    uworld: "UWorld — 40 questions cardio par système, mode tutor",
    annotation: "Annoter First Aid à partir des explications UWorld",
    review: "Anki — désuspendre le système, puis révision quotidienne",
    reviewTags: [t("^Systems", "Cardio*")],
  }),
  buildWeek({
    n: 2,
    range: "11–15 %",
    system: "Respiratoire & Rénal",
    videoRes: "pathoma",
    video: "Pathoma — respiratoire et rénal",
    videoTags: [t("#Pathoma", "*Respiratory*"), t("#Pathoma", "*Renal*")],
    videoAliases: ["Respiratory", "Kidney", "Renal"],
    readings: [
      { label: "First Aid — chapitre respiratoire", tags: [t("#FirstAid", "*Respiratory*")], chapter: "Respiratory", aliases: ["Respiratory"] },
      { label: "First Aid — chapitre rénal", tags: [t("#FirstAid", "*Renal*")], chapter: "Renal", aliases: ["Renal"] },
    ],
    uworld: "UWorld — 40 questions respi/rénal par système, mode tutor",
    annotation: "Annoter First Aid (équilibre acido-basique, diurétiques)",
    review: "Anki — désuspendre les deux systèmes, révision quotidienne",
    reviewTags: [t("^Systems", "Respiratory*"), t("^Systems", "Renal*")],
  }),
  buildWeek({
    n: 3,
    range: "6–10 %",
    system: "Gastro-intestinal",
    videoRes: "pathoma",
    video: "Pathoma — gastro-intestinal et hépatobiliaire",
    videoTags: [t("#Pathoma", "*GI*")],
    videoAliases: ["Gastrointestinal", "Liver", "Pancreas"],
    readings: [
      { label: "First Aid — chapitre gastro-intestinal", tags: [t("#FirstAid", "*Gastrointestinal*")], chapter: "Gastrointestinal", aliases: ["Gastrointestinal"] },
    ],
    uworld: "UWorld — 40 questions GI par système, mode tutor",
    annotation: "Annoter First Aid (anatomie, hépatologie)",
    review: "Anki — désuspendre le système GI, révision quotidienne",
    reviewTags: [t("^Systems", "GI*")],
  }),
  buildWeek({
    n: 4,
    range: "12–16 %",
    system: "Endocrinien & Reproductif",
    videoRes: "pathoma",
    video: "Pathoma — endocrinien, appareil génital, sein",
    videoTags: [t("#Pathoma", "*Endocrine*"), t("#Pathoma", "*Female*")],
    videoAliases: ["Endocrine", "Female Genital", "Breast"],
    readings: [
      { label: "First Aid — chapitre endocrinien", tags: [t("#FirstAid", "*Endocrine*")], chapter: "Endocrine", aliases: ["Endocrine"] },
      { label: "First Aid — chapitre reproductif", tags: [t("#FirstAid", "*Repro*")], chapter: "Reproductive", aliases: ["Reproductive", "Repro"] },
    ],
    uworld: "UWorld — 40 questions endo/repro par système, mode tutor",
    annotation: "Annoter First Aid (axes hormonaux, embryologie)",
    review: "Anki — désuspendre les deux systèmes, révision quotidienne",
    reviewTags: [t("^Systems", "Endocrine*"), t("^Systems", "Reproductive*")],
  }),
  buildWeek({
    n: 5,
    range: "10–14 %",
    system: "Neurologie, sens spéciaux & santé comportementale",
    videoRes: "pathoma",
    video: "Pathoma — neuropathologie",
    videoTags: [t("#Pathoma", "*Neuro*")],
    videoAliases: ["Central Nervous System", "Neuro"],
    readings: [
      { label: "First Aid — neurologie et sens spéciaux", tags: [t("#FirstAid", "*Neuro*")], chapter: "Neurology", aliases: ["Neurology", "Neurologic"] },
      { label: "First Aid — psychiatrie", tags: [t("#FirstAid", "*Psychiatry*")], chapter: "Psychiatry", aliases: ["Psychiatry", "Psychiatric"] },
    ],
    uworld: "UWorld — 40 questions neuro/psy par système, mode tutor",
    annotation: "Annoter First Aid (voies médullaires, neuro-anatomie)",
    review: "Anki — désuspendre neuro et psychiatrie, révision quotidienne",
    reviewTags: [t("^Systems", "Neuro*"), t("^Systems", "Psychiatry*")],
  }),
  buildWeek({
    n: 6,
    range: "8–12 %",
    system: "Musculo-squelettique & peau",
    videoRes: "pathoma",
    video: "Pathoma — musculo-squelettique et dermatologie",
    videoTags: [t("#Pathoma", "*MSK*"), t("#Pathoma", "*Derm*")],
    videoAliases: ["Musculoskeletal", "Skin"],
    readings: [
      { label: "First Aid — musculo-squelettique, peau et tissu conjonctif", tags: [t("#FirstAid", "*Musculoskeletal*")], chapter: "Musculoskeletal", aliases: ["Musculoskeletal"] },
    ],
    uworld: "UWorld — 40 questions MSK/peau par système, mode tutor",
    annotation: "Annoter First Aid (lésions nerveuses, connectivites)",
    review: "Anki — désuspendre MSK et dermatologie, révision quotidienne",
    reviewTags: [t("^Systems", "Musculoskeletal*"), t("^Systems", "Dermatology*")],
  }),
  buildWeek({
    n: 7,
    range: "9–13 % + 8–12 %",
    system: "Hématologie/immunitaire & multisystémique",
    videoRes: "pathoma",
    video: "Pathoma — hémostase, globules rouges et blancs",
    videoTags: [t("#Pathoma", "*Hemostasis*"), t("#Pathoma", "*WBC*")],
    videoAliases: ["Hemostasis", "White Blood Cell", "Red Blood Cell"],
    readings: [
      { label: "First Aid — hématologie et oncologie", tags: [t("#FirstAid", "*Hematology*")], chapter: "Hematology_Oncology", aliases: ["Hematology"] },
      { label: "First Aid — immunologie", tags: [t("#FirstAid", "*Immunology*")], chapter: "Immunology", aliases: ["Immunology"] },
    ],
    uworld: "UWorld — 40 questions hémato/immuno par système, mode tutor",
    annotation: "Annoter First Aid (anémies, déficits immunitaires)",
    review: "Anki — désuspendre hémato/onco et immuno, révision quotidienne",
    reviewTags: [t("^Systems", "HemeOnc*"), t("^Systems", "Immunology*")],
  }),
  buildWeek({
    n: 8,
    range: "4–6 % + 6–9 %",
    system: "Biochimie, biostatistiques & bilan NBME #1",
    videoRes: "bnb",
    video: "Boards & Beyond — biostatistiques et épidémiologie",
    videoTags: [t("#B&B", "*Biostat*")],
    readings: [
      {
        label: "First Aid — biochimie : moléculaire, génétique, nutrition, métabolisme",
        tags: [t("#FirstAid", "*Biochemistry*")],
        chapter: "Biochemistry",
        aliases: ["Biochemistry", "Biochemical"],
      },
      { label: "First Aid — santé publique, éthique et communication", tags: [t("#FirstAid", "*Public_Health*")], chapter: "Public_Health", aliases: ["Public Health"] },
    ],
    uworld: "UWorld — 40 questions biostat/éthique, mode tutor",
    annotation: "Annoter First Aid (tests diagnostiques, biais)",
    review: "Anki — biochimie et biostats, plus révision cumulative S1–S7",
    reviewTags: [t("^Systems", "Biochem*"), t("^Systems", "Biostats*")],
    extra: [
      {
        id: "w8-nbme",
        stage: "nbme",
        label: "NBME #1 (forme ancienne) — score de référence",
        detail: "En conditions d'examen, puis revue complète des erreurs",
        res: "nbme",
        tags: [],
      },
    ],
  }),
  buildWeek({
    n: 9,
    range: "10–20 %",
    system: "Microbiologie",
    videoRes: "sketchy",
    video: "Sketchy Micro — bactéries, virus, champignons, parasites",
    videoTags: [t("#SketchyMicro", "*")],
    readings: [
      { label: "First Aid — chapitre microbiologie en parallèle des vidéos", tags: [t("#FirstAid", "*Microbiology*")], chapter: "Microbiology", aliases: ["Microbiology"] },
    ],
    uworld: "UWorld — 40 questions microbiologie par système, mode tutor",
    annotation: "Annoter First Aid (tableaux de germes, antibiogrammes)",
    review: "Anki — désuspendre Sketchy Micro au fil des vidéos vues",
    reviewTags: [t("#SketchyMicro", "*")],
  }),
  buildWeek({
    n: 10,
    range: "10–20 %",
    system: "Pharmacologie & bilan NBME #2",
    videoRes: "sketchy",
    video: "Sketchy Pharm — mécanismes et effets indésirables",
    videoTags: [t("#SketchyPharm", "*")],
    readings: [
      { label: "First Aid — chapitre pharmacologie en parallèle des vidéos", tags: [t("#FirstAid", "*Pharmacology*")], chapter: "Pharmacology", aliases: ["Pharmacology"] },
    ],
    uworld: "UWorld — 40 questions pharmacologie par système, mode tutor",
    annotation: "Annoter First Aid (récepteurs, toxicités, antidotes)",
    review: "Anki — désuspendre Sketchy Pharm au fil des vidéos vues",
    reviewTags: [t("#SketchyPharm", "*")],
    extra: [
      {
        id: "w10-nbme",
        stage: "nbme",
        label: "NBME #2 — suivi de progression",
        detail: "En conditions d'examen, à comparer au score de la semaine 8",
        res: "nbme",
        tags: [],
      },
    ],
  }),
  {
    n: 11,
    range: "révision",
    system: "UWorld aléatoire & reprise des erreurs",
    steps: [
      {
        id: "w11-uw1",
        stage: "uworld",
        label: "UWorld — 80 à 100 questions/jour en blocs mixtes aléatoires",
        detail: "Blocs chronométrés, tous systèmes mélangés",
        res: "uworld",
        tags: [],
      },
      {
        id: "w11-uw2",
        stage: "uworld",
        label: "UWorld — reprise des questions ratées et marquées (2ᵉ passage)",
        res: "uworld",
        tags: [],
      },
      {
        id: "w11-annot",
        stage: "annotation",
        label: "Annoter First Aid sur les zones faibles repérées dans les blocs",
        res: null,
        tags: [],
      },
      {
        id: "w11-anki",
        stage: "anki",
        label: "Anki — révision quotidienne complète, toutes matières",
        detail: "Prioriser le tag haut rendement si le retard s'accumule",
        res: "anki",
        tags: [t("^Other", "^HighYield::1-HighYield")],
      },
    ],
  },
  {
    n: 12,
    range: "consolidation",
    system: "Révision finale & bilan NBME #3",
    steps: [
      {
        id: "w12-fa",
        stage: "firstaid",
        label: "First Aid — relecture rapide, en priorité les pages annotées",
        res: null,
        tags: [],
        faChapter: "Rapid_Review",
        docAliases: ["Rapid Review"],
      },
      {
        id: "w12-uw",
        stage: "uworld",
        label: "UWorld — blocs courts sur les zones faibles uniquement",
        res: "uworld",
        tags: [],
      },
      {
        id: "w12-anki",
        stage: "anki",
        label: "Anki — cartes dues seulement, aucune nouvelle carte",
        detail: "Recherche : is:due — ne rien désuspendre de neuf",
        res: "anki",
        tags: [],
      },
      {
        id: "w12-nbme",
        stage: "nbme",
        label: "NBME #3 — 3 à 4 jours avant l'examen",
        res: "nbme",
        tags: [],
      },
      {
        id: "w12-rest",
        stage: "rest",
        label: "Repos — sommeil, aucun nouveau contenu la veille",
        res: null,
        tags: [],
      },
    ],
  },
]

/** Toutes les étapes indexées par identifiant, quel que soit leur emplacement. */
export const STEP_INDEX: Record<string, Step> = Object.fromEntries(
  WEEKS.flatMap((w) => w.steps.map((s) => [s.id, s] as const)),
)

export const TOTAL_STEPS = Object.keys(STEP_INDEX).length

/** Répartition d'origine des étapes par semaine, avant tout glisser-déposer. */
export type Layout = Record<number, string[]>

export const DEFAULT_LAYOUT: Layout = Object.fromEntries(WEEKS.map((w) => [w.n, w.steps.map((s) => s.id)]))

export const NBME_WEEKS = [8, 10, 12]

export const DECK_PREFIXES = ["#AK_Step1_v12", "#AK_Step1_v11"] as const
export type DeckPrefix = (typeof DECK_PREFIXES)[number]

export const ankiSearch = (prefix: string, target: AnkiTarget) => `tag:${prefix}::${target.ns}::${target.pattern}`

/**
 * Remet une disposition enregistrée d'aplomb : on retire les étapes inconnues
 * et on replace celles qui manquent dans leur semaine d'origine.
 */
export function normalizeLayout(raw: unknown): Layout {
  const layout: Layout = {}
  const seen = new Set<string>()
  const source = (raw ?? {}) as Record<string, unknown>

  for (const week of WEEKS) {
    const ids = Array.isArray(source[week.n]) ? (source[week.n] as unknown[]) : []
    layout[week.n] = ids.filter((id): id is string => {
      if (typeof id !== "string" || !STEP_INDEX[id] || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  for (const week of WEEKS) {
    for (const step of week.steps) {
      if (!seen.has(step.id)) {
        layout[week.n].push(step.id)
        seen.add(step.id)
      }
    }
  }

  return layout
}
