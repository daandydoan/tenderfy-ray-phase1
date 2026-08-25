/* ═══════════════════════════════════════════════════════════════════════════
   §3 — File reading & document processing. Replaces the Vertex AI dependency.

   One reader, four strategies, chosen from metadata the platform already holds
   at upload time (page count, byte size, text layer present, scanned flag).
   Nothing is loaded until a tool asks for it, and nothing whole is loaded when
   a slice will do.

     WholeFile  small + text layer          → one pass, cached
     Paged      large + text layer          → outline first, then page ranges
     Ocr        scanned / no text layer     → per-page OCR, cached per page
     Lazy       anything, when the question is narrow → search → snippets only

   Every chunk carries provenance (docId, page) so the answer can cite, and the
   panel can show which pages were actually opened.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const CHARS_PER_TOKEN = 4;            // rough, but stable enough to budget on
  const CHARS_PER_PAGE = 2400;          // an A4 page of tender prose, measured
  const TOKENS_PER_PAGE = CHARS_PER_PAGE / CHARS_PER_TOKEN;   // ≈600
  const WHOLE_FILE_TOKEN_LIMIT = 12000; // ≈20 pages — above this, never load whole
  const est = (s) => Math.ceil((s || '').length / CHARS_PER_TOKEN);

  /* Words that match everything and therefore mean nothing to a lexical
     search. Keeps citations honest. */
  const STOPWORDS = new Set(['this','that','with','from','have','been','they','them',
    'what','when','which','were','your','yours','about','into','also','than','then',
    'there','their','would','could','should','does','doing','answer','question',
    'draft','write','tell','show','give','please','tender','tenders']);
  const terms = (q) => String(q).toLowerCase().split(/\W+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));

  /* ── Chunk ─────────────────────────────────────────────────────────────── */
  function chunk(doc, page, text, via) {
    return { docId: doc.id, docName: doc.name, page, text, via, tokens: est(text) };
  }

  /* ── Strategies ─────────────────────────────────────────────────────────
     Each exposes: id, label, applies(doc), and the reads it supports.      */

  const WholeFile = {
    id: 'whole', label: 'Whole file',
    reason: 'small enough to hold in context in one pass',
    applies: (doc) => doc.textLayer && !doc.scanned
      && doc.pages * TOKENS_PER_PAGE < WHOLE_FILE_TOKEN_LIMIT,
    read(repo, guard, doc) {
      const out = [];
      for (let p = 1; p <= doc.pages; p++) {
        out.push(chunk(doc, p, repo.pageText(guard, doc.id, p), 'whole'));
      }
      return out;
    },
  };

  const Paged = {
    id: 'paged', label: 'Page-by-page',
    reason: 'large document — read the outline, then only the pages that matter',
    applies: (doc) => doc.textLayer && !doc.scanned,
    /** The cheap first move: an outline, not content. Costs ~100 tokens for a
     *  200-page RFT and tells the model where to look next. */
    index(doc) {
      if (doc.outline) return doc.outline;
      const span = Math.max(1, Math.ceil(doc.pages / 6));
      const out = [];
      for (let p = 1; p <= doc.pages; p += span) {
        out.push({ from: p, to: Math.min(doc.pages, p + span - 1), title: `Pages ${p}–${Math.min(doc.pages, p + span - 1)}` });
      }
      return out;
    },
    read(repo, guard, doc, opts) {
      const from = Math.max(1, opts.from || 1);
      const to = Math.min(doc.pages, opts.to || from);
      const out = [];
      for (let p = from; p <= to; p++) {
        out.push(chunk(doc, p, repo.pageText(guard, doc.id, p), 'paged'));
      }
      return out;
    },
  };

  const Ocr = {
    id: 'ocr', label: 'OCR',
    reason: 'no text layer — pages are rasterised, so each one is OCR’d on demand and cached',
    applies: (doc) => doc.scanned || !doc.textLayer,
    cache: new Map(),
    read(repo, guard, doc, opts) {
      const from = Math.max(1, opts.from || 1);
      const to = Math.min(doc.pages, opts.to || from);
      const out = [];
      for (let p = from; p <= to; p++) {
        const key = `${doc.id}:${p}`;
        let text = this.cache.get(key);
        const cached = text !== undefined;
        if (!cached) {
          text = repo.pageText(guard, doc.id, p);
          if (!/^\[OCR\]/.test(text)) text = `[OCR] ${text}`;
          this.cache.set(key, text);
        }
        const c = chunk(doc, p, text, cached ? 'ocr-cached' : 'ocr');
        c.ocrCost = cached ? 0 : 1;      // surfaced in the trace — OCR is not free
        out.push(c);
      }
      return out;
    },
  };

  const Lazy = {
    id: 'lazy', label: 'On-demand search',
    reason: 'the question is narrow — find the passages, skip the rest of the file',
    applies: () => true,
    /** Lexical for the prototype. In production this is the retrieval index
     *  that replaces Vertex's embedding calls; the interface is identical. */
    search(repo, guard, doc, query, limit) {
      const words = terms(query);
      const hits = [];
      for (let p = 1; p <= doc.pages; p++) {
        const text = repo.pageText(guard, doc.id, p);
        /* A page with no indexed text cannot match a search. It still carries
           the document's name in its placeholder, and without this a freshly
           uploaded file "matches" any query that echoes its filename — and
           then gets cited as though it said something. */
        if (/^\[p\.\d+ of /.test(text)) continue;
        const low = text.toLowerCase();
        let score = 0;
        words.forEach((t) => { if (low.includes(t)) score += 1; });
        if (score > 0) hits.push({ page: p, score, text });
      }
      return hits.sort((a, b) => b.score - a.score)
        .slice(0, limit || 4)
        .map((h) => chunk(doc, h.page, h.text, 'lazy'));
    },
  };

  const STRATEGIES = [WholeFile, Paged, Ocr, Lazy];

  /* ── Reader ─────────────────────────────────────────────────────────────
     `plan` is deliberately separate from `read` so a multi-document review can
     show its plan (and its estimated cost) before spending anything.        */
  class DocumentReader {
    constructor(repo) { this.repo = repo; }

    /** Route one document. `intent` is 'narrow' (a specific fact) or 'broad'
     *  (review / summarise the whole thing). */
    plan(doc, intent) {
      let strategy;
      if (intent === 'narrow') strategy = Ocr.applies(doc) && doc.scanned ? Ocr : Lazy;
      else if (Ocr.applies(doc)) strategy = Ocr;
      else if (WholeFile.applies(doc)) strategy = WholeFile;
      else strategy = Paged;

      const estTokens = strategy === WholeFile ? Math.ceil(doc.pages * TOKENS_PER_PAGE)
        : strategy === Lazy ? 900
        : strategy === Paged ? 1200          // outline + a handful of pages
        : Math.ceil(Math.min(doc.pages, 8) * TOKENS_PER_PAGE);   // OCR, capped

      return {
        docId: doc.id, docName: doc.name, pages: doc.pages,
        strategy: strategy.id, label: strategy.label, reason: strategy.reason,
        estTokens,
      };
    }

    /** Plan a whole set at once, with a shared budget. Documents are ordered
     *  cheapest-first so a budget overrun degrades the least useful reads. */
    planSet(docs, intent, tokenBudget) {
      const plans = docs.map((d) => this.plan(d, intent))
        .sort((a, b) => a.estTokens - b.estTokens);
      let spent = 0;
      plans.forEach((p) => {
        spent += p.estTokens;
        if (tokenBudget && spent > tokenBudget) {
          p.deferred = true;                       // read later, on demand only
          p.note = 'over budget for this turn — Ray will fetch it if the answer needs it';
        }
      });
      return { plans, estTotal: spent, budget: tokenBudget || null };
    }

    strategy(id) { return STRATEGIES.find((s) => s.id === id) || Lazy; }

    outline(guard, docId) {
      const doc = this.repo.get(guard, docId);
      return { doc, outline: Paged.index(doc) };
    }

    readPages(guard, docId, from, to) {
      const doc = this.repo.get(guard, docId);
      const s = doc.scanned || !doc.textLayer ? Ocr : Paged;
      return s.read(this.repo, guard, doc, { from, to });
    }

    readWhole(guard, docId) {
      const doc = this.repo.get(guard, docId);
      if (!WholeFile.applies(doc)) {
        return Paged.read(this.repo, guard, doc, { from: 1, to: Math.min(doc.pages, 6) });
      }
      return WholeFile.read(this.repo, guard, doc);
    }

    search(guard, docId, query, limit) {
      const doc = this.repo.get(guard, docId);
      return Lazy.search(this.repo, guard, doc, query, limit);
    }
  }

  global.RayDocuments = { DocumentReader, STRATEGIES, est, terms, CHARS_PER_TOKEN, TOKENS_PER_PAGE };
})(window);
