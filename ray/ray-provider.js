/* ═══════════════════════════════════════════════════════════════════════════
   Model provider — the seam where Vertex AI used to be.

   RayService talks to this interface only:

       createMessage({ system, messages, tools, maxTokens }) -> {
         stop_reason: 'tool_use' | 'end_turn',
         content: [ {type:'text', text} | {type:'tool_use', id, name, input} ],
         usage: { input_tokens, output_tokens }
       }

   That is the Anthropic Messages API shape verbatim, so AnthropicProvider is a
   thin fetch and nothing above it changes. MockProvider implements the same
   contract deterministically so the prototype runs with no key and no network,
   and so the agentic loop can be demonstrated step by step.

   Document parsing, OCR and retrieval are NOT the provider's job — they moved
   to RayDocuments. That split is what removes the Vertex dependency rather
   than renaming it (see docs/MIGRATION.md).
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── Real provider ─────────────────────────────────────────────────────
     Not exercised in the prototype (no key is shipped), but written out so
     the port is a deletion rather than a rewrite. */
  class AnthropicProvider {
    constructor(opts) {
      this.model = (opts && opts.model) || 'claude-sonnet-5';
      this.endpoint = (opts && opts.endpoint) || '/api/ray/messages'; // server-side proxy; never call the API from the browser
      this.maxTokens = (opts && opts.maxTokens) || 2048;
    }
    async createMessage(req) {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens || this.maxTokens,
          system: req.system,
          messages: req.messages,
          tools: req.tools,
        }),
      });
      if (!res.ok) throw new Error(`Ray provider ${res.status}`);
      return res.json();
    }
  }

  /* ── Mock provider ─────────────────────────────────────────────────────
     Plans a realistic tool sequence for the demo intents, then narrates the
     answer from whatever the tools actually returned — including denials, so
     the permission story is visible rather than asserted. */

  let idc = 0;
  const use = (name, input) => ({ type: 'tool_use', id: `tu_${++idc}`, name, input });
  const text = (t) => ({ type: 'text', text: t });

  /* A real model takes time to decide its next tool call, and the panel is
     built to show that happening. The mock paces itself so the working state
     is something you can watch rather than a flash. */
  const STEP_MS = 340;
  const FINAL_MS = 260;
  /* The pause exists so a person can watch the steps arrive. If nobody is
     looking — a hidden tab, an automated run — skip it. */
  const sleep = (ms) => (typeof document !== 'undefined' && document.hidden)
    ? Promise.resolve()
    : new Promise((r) => setTimeout(r, ms));

  function classify(q, surface) {
    const s = (q || '').toLowerCase();
    if (surface && surface.intentHint && !s.trim()) return surface.intentHint;
    if (/\brate|pricing|margin|commercial\b/.test(s) && /confidential|rates/.test(s)) return 'confidential';
    if (/extract|questions?\b.*(schedule|rft|tender)|response schedule/.test(s)) return 'extract';
    if (/review (all|these|the) document|review the tender|multiple document|review all/.test(s)) return 'review';
    if (/earlier|before|you said|remind me what i|we discussed|last time/.test(s)) return 'recall';
    if (/response library|reuse|previously written|past answer/.test(s)) return 'library';
    if (/draft|write|rewrite|generate|improve|tighten|answer q\d/.test(s)) return 'generate';
    /* "which tenders am I on" is a question about scope, not about a document —
       it must not fall through to searching an RFT. */
    /* A tender belonging to another business. Refused for every role, which
       makes it the honest way to show §4 — a confidential file is only refused
       for some. */
    if (/hansen|another business|different business|not on my tenders/.test(s)) return 'foreign';
    if (/\b(which|what|my|list)\b[^?]*\btenders?\b/.test(s)) return 'tenders';
    if (/insurance|liquidated|validity|criteria|weighting|stem|cemp|setback|survey|due|closing/.test(s)) return 'lookup';
    return 'lookup';
  }

  class MockProvider {
    constructor() { this.model = 'mock-ray-planner'; }

    /** The loop hands us a scratch object that lives for one user turn. */
    async createMessage(req) {
      const scratch = req.scratch || (req.scratch = {});
      if (!scratch.script) {
        scratch.script = this.plan(req);
        scratch.step = 0;
      }
      const step = scratch.script[scratch.step++];
      const usage = { input_tokens: req.estimatedInputTokens || 0, output_tokens: 120 };

      if (!step || step.final) {
        await sleep(FINAL_MS);
        return { stop_reason: 'end_turn', usage,
                 content: [text(this.narrate(req, scratch, step))] };
      }
      await sleep(STEP_MS);
      return { stop_reason: 'tool_use', usage, content: step.calls };
    }

    /* ── Planning ───────────────────────────────────────────────────────── */
    plan(req) {
      const q = req.userMessage || '';
      const surface = req.surface || {};
      const intent = classify(q, surface);
      const tenderId = surface.tenderId || 't-envind';
      const docs = surface.documentIds || [];
      /* Attachments beat search: if the user handed Ray specific files, those
         are the answer's sources and nothing else needs opening first. */
      const attached = (surface.attachments || []).map((a) => a.id);
      req.intent = intent;

      switch (intent) {

        /* Narrow fact. Never read a 148-page file to answer one clause —
           search, then read only the pages the search pointed at. */
        case 'lookup':
          if (attached.length) {
            return [
              { calls: attached.slice(0, 3).map((id) =>
                  use('search_document', { document_id: id, query: q, limit: 2 })) },
              { calls: attached.slice(0, 2).map((id) =>
                  use('read_pages', { document_id: id, from: 1, to: 2 })) },
              { final: true },
            ];
          }
          return [
            { calls: [use('list_documents', { tender_id: tenderId })] },
            { calls: [use('search_document', { document_id: 'd-rft', query: q, limit: 2 }),
                      use('search_document', { document_id: 'd-scope', query: q, limit: 2 })] },
            { final: true },
          ];

        /* Multi-document review. Plan first — one strategy per document,
           inside a shared budget — then execute the plan. */
        case 'review':
          if (attached.length) {
            return [
              { calls: [use('plan_document_review', { document_ids: attached, intent: 'broad', token_budget: 6000 })] },
              { calls: attached.map((id) => use('read_pages', { document_id: id, from: 1, to: 2 })) },
              { final: true },
            ];
          }
          return [
            { calls: [use('list_documents', { tender_id: tenderId })] },
            { calls: [use('plan_document_review', {
                document_ids: docs.length ? docs : ['d-rft', 'd-scope', 'd-site', 'd-qa', 'd-rates'],
                intent: 'broad', token_budget: 6000 })] },
            { calls: [use('outline_document', { document_id: 'd-rft' }),
                      use('read_whole_document', { document_id: 'd-scope' }),
                      use('read_pages', { document_id: 'd-site', from: 17, to: 17 }),
                      use('read_pages', { document_id: 'd-qa', from: 1, to: 1 }),
                      use('read_pages', { document_id: 'd-rates', from: 1, to: 1 })] },
            { calls: [use('read_pages', { document_id: 'd-rft', from: 89, to: 91 })] },
            { final: true },
          ];

        /* Question extraction — formerly a Document Workspace special case,
           now the same registry, the same guard, the same trace. */
        case 'extract':
          return [
            { calls: [use('extract_questions', { document_id: 'd-rft' })] },
            { calls: [use('search_response_library', { query: 'environmental management system safety experience' })] },
            { final: true },
          ];

        case 'library':
          return [
            { calls: [use('search_response_library', { query: q })] },
            { final: true },
          ];

        /* Generation is grounded: library first (reuse beats rewrite), then
           the source pages, then draft. */
        case 'generate': {
          const subject = surface.question || q;
          return [
            { calls: [use('search_response_library', { query: subject })] },
            { calls: [use('search_document', { document_id: 'd-rft', query: subject, limit: 2 })] },
            { calls: [use('generate_content', { instruction: q, field: surface.field || null,
                                                word_limit: surface.wordLimit || null })] },
            { final: true },
          ];
        }

        /* Recall — the whole point of §2. The earlier turns are not in the
           prompt; Ray goes and gets the ones it needs. */
        case 'recall':
          return [
            { calls: [use('search_conversation', { query: q, limit: 3 })] },
            { final: true },
          ];

        /* The denial demo: Ray genuinely tries, and the guard genuinely
           refuses, for whichever role is active. */
        case 'confidential':
          return [
            { calls: [use('list_documents', { tender_id: tenderId })] },
            { calls: [use('read_pages', { document_id: 'd-rates', from: 1, to: 1 })] },
            { final: true },
          ];

        /* Ray genuinely tries; the guard genuinely refuses. */
        case 'foreign':
          return [
            { calls: [use('list_tenders', {})] },
            { calls: [use('get_tender', { tender_id: 't-foreign' })] },
            { final: true },
          ];

        case 'tenders':
        default:
          return [{ calls: [use('list_tenders', {})] }, { final: true }];
      }
    }

    /* ── Narration ──────────────────────────────────────────────────────
       Reads the real tool results out of the transcript, so the answer can
       never claim something the tools did not return. */
    narrate(req, scratch) {
      const results = (req.toolResults || []);
      const ok = results.filter((r) => r.ok);
      /* Two different refusals, one user-visible truth: Ray could not get at it.
         `permission_denied` — the record exists but the role may not read it.
         `not_available`     — the tool was never offered, because the role
                               lacks the scope entirely. Never report either as
                               "nothing found": that reads as an empty tender. */
      const denied = results.filter((r) =>
        r.error === 'permission_denied' || r.error === 'not_available');
      const intent = req.intent || 'lookup';
      const cite = (c) => `${c.docName} p.${c.page}`;

      /* One line per distinct cause — the same tool refused three times is
         still one thing the user needs to know. */
      const seen = new Set();
      const reasons = denied.map((d) => d.error === 'not_available'
          ? `the <b>${d.tool}</b> capability isn’t granted to your role`
          : `one item is outside your access — ${d.message}`)
        .filter((line) => !seen.has(line) && seen.add(line));
      const denialNote = reasons.length
        ? `\n\n<span class="ray-deny"><span class="ms">lock</span> I stopped short because `
          + reasons.join('; ') + `. Ask a Business Admin if you need it.</span>`
        : '';

      if (intent === 'recall') {
        const hits = (ok.find((r) => r.tool === 'search_conversation') || {}).result || [];
        if (!hits.length) return 'I couldn’t find that in our earlier messages — could you give me a keyword from it?' + denialNote;
        return 'From earlier in this conversation:\n\n'
          + hits.map((h) => `<blockquote><b>${h.role === 'user' ? 'You' : 'Ray'}:</b> ${h.text}</blockquote>`).join('')
          + `\n<span class="ray-note">Retrieved ${hits.length} message${hits.length > 1 ? 's' : ''} from storage — they were not in context.</span>` + denialNote;
      }

      if (intent === 'lookup') {
        const chunks = ok.filter((r) => r.tool === 'search_document').flatMap((r) => r.result);
        const attachedNames = (req.surface.attachments || []).map((a) => a.name);
        if (attachedNames.length && !chunks.length) {
          const pages = ok.filter((r) => r.tool === 'read_pages').flatMap((r) => r.result);
          return `I opened ${attachedNames.map((n) => `<b>${n}</b>`).join(' and ')} `
            + `but found nothing indexed for that yet — a freshly uploaded file has no `
            + `text layer until it is processed.`
            + (pages.length ? `\n\n${pages[0].text}\n<span class="ray-cite">${cite(pages[0])}</span>` : '')
            + `\n<span class="ray-note">In the platform the upload runs through the same `
            + `DocumentReader — page-by-page, or OCR if it is scanned.</span>` + denialNote;
        }
        if (!chunks.length) {
          return denied.length
            ? 'I can’t read this tender’s documents with your current access, so I won’t guess at the answer.' + denialNote
            : 'I searched the tender documents and found nothing matching that. Try naming the clause or schedule.';
        }
        const best = chunks.slice(0, 3);
        const docs = (ok.find((r) => r.tool === 'list_documents') || {}).result || [];
        const totalPages = docs.reduce((n, d) => n + d.pages, 0);
        return best.map((c) => `${c.text}\n<span class="ray-cite">${cite(c)}</span>`).join('\n\n')
          + (chunks.length > 1 && chunks.some((c) => c.docId === 'd-scope')
            ? '\n\n<b>Watch the addendum</b> — where it conflicts with the RFT, the addendum governs.' : '')
          + `\n<span class="ray-note">Read ${best.length} page${best.length > 1 ? 's' : ''}`
          + (totalPages ? ` of a ${totalPages}-page document set` : '') + '.</span>' + denialNote;
      }

      if (intent === 'review') {
        const plan = (ok.find((r) => r.tool === 'plan_document_review') || {}).result;
        const rows = plan ? plan.plans.map((p) =>
          `<tr><td>${p.docName}</td><td class="n">${p.pages}p</td><td><span class="ray-strat s-${p.strategy}">${p.label}</span></td><td>${p.reason}</td></tr>`).join('') : '';
        return `I reviewed the document set for this tender. Here is how I read each one:\n\n`
          + `<table class="ray-tbl"><thead><tr><th>Document</th><th class="n"></th><th>Strategy</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table>\n`
          + `<b>What matters most</b>\n`
          + `<ul><li>Evaluation is <b>40% price</b>, 25% technical capability, 20% experience, 10% environmental &amp; safety, 5% local content — a score under 2 on any criterion can make the tender non-conforming. <span class="ray-cite">Request for Tender p.91, p.97</span></li>`
          + `<li><b>Addendum 2 overrides the RFT twice</b>: Public Liability rises $20M → $25M, and stem rates rise 1,200 → 1,500/ha for zones B and C only. <span class="ray-cite">Scope of Works — Addendum 2 p.2, p.5</span></li>`
          + `<li>The scanned survey confirms a 30m watercourse setback in Zone C and acid sulfate sample points — price the handling. <span class="ray-cite">Site Survey p.17 (OCR)</span></li>`
          + `<li>Liquidated damages $4,500/day past practical completion. <span class="ray-cite">Request for Tender p.131</span></li></ul>`
          + `\n<span class="ray-note">I opened ${ok.filter((r) => /read_|outline/.test(r.tool)).length} reads across ${plan ? plan.plans.length : 0} documents rather than loading ${plan ? plan.plans.reduce((n, p) => n + p.pages, 0) : 0} pages.</span>`
          + denialNote;
      }

      if (intent === 'extract') {
        const ex = (ok.find((r) => r.tool === 'extract_questions') || {}).result;
        const lib = (ok.find((r) => r.tool === 'search_response_library') || {}).result || [];
        if (!ex) return 'I couldn’t reach that document.' + denialNote;
        const rows = ex.questions.map((q) => {
          const match = lib.find((l) => l.question.toLowerCase().split(' ').filter((w) => w.length > 5)
            .some((w) => q.question.toLowerCase().includes(w)));
          return `<tr><td class="n">Q${q.number}</td><td>${q.question}</td><td class="n">${q.wordLimit ? q.wordLimit + 'w' : '—'}</td>`
            + `<td>${match ? `<span class="ray-match">Library match · ${Math.round(match.winRate * 100)}% win</span>` : '<span class="ray-gap">No match</span>'}</td></tr>`;
        }).join('');
        return `I found <b>${ex.questions.length} response-schedule questions</b> in ${ex.document}.\n\n`
          + `<table class="ray-tbl"><thead><tr><th class="n"></th><th>Question</th><th class="n">Limit</th><th>Response Library</th></tr></thead><tbody>${rows}</tbody></table>\n`
          + `<span class="ray-note">Read pages ${ex.pagesRead} of ${ex.pagesInDocument} — the schedule section only.</span>\n`
          + `<button class="ray-act" data-ray-action="seed-library">Create Response Library drafts for the gaps</button>` + denialNote;
      }

      if (intent === 'library') {
        const lib = (ok.find((r) => r.tool === 'search_response_library') || {}).result || [];
        if (!lib.length) {
          return (denied.length ? 'I can’t reach the Response Library with your current access.'
                                : 'Nothing in the Response Library matches that yet.') + denialNote;
        }
        return lib.map((l) => `<div class="ray-libcard"><b>${l.question}</b>`
          + `<div class="m">${l.category} · ${l.words} words · ${Math.round(l.winRate * 100)}% win rate</div>`
          + `<p>${l.excerpt}</p><button class="ray-act" data-ray-action="insert">Insert</button></div>`).join('') + denialNote;
      }

      if (intent === 'generate') {
        const lib = (ok.find((r) => r.tool === 'search_response_library') || {}).result || [];
        const src = ok.filter((r) => r.tool === 'search_document').flatMap((r) => r.result);
        const base = lib[0];
        return (base
          ? `Drafted from your ${base.category} library answer (${Math.round(base.winRate * 100)}% win rate), updated against this tender’s requirements:\n\n`
          : 'Drafted from the tender documents:\n\n')
          + `<div class="ray-draft">Tenderfy Civil operates an ISO 14001:2016-certified Environmental Management System (certificate EMS-4471, current to March 2028). For this contract the EMS is applied through a site-specific CEMP prepared to AS/NZS ISO 14001:2016 and submitted for approval no later than ten business days before mobilisation${src.length ? '' : ''}. Zone C works observe the 30m watercourse setback identified in the site survey, with acid sulfate soil handling to the sampled points…</div>\n`
          + (src.length ? `<span class="ray-cite">Grounded in ${src.map(cite).join(', ')}</span>\n` : '')
          + `<button class="ray-act" data-ray-action="insert">Insert into the field</button> <button class="ray-act ghost" data-ray-action="library">Save to Response Library</button>` + denialNote;
      }

      if (intent === 'foreign') {
        const mine = (ok.find((r) => r.tool === 'list_tenders') || {}).result || [];
        return `That tender belongs to another business, so it is outside your scope — `
          + `it does not appear in your list and I cannot open it.`
          + (mine.length ? `\n\nYours are ${mine.map((t) => `<b>${t.name}</b>`).join(', ')}.` : '')
          + denialNote;
      }

      if (intent === 'confidential') {
        return denied.length
          ? `I can see the tender’s document list, but the commercial rates file is above your access level, so I haven’t opened it.${denialNote}`
          : `Internal rate build-up: weed eradication $1,940/ha, revegetation $6.20/stem, establishment maintenance $310/ha/month. <span class="ray-cite">Commercial Rates — CONFIDENTIAL p.1</span>\n<span class="ray-note">Visible to you because your role may read confidential documents.</span>`;
      }

      const tenders = (ok.find((r) => r.tool === 'list_tenders') || {}).result || [];
      return `You have access to ${tenders.length} tender${tenders.length === 1 ? '' : 's'}: `
        + tenders.map((t) => `<b>${t.name}</b> (${t.ref}, due ${t.due})`).join(', ')
        + '. Ask me about any of them — documents, dates, evaluation criteria, or a draft response.' + denialNote;
    }
  }

  global.RayProvider = { AnthropicProvider, MockProvider, STEP_MS };
})(window);
