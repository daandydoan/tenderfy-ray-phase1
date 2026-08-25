/* ═══════════════════════════════════════════════════════════════════════════
   §2 — Chat history & context management, Claude-style.

   The rule: history lives in storage, not in the prompt. Each turn assembles a
   working set out of four parts, in this order of preference —

     1. system + surface card   small, structured, always present
     2. recency window          the last N turns verbatim
     3. rolling summary         everything older, compacted once and reused
     4. retrieval               older turns fetched ONLY when the model calls
                                search_conversation

   So a 200-turn conversation costs about the same per turn as a 10-turn one,
   and Ray can still answer "what did I say about insurance an hour ago?".
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const est = (s) => Math.ceil((s || '').length / 4);
  let seq = 0;

  function safeLocalStorage() {
    try { localStorage.setItem('__ray', '1'); localStorage.removeItem('__ray'); return localStorage; }
    catch (e) { return null; }        // private mode: run in memory
  }

  /* ── Store ─────────────────────────────────────────────────────────────
     Owns messages for one user. Reads are permission-checked: a conversation
     belongs to a user, and the guard is asked before anything is returned.

     Ray is a site-wide agent, so a conversation outlives the page that started
     it. The store writes through to `storage` on every append; in the platform
     this is the conversation API instead, and nothing above this class changes.
     Storage failures are swallowed deliberately — losing scrollback is not a
     reason to fail a turn.                                                   */
  class ConversationStore {
    constructor(storage) {
      this.conversations = new Map();
      this.storage = storage === undefined ? safeLocalStorage() : storage;
    }

    key(userId, conversationId) { return `${userId}::${conversationId}`; }

    storageKey(userId, conversationId) { return `ray_conv::${userId}::${conversationId}`; }

    hydrate(userId, conversationId) {
      if (!this.storage) return null;
      try {
        const raw = this.storage.getItem(this.storageKey(userId, conversationId));
        if (!raw) return null;
        const c = JSON.parse(raw);
        /* Keep the global sequence ahead of anything restored, so retrieval
           ordering and the turn boundary stay monotonic across reloads. */
        c.messages.forEach((m) => { if (m.seq > seq) seq = m.seq; });
        return c;
      } catch (e) { return null; }
    }

    flush(c) {
      if (!this.storage) return;
      try {
        this.storage.setItem(this.storageKey(c.userId, c.id), JSON.stringify(c));
      } catch (e) { /* quota or private mode — the turn still stands */ }
    }

    clear(userId, conversationId) {
      this.conversations.delete(this.key(userId, conversationId));
      if (this.storage) {
        try { this.storage.removeItem(this.storageKey(userId, conversationId)); } catch (e) {}
      }
    }

    ensure(guard, conversationId) {
      const k = this.key(guard.user.id, conversationId);
      if (!this.conversations.has(k)) {
        this.conversations.set(k, this.hydrate(guard.user.id, conversationId) || {
          id: conversationId, userId: guard.user.id,
          messages: [], summary: null, summarisedUpTo: 0,
        });
      }
      return this.conversations.get(k);
    }

    load(guard, conversationId) {
      guard.assertScope('conversation.read', `conversation:${conversationId}`);
      const c = this.ensure(guard, conversationId);
      if (!guard.canRead('conversation', c)) {
        throw new global.RayPermissions.PermissionError(
          'conversation.read', `conversation:${conversationId}`,
          'conversations are readable only by the user who owns them');
      }
      return c;
    }

    append(guard, conversationId, msg) {
      guard.assertScope('conversation.write', `conversation:${conversationId}`);
      const c = this.load(guard, conversationId);
      const rec = Object.assign({ seq: ++seq, at: Date.now(), tokens: est(msg.text) }, msg);
      c.messages.push(rec);
      this.flush(c);
      return rec;
    }

    /** Retrieval over stored history. Lexical here; swap for the platform's
     *  search index without changing the tool contract. */
    /** `before` excludes the live turn — otherwise a question about the past
     *  retrieves itself, which reads as a bug and wastes a slot. */
    search(guard, conversationId, query, limit, before) {
      const c = this.load(guard, conversationId);
      const words = global.RayDocuments.terms(query);
      if (!words.length) return [];
      return c.messages
        .filter((m) => before == null || m.seq < before)
        .map((m) => {
          const low = (m.text || '').toLowerCase();
          let score = 0;
          words.forEach((t) => { if (low.includes(t)) score += 1; });
          return { m, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.m.seq - a.m.seq)
        .slice(0, limit || 4)
        .map((x) => x.m);
    }
  }

  /* ── Assembler ─────────────────────────────────────────────────────────── */
  class ContextAssembler {
    constructor(store, opts) {
      this.store = store;
      this.recencyTurns = (opts && opts.recencyTurns) || 6;   // messages, not pairs
      this.summariseAfter = (opts && opts.summariseAfter) || 8;
      this.budget = (opts && opts.budget) || 8000;
    }

    /** Compaction. Runs when history grows past the recency window, and only
     *  over the part that has not been summarised yet — so it is O(new), not
     *  O(all), and the cost does not grow with the conversation. */
    compact(conversation) {
      const cut = Math.max(0, conversation.messages.length - this.recencyTurns);
      if (cut <= conversation.summarisedUpTo) return conversation.summary;
      const fresh = conversation.messages.slice(conversation.summarisedUpTo, cut);
      if (!fresh.length) return conversation.summary;

      const facts = [];
      fresh.forEach((m) => {
        const t = m.text || '';
        t.split(/(?<=[.!?])\s+/).forEach((s) => {
          if (/\$|\bclause\b|\bp\.\d|\bdue\b|\bdays\b|\bcriteria\b|%/i.test(s) && s.length < 220) {
            facts.push(s.trim());
          }
        });
      });

      const carried = conversation.summary ? conversation.summary + ' ' : '';
      conversation.summary = (carried +
        `Earlier in this conversation (${conversation.summarisedUpTo + 1}–${cut}): ` +
        (facts.slice(0, 6).join(' ') || 'general discussion, no durable facts.')
      ).slice(0, 1400);
      conversation.summarisedUpTo = cut;
      if (this.store) this.store.flush(conversation);
      return conversation.summary;
    }

    /** Build the working set for one turn. Returns the parts plus an honest
     *  accounting of what was included and what was left in storage. */
    assemble(guard, conversationId, surfaceCard, systemPrompt) {
      const c = this.store.load(guard, conversationId);
      const summary = c.messages.length > this.summariseAfter ? this.compact(c) : null;
      const recent = c.messages.slice(-this.recencyTurns);

      const parts = [
        { kind: 'system',  label: 'System prompt',            text: systemPrompt },
        { kind: 'surface', label: 'Surface context card',     text: surfaceCard },
      ];
      if (summary) parts.push({ kind: 'summary', label: 'Rolling summary of earlier turns', text: summary });
      parts.push({
        kind: 'recency', label: `Last ${recent.length} messages`,
        text: recent.map((m) => `${m.role}: ${m.text}`).join('\n'),
      });

      parts.forEach((p) => { p.tokens = est(p.text); });
      const used = parts.reduce((n, p) => n + p.tokens, 0);
      const withheld = c.messages.length - recent.length;
      const withheldTokens = c.messages
        .slice(0, c.messages.length - recent.length)
        .reduce((n, m) => n + m.tokens, 0);

      return {
        parts, used, budget: this.budget,
        withheld, withheldTokens,
        naiveTokens: used + withheldTokens,      // what "send it all" would cost
        conversation: c,
      };
    }
  }

  /* ── ThreadIndex ────────────────────────────────────────────────────────
     A flat list of sessions per user, newest first — the registry the rail's
     session list is built on. Conversation bodies live in ConversationStore,
     keyed by the session id; this only tracks which sessions exist, what they
     are called, and when they were last touched.

     Each row still *records* the tender it was started from (`projectId`), but
     nothing reads it: there is no project layer in the UI. It is kept because
     the sync-up asked for project-based organisation, and re-introducing a
     grouping later should be a query, not a migration.                       */
  const GENERAL = 'general';

  class ThreadIndex {
    constructor(storage) {
      this.storage = storage === undefined ? safeLocalStorage() : storage;
      this.cache = new Map();
    }

    key(userId) { return `ray_threads::${userId}`; }

    all(userId) {
      if (this.cache.has(userId)) return this.cache.get(userId);
      let rows = [];
      if (this.storage) {
        try { rows = JSON.parse(this.storage.getItem(this.key(userId)) || '[]'); }
        catch (e) { rows = []; }
      }
      this.cache.set(userId, rows);
      return rows;
    }

    flush(userId) {
      if (!this.storage) return;
      try { this.storage.setItem(this.key(userId), JSON.stringify(this.all(userId))); }
      catch (e) {}
    }

    get(userId, id) { return this.all(userId).find((t) => t.id === id) || null; }

    create(userId, projectId, at) {
      const rows = this.all(userId);
      const rec = {
        id: `t${rows.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
        projectId: projectId || GENERAL,
        title: 'New session',
        untitled: true,
        at: at || 0,
      };
      rows.push(rec);
      this.flush(userId);
      return rec;
    }

    /** Called after every turn: bumps recency, names the thread from the first
     *  thing the user actually asked, and keeps the last line for the list. */
    touch(userId, id, firstUserText, at, snippet) {
      const rec = this.get(userId, id);
      if (!rec) return null;
      rec.at = at || rec.at + 1;
      if (rec.untitled && firstUserText) {
        rec.title = String(firstUserText).replace(/\s+/g, ' ').trim().slice(0, 44)
          + (firstUserText.length > 44 ? '…' : '');
        rec.untitled = false;
      }
      if (snippet) {
        /* The answer is light HTML; the list wants one clean line of prose,
           cut at a word boundary rather than mid-token. */
        const flat = String(snippet).replace(/<[^>]+>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
        rec.snippet = flat.length <= 88 ? flat
          : flat.slice(0, 88).replace(/\s+\S*$/, '') + '…';
      }
      this.flush(userId);
      return rec;
    }

    /** Every thread the user has, newest first — the flat list the rail shows
     *  when no project filter is applied. */
    recent(userId) {
      return this.all(userId).slice().sort((a, b) => b.at - a.at);
    }

    /** A rename sticks: `untitled` is cleared, so auto-naming from the first
     *  question never overwrites a name the user chose. */
    rename(userId, id, title) {
      const rec = this.get(userId, id);
      if (!rec) return null;
      const clean = String(title).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!clean) return rec;
      rec.title = clean;
      rec.untitled = false;
      this.flush(userId);
      return rec;
    }

    remove(userId, id) {
      const rows = this.all(userId);
      const i = rows.findIndex((t) => t.id === id);
      if (i >= 0) { rows.splice(i, 1); this.flush(userId); }
    }
  }

  global.RayContext = { ConversationStore, ContextAssembler, ThreadIndex, GENERAL, est };
})(window);
