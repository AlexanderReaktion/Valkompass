/**
 * Frågekatalogens affärslogik: skapa/godkänn/arkivera, validera och publicera.
 *
 * Designval:
 *  - Tidsstämplar injiceras (parametern `now`) — ren, deterministisk, testbar kod.
 *  - Godkännande kräver motivering (rationale) och spårbart belägg (citations).
 *  - Publicering är en fryst, versionerad ögonblicksbild — endast godkända frågor.
 *  - Partiledtråds-lint + balanskontroller körs som varningar för granskaren.
 */

import type { Polarity, Question, Scale } from "../matching/types.ts";
import type {
  CatalogQuestion,
  PartyPosition,
  PublishedCatalog,
  SourceRef,
  ValidationResult,
} from "./types.ts";

// ---------- skapa & livscykel ----------

export interface NewQuestionInput {
  readonly id: string;
  readonly kind: CatalogQuestion["kind"];
  readonly text: string;
  readonly topic: string;
  readonly dimension?: CatalogQuestion["dimension"];
  readonly polarity?: Polarity; // default 1
  readonly rationale?: string;
  readonly sources?: readonly SourceRef[];
}

export function createQuestion(input: NewQuestionInput, now: string): CatalogQuestion {
  if (!input.text.trim()) throw new Error("Frågetext får inte vara tom.");
  return {
    id: input.id,
    kind: input.kind,
    text: input.text,
    ...(input.dimension ? { dimension: input.dimension } : {}),
    polarity: input.polarity ?? 1,
    topic: input.topic,
    status: "draft",
    ...(input.rationale ? { rationale: input.rationale } : {}),
    sources: input.sources ?? [],
    createdAt: now,
  };
}

export function approveQuestion(q: CatalogQuestion, approver: string, now: string): CatalogQuestion {
  if (q.status === "archived") throw new Error(`Kan inte godkänna arkiverad fråga: ${q.id}`);
  if (!q.text.trim()) throw new Error(`Fråga ${q.id} saknar text.`);
  if (!q.rationale?.trim()) {
    throw new Error(`Fråga ${q.id} saknar motivering (rationale), som krävs för godkännande.`);
  }
  return { ...q, status: "approved", approvedBy: approver, approvedAt: now };
}

export function archiveQuestion(q: CatalogQuestion): CatalogQuestion {
  return { ...q, status: "archived" };
}

export function approvePosition(p: PartyPosition, approver: string, now: string): PartyPosition {
  if (p.status === "archived") throw new Error(`Kan inte godkänna arkiverad position: ${p.questionId}/${p.partyId}`);
  if (p.citations.length === 0) {
    throw new Error(
      `Position ${p.questionId}/${p.partyId} saknar belägg (citations); varje partiposition måste vara källbelagd.`,
    );
  }
  return { ...p, status: "approved", approvedBy: approver, approvedAt: now };
}

// ---------- partiledtråds-lint ----------

/**
 * Startlexikon över slogans, värdeord och avsändarsignaler att undvika.
 * Data, inte hårdkodad lag — utöka/justera fritt. Advisory (substring, gemener).
 */
export const DEFAULT_CUE_LEXICON: readonly string[] = [
  "arbetslinjen",
  "vinster i välfärden",
  "krafttag",
  "ordning och reda",
  "verkningsfull",
  "systemskifte",
  "rättvis",
  "ansvarsfull",
  "trygg",
  "äntligen",
  "dags att",
  "modig",
  "sunt förnuft",
  "tidö",
  "rödgrön",
  "regeringens politik",
  "socialdemokraterna",
  "moderaterna",
  "sverigedemokraterna",
  "vänsterpartiet",
  "centerpartiet",
  "kristdemokraterna",
  "liberalerna",
  "miljöpartiet",
];

/** Returnerar de lexikontermer som förekommer i texten (advisory flaggning). */
export function lintQuestionText(
  text: string,
  lexicon: readonly string[] = DEFAULT_CUE_LEXICON,
): string[] {
  const hay = text.toLowerCase();
  return lexicon.filter((term) => hay.includes(term.toLowerCase()));
}

// ---------- diskrimineringsgrad ----------

/**
 * Under denna grad särskiljer frågan partierna så dåligt att den mest tillför
 * brus i matchningen (VAA-litteraturens diskrimineringskriterium).
 */
export const LOW_DISCRIMINATION_THRESHOLD = 0.25;

export interface DiscriminationEntry {
  readonly questionId: string;
  /** Antal partier med position på frågan. */
  readonly partyCount: number;
  /** Normerad standardavvikelse i [0,1]: 0 = alla partier lika, 1 = maximal polarisering. */
  readonly degree: number | null;
  /** Normerat max–min-avstånd i [0,1]. */
  readonly spread: number | null;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Diskrimineringsgrad per fråga: hur mycket partipositionerna sprider sig.
 * degree = std / halva skalbredden (0 = identiska positioner, 1 = hälften på
 * vardera ytterläge). null när färre än två partier har position.
 */
export function discriminationByQuestion(
  questions: readonly CatalogQuestion[],
  positions: readonly PartyPosition[],
  scale: Scale,
): DiscriminationEntry[] {
  const byQuestion = new Map<string, number[]>();
  for (const p of positions) {
    const arr = byQuestion.get(p.questionId) ?? [];
    arr.push(Math.min(scale.max, Math.max(scale.min, p.value)));
    byQuestion.set(p.questionId, arr);
  }
  const range = scale.max - scale.min;
  const halfRange = range / 2;
  return questions.map((q) => {
    const values = byQuestion.get(q.id) ?? [];
    if (values.length < 2) {
      return { questionId: q.id, partyCount: values.length, degree: null, spread: null };
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return {
      questionId: q.id,
      partyCount: values.length,
      degree: round3(Math.sqrt(variance) / halfRange),
      spread: round3((Math.max(...values) - Math.min(...values)) / range),
    };
  });
}

// ---------- validering inför publicering ----------

export interface ValidateInput {
  readonly questions: readonly CatalogQuestion[];
  readonly parties: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly positions: readonly PartyPosition[];
  readonly scale: Scale;
  readonly lexicon?: readonly string[];
  /** Minsta antal frågor innan en varning ges. Default 10. */
  readonly minQuestions?: number;
}

export function validateForPublish(input: ValidateInput): ValidationResult {
  const { questions, parties, positions, scale } = input;
  const minQuestions = input.minQuestions ?? 10;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(scale.max > scale.min)) errors.push(`Ogiltig skala: max (${scale.max}) måste vara > min (${scale.min}).`);
  if (questions.length === 0) errors.push("Katalogen innehåller inga frågor.");

  // positionsuppslag: questionId::partyId → position
  const posByKey = new Map<string, PartyPosition>();
  for (const p of positions) posByKey.set(`${p.questionId}::${p.partyId}`, p);

  for (const q of questions) {
    if (q.status !== "approved") errors.push(`Fråga ${q.id} är inte godkänd (status: ${q.status}).`);
    if (!q.text.trim()) errors.push(`Fråga ${q.id} saknar text.`);
    if (!q.rationale?.trim()) errors.push(`Fråga ${q.id} saknar motivering.`);

    // varje parti måste ha en godkänd, källbelagd position på frågan
    for (const party of parties) {
      const pos = posByKey.get(`${q.id}::${party.id}`);
      if (!pos) {
        errors.push(`Position saknas: fråga ${q.id}, parti ${party.id}.`);
      } else {
        if (pos.status !== "approved") errors.push(`Position ${q.id}/${party.id} är inte godkänd.`);
        if (pos.citations.length === 0) errors.push(`Position ${q.id}/${party.id} saknar belägg.`);
        if (pos.value < scale.min || pos.value > scale.max) {
          warnings.push(`Position ${q.id}/${party.id} (${pos.value}) ligger utanför skalan.`);
        }
      }
    }

    // partiledtråds-lint
    const hits = lintQuestionText(q.text, input.lexicon);
    if (hits.length > 0) warnings.push(`Fråga ${q.id} kan avslöja partiledtråd: ${hits.join(", ")}.`);
  }

  // diskrimineringskriterium — frågor där partierna knappt skiljer sig tillför mest brus
  for (const d of discriminationByQuestion(questions, positions, scale)) {
    if (d.degree !== null && d.degree < LOW_DISCRIMINATION_THRESHOLD) {
      warnings.push(
        `Fråga ${d.questionId} har låg diskrimineringsgrad (${d.degree}): partierna skiljer sig knappt. Skärp formuleringen eller stryk frågan.`,
      );
    }
  }

  // polaritetsbalans — "instämmer" ska inte konsekvent peka åt samma håll
  if (questions.length >= 2) {
    const allSame = questions.every((q) => q.polarity === questions[0]!.polarity);
    if (allSame) warnings.push("Alla frågor har samma polaritet – variera för att dämpa ja-sägartendens.");
  }

  // polaritetsbalans per dimension — även inom en axel ska hållen variera
  const byDim = new Map<string, CatalogQuestion[]>();
  for (const q of questions) {
    const key = q.dimension ?? "utan axel";
    const arr = byDim.get(key) ?? [];
    arr.push(q);
    byDim.set(key, arr);
  }
  for (const [dim, qs] of byDim) {
    if (qs.length < 5) continue;
    const positive = qs.filter((q) => q.polarity === 1).length;
    const dominant = Math.max(positive, qs.length - positive);
    if (dominant / qs.length > 0.75) {
      warnings.push(
        `Polaritetsbalans (${dim}): ${dominant} av ${qs.length} frågor pekar åt samma håll – variera för att dämpa ja-sägartendens.`,
      );
    }
  }

  // dimensionsbalans — båda strukturella axlarna bör finnas representerade
  const dims = new Set(questions.map((q) => q.dimension).filter(Boolean));
  if (!dims.has("economic") || !dims.has("galtan")) {
    warnings.push("Båda axlarna (economic + galtan) bör vara representerade för en rättvis 2D-karta.");
  }

  if (questions.length > 0 && questions.length < minQuestions) {
    warnings.push(`Endast ${questions.length} frågor (rekommenderat minst ${minQuestions}).`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ---------- publicering ----------

export interface PublishInput extends ValidateInput {
  readonly version: number;
  readonly election: string;
}

/** Validerar och fryser en katalog. Kastar fel om valideringen har errors. */
export function publishCatalog(input: PublishInput, now: string): PublishedCatalog {
  const result = validateForPublish(input);
  if (!result.ok) {
    throw new Error(`Kan inte publicera katalog:\n- ${result.errors.join("\n- ")}`);
  }
  return {
    version: input.version,
    election: input.election,
    publishedAt: now,
    scale: input.scale,
    questions: Object.freeze([...input.questions]),
  };
}

/** Strippar en publicerad katalog till matchningsmotorns frågeform. */
export function toMatchingQuestions(catalog: PublishedCatalog): Question[] {
  return catalog.questions.map((q) => {
    const base: Question = q.dimension
      ? { id: q.id, polarity: q.polarity, dimension: q.dimension }
      : { id: q.id, polarity: q.polarity };
    return base;
  });
}
