/* ═══════════════════════════════════════════════════════════════════════════
   RayService — the single entry point. Everything else in the platform calls
   this and nothing else.

       const ray = new RayService({ provider });
       ray.setUser(currentUser);
       const session = ray.session('tender', { tenderId: 't-envind' });
       await session.send('Review all documents for this tender');

   One agentic loop serves every surface:

       assemble context (§2)
         → provider proposes tool calls
         → registry executes them through the guard (§4)
         → results go back to the provider
         → repeat until it stops asking
         → persist the turn

   The loop emits a trace of every step. That trace is not decoration: it is
   how a reviewer confirms that no unauthorised row was fetched and that a
   148-page document was not sent wholesale.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const SYSTEM_PROMPT = [
    'You are Ray, the Tenderfy Co-Pilot for construction and trades tendering in Australia.',
    'You are a site-wide assistant, not a page widget: one continuous conversation follows the user across the platform.',
    'The context card tells you which page they are on now. Treat it as where their attention is, not as a limit on what you may look at — you can reach any tender, document or library entry their permissions allow, from anywhere.',
    'Answer from the platform\'s own data. Use tools to fetch what you need; never guess a clause, date or figure.',
    'Read as little as will do: search or outline before reading pages, and never load a whole document when a section answers the question.',
    'Cite the document and page for every fact you take from a file.',
    'If a tool returns permission_denied, tell the user plainly that the item is outside their access and continue with what you can see. Never speculate about the contents.',
    'When an addendum conflicts with a base document, the addendum governs — say so.',
  ].join(' ');

  const MAX_STEPS = 6;

  class RaySession {
    constructor(service, surfaceId, contextData, conversationId) {
      this.service = service;
      this.surface = global.RaySurfaces.resolve(surfaceId);
      this.contextData = contextData || {};
      this.conversationId = conversationId || `${surfaceId}:${contextData && contextData.tenderId || 'global'}`;
      this.listeners = [];
    }

    on(fn) { this.listeners.push(fn); return this; }
    emit(ev) { this.listeners.forEach((fn) => fn(ev)); }

    /** Navigation changes where the user is looking; it does not start a new
     *  conversation. Only the context card differs on the next turn. */
    setFocus(surfaceId, contextData) {
      this.surface = global.RaySurfaces.resolve(surfaceId);
      this.surfaceId = surfaceId;
      this.contextData = contextData || {};
      this.contextOff = false;      // new page, new offer of context
      return this;
    }

    /** The card the surface contributes, hydrated with data the *guard* let
     *  us read — so the card itself can never leak an unauthorised row. */
    buildCard() {
      const g = this.service.guard;
      const Repos = global.RayPermissions.Repositories;
      const d = Object.assign({}, this.contextData);
      try {
        if (d.tenderId) d.tender = Repos.tenders.get(g, d.tenderId);
      } catch (e) { d.tender = null; d.tenderDenied = true; }
      try {
        if (d.tenderId) {
          const docs = Repos.documents.list(g, d.tenderId);
          d.documentCount = docs.length;
          if (!d.documents) d.documents = docs;
        }
        if (this.surface.id === 'response-library') {
          d.entryCount = Repos.responseLibrary.list(g).length;
        }
      } catch (e) { /* scope missing — the card simply says less */ }
      const site = [
        `USER: ${g.user.name} · ROLE: ${g.user.role}`,
        `IN SCOPE: ${tenderNames(g)}`,
      ].join('\n');
      /* The user can dismiss the page reference — the agent then answers as a
         general question instead of assuming the open tender. Its reach is
         unchanged; it simply stops being told where to look first. */
      /* Anything the user attached to this turn is named in the card, so Ray
         reaches for it first instead of searching the whole tender. */
      const atts = (this.contextData.attachments || [])
        .map((a) => `${a.name} (${a.id})`).join('; ');
      const attLine = atts ? `\nATTACHED BY THE USER, READ THESE FIRST: ${atts}` : '';

      if (this.contextOff) {
        return site + '\nPAGE CONTEXT: withheld by the user — do not assume '
          + 'the open tender or document; ask which one they mean if it matters.'
          + attLine;
      }
      return site + '\n' + this.surface.card(d) + attLine;
    }

    history() {
      return this.service.store.load(this.service.guard, this.conversationId).messages;
    }

    /** Seed a conversation without running the model — used to demonstrate
     *  retrieval against history that is too old to be in context. */
    seed(messages) {
      const g = this.service.guard;
      this.service.store.ensure(g, this.conversationId);
      messages.forEach((m) => this.service.store.append(g, this.conversationId, m));
      return this;
    }

    async send(userText) {
      const svc = this.service;
      const guard = svc.guard;
      const trace = [];
      const t0 = Date.now();

      const turn = svc.store.append(guard, this.conversationId, {
        role: 'user', text: userText,
        attachments: (this.contextData.attachments || []).slice(),
      });

      /* ── §2: assemble, don't accumulate ──────────────────────────────── */
      const card = this.buildCard();
      const ctx = svc.assembler.assemble(guard, this.conversationId, card, SYSTEM_PROMPT);
      trace.push({ kind: 'context', parts: ctx.parts, used: ctx.used, budget: ctx.budget,
                   withheld: ctx.withheld, withheldTokens: ctx.withheldTokens,
                   naiveTokens: ctx.naiveTokens });
      this.emit({ type: 'context', data: trace[0] });

      /* ── The loop ────────────────────────────────────────────────────── */
      const toolCtx = {
        guard, reader: svc.reader, store: svc.store,
        conversationId: this.conversationId, surface: this.surface, trace,
        turnSeq: turn.seq,          // retrieval looks strictly before this turn
      };
      const tools = svc.registry.schemas(this.surface, guard);
      const messages = [{ role: 'user', content: userText }];
      const req = {
        system: ctx.parts.map((p) => p.text).join('\n\n'),
        messages, tools, surface: Object.assign({}, this.contextData, {
          intentHint: this.surface.intentHint,
        }),
        attachments: this.contextData.attachments || [],
        userMessage: userText, toolResults: [], scratch: {},
        estimatedInputTokens: ctx.used,
      };

      let final = null;
      let usedTokens = ctx.used;

      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await svc.provider.createMessage(req);
        usedTokens += (res.usage && res.usage.output_tokens) || 0;

        if (res.stop_reason !== 'tool_use') {
          final = res.content.map((c) => c.text).join('\n');
          break;
        }

        const calls = res.content.filter((c) => c.type === 'tool_use');
        this.emit({ type: 'thinking', data: { calls: calls.map((c) => c.name) } });

        const results = calls.map((call) => {
          const out = svc.registry.execute(toolCtx, call.name, call.input);
          const entry = {
            kind: 'tool', name: call.name, input: call.input,
            ok: out.ok, error: out.error, message: out.message,
            summary: summarise(call.name, out),
            tokens: out.ok ? global.RayContext.est(JSON.stringify(out.result)) : 12,
            ms: out.ms || 0,
          };
          trace.push(entry);
          this.emit({ type: 'tool', data: entry });
          usedTokens += entry.tokens;
          out.tool = call.name;
          return out;
        });

        req.toolResults = req.toolResults.concat(results);
        messages.push({ role: 'assistant', content: res.content });
        messages.push({
          role: 'user',
          content: calls.map((call, i) => ({
            type: 'tool_result', tool_use_id: call.id,
            content: JSON.stringify(results[i].ok ? results[i].result
              : { error: results[i].error, message: results[i].message }),
            is_error: !results[i].ok,
          })),
        });
      }

      if (final == null) final = 'I ran out of steps on that one — try narrowing the question.';

      /* The steps are persisted with the answer. Without this a reloaded
         conversation loses every "Thought for…" block, and the record of how
         Ray reached an answer is exactly the part worth keeping. */
      svc.store.append(guard, this.conversationId, {
        role: 'assistant', text: final, ms: Date.now() - t0,
        steps: trace.filter((t) => t.kind === 'tool')
          .map((t) => ({ name: t.name, summary: t.summary || t.message, ok: t.ok })),
      });

      /* Keep the thread registry honest: recency drives tab order, and an
         untitled thread takes its name from what was first asked in it. */
      if (this.threadId) {
        const first = svc.store.load(guard, this.conversationId)
          .messages.find((m) => m.role === 'user');
        svc.threadIndex.touch(guard.user.id, this.threadId,
          first && first.text, Date.now(), final);
      }

      this.contextData.attachments = [];
      svc.chargeTurn(usedTokens);

      const summary = {
        text: final, trace,
        tokens: usedTokens, naiveTokens: ctx.naiveTokens + usedTokens - ctx.used,
        ms: Date.now() - t0,
        toolCalls: trace.filter((t) => t.kind === 'tool').length,
        denials: trace.filter((t) => t.error === 'permission_denied'
                                  || t.error === 'not_available').length,
      };
      this.emit({ type: 'final', data: summary });
      return summary;
    }
  }

  /** The standing "what can I reach" line. Cheap (a few dozen tokens) and it
   *  stops Ray asking which tenders exist on every other turn. */
  function tenderNames(guard) {
    try {
      const ts = global.RayPermissions.Repositories.tenders.list(guard);
      return ts.length ? ts.map((t) => `${t.name} (${t.id})`).join('; ') : 'no tenders';
    } catch (e) { return 'not permitted to list tenders'; }
  }

  /** One-line human summary per tool result — what the trace panel shows. */
  function summarise(name, out) {
    if (!out.ok) return out.message;
    const r = out.result;
    switch (name) {
      case 'list_tenders':   return `${r.length} tender${r.length === 1 ? '' : 's'} in scope`;
      case 'list_documents': return `${r.length} document${r.length === 1 ? '' : 's'} readable`;
      case 'get_tender':     return `${r.name} · due ${r.due}`;
      case 'plan_document_review':
        return r.plans.map((p) => `${p.docName.split(' —')[0]} → ${p.label}`).join(', ')
             + ` (~${r.estTotal} tokens vs ${r.plans.reduce((n, p) => n + p.pages, 0)} pages)`;
      case 'outline_document': return `${r.outline.length} sections, ${r.pages} pages — no body text read`;
      case 'read_pages':     return `${r.length} page${r.length === 1 ? '' : 's'} of ${r[0] ? r[0].docName : '?'}`
             + (r.some((c) => /ocr/.test(c.via)) ? ' via OCR' : '');
      case 'read_whole_document': return `${r.length} pages (small file, one pass)`;
      case 'search_document': return r.length ? `${r.length} match${r.length === 1 ? '' : 'es'}: p.${r.map((c) => c.page).join(', p.')}` : 'no matches';
      case 'search_conversation': return r.length ? `${r.length} earlier message${r.length === 1 ? '' : 's'} retrieved from storage` : 'nothing found in history';
      case 'search_response_library': return r.length ? `${r.length} reusable answer${r.length === 1 ? '' : 's'}` : 'no library match';
      case 'create_response_entry': return `saved "${String(r.question).slice(0, 40)}…"`;
      case 'extract_questions': return `${r.questions.length} questions from pages ${r.pagesRead} of ${r.pagesInDocument}`;
      case 'generate_content': return 'drafted';
      default: return 'ok';
    }
  }

  class RayService {
    constructor(opts) {
      opts = opts || {};
      this.provider = opts.provider || new global.RayProvider.MockProvider();
      this.store = opts.store || new global.RayContext.ConversationStore();
      this.assembler = opts.assembler
        || new global.RayContext.ContextAssembler(this.store, { recencyTurns: 6, budget: 8000 });
      this.assembler.store = this.store;
      this.registry = opts.registry || new global.RayTools.ToolRegistry();
      this.threadIndex = opts.threadIndex || new global.RayContext.ThreadIndex();
      this.creditsSpent = 0;
      this.reader = null;
      this.guard = null;
      this.sessions = new Map();
      if (opts.user) this.setUser(opts.user);
    }

    /** Identity is set once, centrally. Every guard, repository and tool
     *  executor below this point inherits it — there is no other way in. */
    setUser(user) {
      this.user = user;
      this.guard = new global.RayPermissions.PermissionGuard(user);
      this.reader = new global.RayDocuments.DocumentReader(
        global.RayPermissions.Repositories.documents);
      return this;
    }

    /* ── Credits ───────────────────────────────────────────────────────
       Deliberately coarse. The platform meters tokens internally; the user is
       told about the month's allowance, and only when it is running low. */
    credits() {
      const c = global.RayFixtures.CREDITS;
      const used = Math.min(c.included, c.used + this.creditsSpent);
      return {
        included: c.included, used,
        remaining: Math.max(0, c.included - used),
        pct: Math.round((used / c.included) * 100),
        renews: c.renews,
      };
    }

    /** A turn costs credits, not tokens — that unit never reaches the UI. */
    chargeTurn(tokens) {
      this.creditsSpent += Math.max(1, Math.round(tokens / 150));
      return this.credits();
    }

    /** Every session, newest first. */
    allThreads() { return this.threadIndex.recent(this.user.id); }

    /** `tenderId` is what makes a chat part of a project: the panel groups
     *  the index on it, and a project page is a query for one value of it.
     *  Null means the chat belongs to no project. */
    newThread(tenderId) {
      return this.threadIndex.create(this.user.id, tenderId, Date.now());
    }

    renameThread(id, title) {
      return this.threadIndex.rename(this.user.id, id, title);
    }

    /** Deletes the session AND its messages. The index entry alone is not
     *  enough — leaving the conversation body behind would keep it retrievable
     *  by `search_conversation` after the user thought it was gone. */
    deleteThread(id) {
      this.threadIndex.remove(this.user.id, id);
      this.store.clear(this.user.id, id);
      this.sessions.delete(id);
      return this.allThreads()[0] || null;
    }

    /** The session for one thread. Navigating re-points its focus; it does not
     *  start a new conversation. Switching project or thread does. */
    thread(threadId, surfaceId, contextData) {
      if (!this.sessions.has(threadId)) {
        const sess = new RaySession(this, surfaceId || 'page', contextData, threadId);
        sess.threadId = threadId;
        this.sessions.set(threadId, sess);
      } else if (surfaceId) {
        this.sessions.get(threadId).setFocus(surfaceId, contextData);
      }
      return this.sessions.get(threadId);
    }

    /** A separate, throwaway thread. Kept for tests and for any future surface
     *  that genuinely needs to not pollute the site conversation. */
    session(surfaceId, contextData, conversationId) {
      const key = conversationId || `${surfaceId}:${(contextData && contextData.tenderId) || 'global'}:${this.user.id}`;
      if (!this.sessions.has(key)) {
        this.sessions.set(key, new RaySession(this, surfaceId, contextData, key));
      } else {
        this.sessions.get(key).setFocus(surfaceId, contextData);
      }
      return this.sessions.get(key);
    }
  }

  global.RayCore = { RayService, RaySession, SYSTEM_PROMPT };
})(window);
