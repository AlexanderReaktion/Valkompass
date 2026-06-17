/**
 * Domäntyper för den deterministiska matchningsmotorn.
 *
 * Skalan är generisk (t.ex. -2..+2). Både användarens svar och partiernas
 * (expertgranskade) positioner uttrycks på SAMMA skala per fråga.
 *
 * Antagande: partipositioner och frågor är redan "av-polariserade" uppströms
 * (högre värde = mer höger / mer TAN konsekvent), så motorn behöver inte
 * känna till frågeformuleringens polaritet.
 */

export interface Scale {
  readonly min: number;
  readonly max: number;
}

/** Strukturella axlar för 2D-kartan. Utbyggbart. */
export type Dimension = "economic" | "galtan";

export type MatchMethod = "cityblock" | "euclidean" | "directional" | "hybrid";

/**
 * Visningspolaritet för frågans formulering relativt den kanoniska skalan.
 *   1 = att instämma pekar åt samma håll som kanoniska skalan (högre = mer höger/TAN).
 *  -1 = omvänt formulerat påstående; användarens svar speglas kring mitten vid intag.
 * Att variera polariteten mellan frågor bryter både partiledtråd och ja-sägartendens.
 */
export type Polarity = 1 | -1;

export interface Question {
  readonly id: string;
  /** Vilken axel frågan laddar på (för 2D-kartan). Saknas = ingen kartaxel. */
  readonly dimension?: Dimension;
  /** Visningspolaritet (default 1). Hanteras vid intag; motorn arbetar alltid kanoniskt. */
  readonly polarity?: Polarity;
}

export interface Party {
  readonly id: string;
  readonly name: string;
  /** Godkänd position per questionId, på samma Scale som användarsvaren. */
  readonly positions: Readonly<Record<string, number>>;
}

export interface UserAnswer {
  /** null = "vet ej"/obesvarad → exkluderas parvis (tolkas ALDRIG som mitten). */
  readonly value: number | null;
  /** Vikt (default 1). T.ex. 2 = viktig, 0.5 = mindre viktig. <= 0 exkluderar frågan. */
  readonly weight?: number;
}

/** Användarens svar, nycklat på questionId. */
export type UserAnswers = Readonly<Record<string, UserAnswer>>;

export interface QuestionBreakdown {
  readonly questionId: string;
  readonly userValue: number;
  readonly partyValue: number;
  /** Absolut avstånd på skalan. */
  readonly distance: number;
  /** Intuitiv per-fråga-överensstämmelse i [0,1] (1 - distance/range). */
  readonly agreement: number;
  readonly weight: number;
}

export interface PartyMatch {
  readonly partyId: string;
  readonly partyName: string;
  readonly method: MatchMethod;
  /** 0–100, eller null när inga gemensamt besvarade frågor finns. */
  readonly percent: number | null;
  /** Antal frågor som faktiskt bidrog till matchningen. */
  readonly answeredCount: number;
  readonly breakdown: readonly QuestionBreakdown[];
}

export interface RankedResult {
  readonly method: MatchMethod;
  /** Sorterad fallande på percent; null-percent (otillräckligt underlag) sist. */
  readonly matches: readonly PartyMatch[];
  /** Procentenheters gap mellan #1 och #2, null om < 2 rankade. */
  readonly topGap: number | null;
  /** true när #1 och #2 ligger inom closeThreshold → "för jämnt för att säkert skilja". */
  readonly isClose: boolean;
}

/** Användarens/partiets position per axel, normerad till [-1, 1]. null = inga svar på axeln. */
export type Coordinates = Readonly<Partial<Record<Dimension, number | null>>>;
