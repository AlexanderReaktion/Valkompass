/**
 * Retrieval över partidokument (partiprogram, motioner, voteringsmotiveringar).
 *
 * LexicalRetriever (tf-idf) kräver inget embeddings-API och är körbar direkt.
 * Gränssnittet Retriever låter oss byta till pgvector + embeddings senare utan
 * att röra förslagslogiken. Belägg (SourceRef) följer med varje träff så att
 * partipositioner alltid blir källbelagda.
 */

import type { SourceRef } from "../catalog/types.ts";

export interface CorpusDoc {
  readonly id: string;
  readonly partyId?: string;
  readonly text: string;
  readonly source: SourceRef;
}

export interface RetrievedChunk {
  readonly doc: CorpusDoc;
  readonly score: number;
}

export interface Retriever {
  retrieve(query: string, k: number, partyId?: string): Promise<RetrievedChunk[]>;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export class LexicalRetriever implements Retriever {
  private docs: CorpusDoc[];
  private tokens: Map<string, string[]> = new Map();
  private idf: Map<string, number> = new Map();

  constructor(docs: readonly CorpusDoc[]) {
    this.docs = [...docs];
    const df = new Map<string, number>();
    for (const d of this.docs) {
      const toks = tokenize(d.text);
      this.tokens.set(d.id, toks);
      for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const n = this.docs.length || 1;
    for (const [t, c] of df) this.idf.set(t, Math.log(1 + n / c));
  }

  async retrieve(query: string, k: number, partyId?: string): Promise<RetrievedChunk[]> {
    const qTerms = [...new Set(tokenize(query))];
    if (qTerms.length === 0) return [];
    const scored: RetrievedChunk[] = [];
    for (const d of this.docs) {
      if (partyId && d.partyId !== partyId) continue;
      const toks = this.tokens.get(d.id) ?? [];
      let score = 0;
      for (const term of qTerms) {
        const tf = toks.reduce((n, t) => (t === term ? n + 1 : n), 0);
        if (tf > 0) score += tf * (this.idf.get(term) ?? 0);
      }
      if (score > 0) scored.push({ doc: d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
