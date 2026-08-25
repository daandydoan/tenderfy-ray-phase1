/* ═══════════════════════════════════════════════════════════════════════════
   The tool surface — the whole of Ray's reach into the platform.

   Every capability the spec lists is a tool here, not a separate service:
   document review, question extraction, Response Library creation, content
   generation, conversation recall. That is what makes the service "unified" —
   an edit dialog and the Document Workspace call the same registry with a
   different surface, not different code.

   Schemas are Anthropic tool-use shaped, so the registry can be handed to the
   Messages API verbatim once the mock provider is swapped for the real one.

   Nothing here fetches data directly: every executor receives the caller's
   guard and goes through the repositories, so §4 holds by construction.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const P = () => global.RayPermissions;
  const Repos = () => global.RayPermissions.Repositories;

  /** ctx = { guard, reader, store, conversationId, surface, trace } */
  const TOOLS = [

    /* ── Platform data ─────────────────────────────────────────────────── */
    {
      name: 'list_tenders',
      description: 'List the tenders the current user can access. Use before naming a tender you are not certain exists.',
      scopes: ['tender.read'],
      input_schema: { type: 'object', properties: {}, required: [] },
      run: (ctx) => Repos().tenders.list(ctx.guard)
        .map((t) => ({ id: t.id, name: t.name, ref: t.ref, due: t.due, status: t.status })),
    },
    {
      name: 'get_tender',
      description: 'Full detail for one tender: organisation, dates, status, value.',
      scopes: ['tender.read'],
      input_schema: { type: 'object', properties: { tender_id: { type: 'string' } }, required: ['tender_id'] },
      run: (ctx, i) => Repos().tenders.get(ctx.guard, i.tender_id),
    },
    {
      name: 'list_documents',
      description: 'List documents attached to a tender, with the size/scan metadata Ray uses to choose a reading strategy.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: { tender_id: { type: 'string' } }, required: ['tender_id'] },
      run: (ctx, i) => Repos().documents.list(ctx.guard, i.tender_id)
        .map((d) => ({ id: d.id, name: d.name, pages: d.pages, scanned: d.scanned,
                       textLayer: d.textLayer, classification: d.classification })),
    },

    /* ── Document reading (§3) ─────────────────────────────────────────── */
    {
      name: 'plan_document_review',
      description: 'Choose a reading strategy per document for a set of documents, within a token budget. Always call this before reviewing more than one document.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: {
        document_ids: { type: 'array', items: { type: 'string' } },
        intent: { type: 'string', enum: ['narrow', 'broad'] },
        token_budget: { type: 'number' },
      }, required: ['document_ids'] },
      run: (ctx, i) => {
        const docs = (i.document_ids || []).map((id) => Repos().documents.get(ctx.guard, id));
        return ctx.reader.planSet(docs, i.intent || 'broad', i.token_budget || 6000);
      },
    },
    {
      name: 'outline_document',
      description: 'Cheap first look at a large document: section titles and page ranges, no body text. Use this before read_pages.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: { document_id: { type: 'string' } }, required: ['document_id'] },
      run: (ctx, i) => {
        const r = ctx.reader.outline(ctx.guard, i.document_id);
        return { document: r.doc.name, pages: r.doc.pages, outline: r.outline };
      },
    },
    {
      name: 'read_pages',
      description: 'Read a page range. Uses OCR automatically when the document has no text layer.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: {
        document_id: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' },
      }, required: ['document_id', 'from'] },
      run: (ctx, i) => ctx.reader.readPages(ctx.guard, i.document_id, i.from, i.to || i.from),
    },
    {
      name: 'search_document',
      description: 'Find the passages in one document that match a query, without loading the document. Prefer this when the question is narrow.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: {
        document_id: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' },
      }, required: ['document_id', 'query'] },
      run: (ctx, i) => ctx.reader.search(ctx.guard, i.document_id, i.query, i.limit || 3),
    },
    {
      name: 'read_whole_document',
      description: 'Read a document end to end. Only valid for small text-layer files; falls back to a page range otherwise.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: { document_id: { type: 'string' } }, required: ['document_id'] },
      run: (ctx, i) => ctx.reader.readWhole(ctx.guard, i.document_id),
    },

    /* ── Conversation recall (§2) ──────────────────────────────────────── */
    {
      name: 'search_conversation',
      description: 'Retrieve earlier messages from this conversation that are no longer in context. Use when the user refers to something you cannot see.',
      scopes: ['conversation.read'],
      input_schema: { type: 'object', properties: {
        query: { type: 'string' }, limit: { type: 'number' },
      }, required: ['query'] },
      run: (ctx, i) => ctx.store.search(ctx.guard, ctx.conversationId, i.query, i.limit || 3, ctx.turnSeq)
        .map((m) => ({ seq: m.seq, role: m.role, text: m.text })),
    },

    /* ── Response Library (§1 — was a Document Workspace special case) ──── */
    {
      name: 'search_response_library',
      description: 'Find previously written answers in the business Response Library, to reuse rather than rewrite.',
      scopes: ['response_library.read'],
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      run: (ctx, i) => {
        const words = global.RayDocuments.terms(i.query);
        return Repos().responseLibrary.list(ctx.guard)
          .map((r) => {
            const hay = (r.question + ' ' + r.category + ' ' + r.answer).toLowerCase();
            let score = 0; words.forEach((t) => { if (hay.includes(t)) score += 1; });
            return { r, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((x) => ({ id: x.r.id, question: x.r.question, category: x.r.category,
                         words: x.r.words, winRate: x.r.winRate,
                         excerpt: x.r.answer.slice(0, 180) + '…' }));
      },
    },
    {
      name: 'create_response_entry',
      description: 'Add a question/answer pair to the Response Library. This is the same operation the Document Workspace used to perform on its own.',
      scopes: ['response_library.write'],
      input_schema: { type: 'object', properties: {
        question: { type: 'string' }, answer: { type: 'string' }, category: { type: 'string' },
      }, required: ['question', 'answer'] },
      run: (ctx, i) => Repos().responseLibrary.add(ctx.guard, {
        question: i.question, answer: i.answer, category: i.category || 'Uncategorised',
        words: String(i.answer).split(/\s+/).length, lastUsed: null, winRate: null,
      }),
    },

    /* ── Question extraction (§1 — the other Document Workspace special) ── */
    {
      name: 'extract_questions',
      description: 'Pull the numbered response-schedule questions out of a tender document. Reads only the schedule pages, not the whole file.',
      scopes: ['document.read'],
      input_schema: { type: 'object', properties: {
        document_id: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' },
      }, required: ['document_id'] },
      run: (ctx, i) => {
        const doc = Repos().documents.get(ctx.guard, i.document_id);
        let from = i.from, to = i.to;
        if (!from) {                                  // find the schedule section first
          const outline = ctx.reader.outline(ctx.guard, i.document_id).outline;
          const sec = outline.find((s) => /schedule|question|response/i.test(s.title));
          from = sec ? sec.from : 1;
          to = sec ? sec.to : Math.min(doc.pages, 12);
        }
        const chunks = ctx.reader.readPages(ctx.guard, i.document_id, from, to || from);
        const qs = [];
        chunks.forEach((c) => {
          const m = /^Q(\d+)\.\s*(.+?)(?:\((\d+)\s*words\))?\s*$/.exec(c.text.trim());
          if (m) qs.push({ number: Number(m[1]), question: m[2].trim(),
                           wordLimit: m[3] ? Number(m[3]) : null, page: c.page });
        });
        return { document: doc.name, pagesRead: `${from}–${to || from}`,
                 pagesInDocument: doc.pages, questions: qs };
      },
    },

    /* ── Content generation (§1) ───────────────────────────────────────── */
    {
      name: 'generate_content',
      description: 'Draft or rewrite content for a document, block or edit dialog field, grounded in the sources provided.',
      scopes: [],
      input_schema: { type: 'object', properties: {
        instruction: { type: 'string' }, field: { type: 'string' },
        tone: { type: 'string' }, word_limit: { type: 'number' },
      }, required: ['instruction'] },
      run: (ctx, i) => ({ field: i.field || null, instruction: i.instruction,
                          wordLimit: i.word_limit || null,
                          note: 'drafted by the provider from the grounded sources in context' }),
    },
  ];

  /* ── Registry ──────────────────────────────────────────────────────────
     Ray is a site-wide agent, so capability is bounded by PERMISSION, not by
     which page you happen to be standing on. From the Response Library you can
     still ask about a tender document; from a tender you can still search the
     library. Anything else would make Ray a collection of page widgets again.

     A surface's `primary` list is therefore a hint, not a fence — it orders the
     schemas so the most relevant tools lead, and drives the suggestion chips.
     `restrictTools: true` restores hard scoping for any future surface that
     genuinely needs it (an external-facing embed, say); nothing sets it today.

     A tool the role cannot run is never advertised at all — cheaper, and it
     cannot be coaxed into trying.                                            */
  class ToolRegistry {
    constructor(tools) { this.tools = tools || TOOLS; }

    get(name) { return this.tools.find((t) => t.name === name); }

    forSurface(surface, guard) {
      const primary = (surface && surface.primary) || [];
      const fenced = surface && surface.restrictTools ? primary : null;
      const permitted = this.tools.filter((t) => {
        if (fenced && fenced.indexOf(t.name) === -1) return false;
        return (t.scopes || []).every((s) => guard.scopes.includes(s));
      });
      /* Stable ordering: the surface's own tools first, everything else after. */
      return permitted.sort((a, b) =>
        (primary.indexOf(b.name) >= 0) - (primary.indexOf(a.name) >= 0));
    }

    /** Split for the UI: how many tools are relevant here vs reachable at all. */
    countsFor(surface, guard) {
      const all = this.forSurface(surface, guard);
      const primary = (surface && surface.primary) || [];
      return { total: all.length, primary: all.filter((t) => primary.indexOf(t.name) >= 0).length };
    }

    /** What gets sent to the model — schemas only, no executors. */
    schemas(surface, guard) {
      return this.forSurface(surface, guard)
        .map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
    }

    /** Single choke point for execution. Denials come back as data, not
     *  exceptions, so the loop can hand them to the model to explain. */
    execute(ctx, name, input) {
      const tool = this.get(name);
      const started = Date.now();
      if (!tool) {
        return { ok: false, error: 'unknown_tool', message: `No tool named "${name}".` };
      }
      const advertised = this.forSurface(ctx.surface, ctx.guard).some((t) => t.name === name);
      if (!advertised) {
        return { ok: false, error: 'not_available',
                 message: `"${name}" is not available to ${ctx.guard.user.role}.` };
      }
      try {
        const result = tool.run(ctx, input || {});
        return { ok: true, tool: name, input, result, ms: Date.now() - started };
      } catch (err) {
        if (err instanceof P().PermissionError) {
          return { ok: false, tool: name, input, error: 'permission_denied',
                   action: err.action, resource: err.resource, message: err.reason,
                   ms: Date.now() - started };
        }
        return { ok: false, tool: name, input, error: 'tool_error', message: err.message };
      }
    }
  }

  global.RayTools = { ToolRegistry, TOOLS };
})(window);
