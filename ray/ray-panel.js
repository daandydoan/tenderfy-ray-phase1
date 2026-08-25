/* ═══════════════════════════════════════════════════════════════════════════
   The unified Ray panel — ONE component, mounted once per page load as a
   right-hand RAIL that is part of the layout.

   It pushes `.c-main` narrower instead of floating over it, so Ray is a region
   of the application rather than a chat window sitting on top of one: nothing
   is ever hidden behind it, and the page reflows to live beside it. Open state
   and width persist, so the rail stays as you move around — which is what makes
   Ray read as a site-wide agent rather than a per-page widget.

     rail    the site rail, ~420px, pushing content            (default)
     wide    the same rail, widened for multi-document work
     inline  embedded in a host element (kept for embeds; unused by the site)

   A page does not build a Ray. It declares where the user's attention is:

       window.PAGE.ray = { surface:'tender', context:{ tenderId:'t-envind' } };

   Navigation calls `focus()`, not `mount()` — same service, same conversation,
   new context card. All reasoning, fetching and permission enforcement live in
   RayCore/RayTools/RayPermissions; the panel only renders a session's events.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* Pages live at the root and under pages/ — resolve the artwork once. */
  const RAY_IMG = (/\/pages\//.test(location.pathname) ? '../' : '') + 'assets/ray.svg';
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const OPEN_KEY = 'ray_rail_open';
  const WIDE_KEY = 'ray_rail_wide';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} },
  };

  let service = null;
  /* One rail per page load. `panels` still exists because an embed may mount an
     inline instance alongside it, but the site itself uses exactly one. */
  const panels = [];

  /* ── The panel ─────────────────────────────────────────────────────────── */
  class Panel {
    constructor(opts) {
      this.opts = opts || {};
      this.mode = this.opts.mode || 'rail';
      this.surfaceId = this.opts.surface || 'page';
      this.context = this.opts.context || {};
      /* The page's breadcrumb belongs to the page, not to one focus. A dialog
         re-pointing Ray at a field must not lose where that field lives. */
      this.pageCrumb = this.context.crumb || '';
      /* The rail remembers itself across navigation — that persistence is the
         whole difference between "a chat on this page" and "Ray is open". */
      this.open = this.mode === 'inline' ? true
        : this.opts.open != null ? this.opts.open
        : store.get(OPEN_KEY, false);
      this.wide = this.mode !== 'inline' && store.get(WIDE_KEY, false);
      this.view = 'chat';            // 'list' | 'chat' — Figma's two screens
      this.query = '';               // session search
      this.attachments = [];         // files pinned to the next message
      this.attachOpen = false;
      this.promptsOpen = false;
      this.menuFor = null;           // session id whose actions are open
      this.renaming = null;          // session id being renamed
      this.confirmDelete = null;     // session id awaiting confirmation
      this.busy = false;
      this.traceOpen = false;
      this.lastTrace = null;
      this.render();
      this.bindSession();
    }

    /* ── Session resolution ──────────────────────────────────────────────
       Sessions are a flat list, the way Figma's chats are. The rail reopens
       whichever you were last in; navigating changes the context card, never
       the session you are sitting in. */
    resolveSession() {
      const stored = (function () {
        try { return localStorage.getItem('ray_thread'); } catch (e) { return null; }
      })();
      const known = stored && service.threadIndex.get(service.guard.user.id, stored);
      const active = known || service.allThreads()[0] || service.newThread(this.context.tenderId);
      this.openThread(active.id, true);
    }

    openThread(threadId, quiet) {
      this.threadId = threadId;
      try { localStorage.setItem('ray_thread', threadId); } catch (e) {}
      this.bindSession();
      if (!quiet) this.setView('chat');
    }

    commitRename(id) {
      const box = this.el.querySelector('[data-ray-rename]');
      if (box && box.value.trim()) service.renameThread(id, box.value);
      this.renaming = null;
      this.menuFor = null;
      this.paintChrome();
    }

    /** Deleting the session you are in has to land somewhere: the next most
     *  recent, or a fresh one if that was the last. */
    deleteSession(id) {
      const wasActive = id === this.threadId;
      const next = service.deleteThread(id);
      this.menuFor = this.renaming = this.confirmDelete = null;
      if (wasActive) {
        this.openThread((next || service.newThread(this.context.tenderId)).id, true);
        toast('Session deleted');
        this.paintChrome();
        return;
      }
      toast('Session deleted');
      this.paintChrome();
    }

    /** A new session records the tender it was started from, for provenance —
     *  nothing groups on it. */
    newSession() {
      const t = service.newThread(this.context.tenderId);
      this.openThread(t.id);
    }

    bindSession() {
      this.session = service.thread(this.threadId, this.surfaceId, this.context);
      if (this.opts.seed && !this.session.history().length && this.opts.seedInto === this.threadId) {
        this.session.seed(this.opts.seed);
      }
      this.session.listeners = [];
      this.session.on((ev) => this.onEvent(ev));
      this.paintHistory();
      this.paintChrome();
    }

    /* ── DOM ─────────────────────────────────────────────────────────────
       Everything below the header is delegated, because the header itself is
       repainted whenever the screen changes.                                */
    render() {
      /* The rail is a flex sibling of .c-main inside .capp — that is what makes
         it push rather than overlay. Falls back to the body if the shell has
         not mounted (an embed, or a page without chrome). */
      this.shell = document.querySelector('.capp');
      const host = this.mode === 'inline'
        ? document.querySelector(this.opts.mount)
        : (this.shell || document.body);

      const el = document.createElement('div');
      el.className = `ray-panel mode-${this.mode} view-chat`
        + (this.open ? ' open' : '') + (this.wide ? ' wide' : '');
      el.id = 'rayPanel';
      el.innerHTML = `
        <div class="ray-head" data-ray="head"></div>
        <div class="ray-headbar" data-ray="headbar"></div>
        <div class="ray-list" data-ray="list"></div>
        <div class="ray-body" data-ray="body"></div>
        <div class="ray-trace" data-ray="trace"></div>
        <div class="ray-foot">
          <div class="ray-credit" data-ray="credit"></div>
          <div class="ray-sec input">
            <div class="ray-seclabel" data-ray="ctxlabel">Context</div>
            <div class="ray-ctx" data-ray="ctx"></div>
            <div class="ray-atts" data-ray="atts"></div>
            <div class="ray-attpick" data-ray="attpick"></div>
            <div class="ray-attpick" data-ray="prompts"></div>
            <form class="ray-composer" data-ray="composer">
              <button type="button" class="ray-attach" data-ray-attach title="Attach a document">
                <span class="ms">add</span></button>
              <button type="button" class="ray-attach" data-ray-prompts title="Saved prompts">
                <span class="ms">bookmark</span></button>
              <textarea rows="1" placeholder="Reply to Ray…" data-ray="input"></textarea>
              <button type="submit" class="ray-send" title="Send"><span class="ms">arrow_upward</span></button>
            </form>
            <input type="file" multiple hidden data-ray="file">
            <div class="ray-surfacebar" data-ray="surfacebar"></div>
          </div>
        </div>`;
      host.appendChild(el);
      this.el = el;
      this.$ = (n) => el.querySelector(`[data-ray="${n}"]`);

      if (this.mode !== 'inline') {
        const fab = document.createElement('button');
        fab.className = 'ray-fab';
        fab.id = 'rayFab';
        fab.title = 'Ray — Tenderfy Co-Pilot';
        fab.innerHTML = `<img src="${RAY_IMG}" alt="Ray">`;
        fab.onclick = () => this.show();
        document.body.appendChild(fab);
        this.fab = fab;
        this.applyLayout();
      }

      this.$('composer').onsubmit = (e) => { e.preventDefault(); this.submit(); };
      this.$('input').addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === 'Return') && !e.shiftKey) {
          e.preventDefault(); this.submit();
        }
      });

      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-ray="close"]')) { this.hide(); return; }
        if (e.target.closest('[data-ray="expand"]')) { this.toggleWide(); return; }
        const act = e.target.closest('[data-ray-action]');
        if (act) { this.action(act.getAttribute('data-ray-action'), act); return; }
        const th = e.target.closest('[data-think-toggle]');
        if (th) {
          const blk = th.closest('[data-think]');
          if (blk && !blk.classList.contains('working')) {
            const open = blk.classList.toggle('open');
            const ic = th.querySelector('.ms');
            if (ic) ic.textContent = open ? 'expand_more' : 'chevron_right';
          }
          return;
        }
        const tt = e.target.closest('[data-ray-trace-toggle]');
        if (tt) { this.traceOpen = !this.traceOpen; this.paintTrace(); return; }
        if (e.target.closest('[data-ray-attach]')) {
          this.attachOpen = !this.attachOpen; this.promptsOpen = false;
          this.paintAttachments(); this.paintPrompts(); return;
        }
        if (e.target.closest('[data-ray-prompts]')) {
          this.promptsOpen = !this.promptsOpen; this.attachOpen = false;
          this.paintAttachments(); this.paintPrompts(); return;
        }
        const up = e.target.closest('[data-ray-prompt]');
        if (up) { this.usePrompt(up.getAttribute('data-ray-prompt')); return; }
        if (e.target.closest('[data-ray-prompt-save]')) { this.savePrompt(); return; }
        const pd = e.target.closest('[data-ray-prompt-del]');
        if (pd) {
          try {
            global.RayPermissions.Repositories.promptLibrary
              .remove(service.guard, pd.getAttribute('data-ray-prompt-del'));
            this.paintPrompts();
          } catch (err) { toast(err.reason || err.message); }
          return;
        }
        const ad = e.target.closest('[data-ray-attachdoc]');
        if (ad) { this.attachDoc(ad.getAttribute('data-ray-attachdoc')); return; }
        if (e.target.closest('[data-ray-upload]')) { this.$('file').click(); return; }
        const un = e.target.closest('[data-ray-unattach]');
        if (un) {
          const id = un.getAttribute('data-ray-unattach');
          this.attachments = this.attachments.filter((a) => a.id !== id);
          this.paintAttachments();
          return;
        }
        if (e.target.closest('[data-ray-ctx-off]')) {
          this.session.contextOff = true;
          this.paintContext();
          return;
        }
        if (e.target.closest('[data-ray-ctx-on]')) {
          this.session.contextOff = false;
          this.paintContext();
          return;
        }
        if (e.target.closest('[data-ray-list]')) { this.setView('list'); return; }
        if (e.target.closest('[data-ray-new]')) { this.newSession(); return; }

        /* ── Session CRUD ─────────────────────────────────────────────── */
        const menu = e.target.closest('[data-ray-menu]');
        if (menu) {
          const id = menu.getAttribute('data-ray-menu');
          this.menuFor = this.menuFor === id ? null : id;
          this.renaming = this.confirmDelete = null;
          this.paintChrome();
          return;
        }
        const rs = e.target.closest('[data-ray-rename-start]');
        if (rs) {
          this.renaming = rs.getAttribute('data-ray-rename-start');
          this.confirmDelete = null;
          this.paintChrome();
          const box = this.el.querySelector('[data-ray-rename]');
          if (box) { box.focus(); box.select(); }
          return;
        }
        const sv = e.target.closest('[data-ray-rename-save]');
        if (sv) { this.commitRename(sv.getAttribute('data-ray-rename-save')); return; }
        const ds = e.target.closest('[data-ray-del-start]');
        if (ds) {
          this.confirmDelete = ds.getAttribute('data-ray-del-start');
          this.renaming = null;
          this.paintChrome();
          return;
        }
        const dc = e.target.closest('[data-ray-del-confirm]');
        if (dc) { this.deleteSession(dc.getAttribute('data-ray-del-confirm')); return; }
        if (e.target.closest('[data-ray-cancel]')) {
          this.renaming = this.confirmDelete = null;
          this.paintChrome();
          return;
        }

        const t = e.target.closest('[data-ray-thread]');
        if (t) {
          this.menuFor = this.renaming = this.confirmDelete = null;
          this.openThread(t.getAttribute('data-ray-thread'));
          return;
        }
      });

      /* Enter commits a rename, Escape abandons it. */
      el.addEventListener('keydown', (e) => {
        const box = e.target.closest('[data-ray-rename]');
        if (!box) return;
        if (e.key === 'Enter' || e.key === 'Return') {
          e.preventDefault();
          this.commitRename(box.getAttribute('data-ray-rename'));
        } else if (e.key === 'Escape') {
          this.renaming = null;
          this.paintChrome();
        }
      });

      el.addEventListener('change', (e) => {
        if (e.target.matches('[data-ray="file"]') && e.target.files.length) {
          this.upload(e.target.files);
          e.target.value = '';
        }
      });

      /* Search repaints the list, so the caret has to be put back. */
      el.addEventListener('input', (e) => {
        if (e.target.matches('[data-ray="input"]') && this.promptsOpen) this.paintPrompts();
        if (!e.target.matches('[data-ray="q"]')) return;
        this.query = e.target.value;
        const at = e.target.selectionStart;
        this.paintList();
        const box = this.$('q');
        if (box) { box.focus(); box.setSelectionRange(at, at); }
      });

      this.resolveSession();
    }

    /* ── Screens ─────────────────────────────────────────────────────────
       Two screens, the way Figma's Agents panel does it: a list you choose a
       session from, and the session itself. The back chevron is the only way
       between them, which is what keeps a 420px rail legible — no tab strip
       competing with the conversation for the same 40px.                    */
    setView(view) {
      this.view = view;
      this.menuFor = this.renaming = this.confirmDelete = null;
      this.el.classList.toggle('view-list', view === 'list');
      this.el.classList.toggle('view-chat', view !== 'list');
      this.paintHeader();
      if (view === 'list') this.paintList();
      else this.$('input').focus();
    }

    paintHeader() {
      const head = this.$('head');
      if (this.view === 'list') {
        head.innerHTML = `
          <img class="ray-mark" src="${RAY_IMG}" alt="">
          <div class="ray-title">Sessions</div>
          <span class="ms ray-hbtn" data-ray-new title="New session">add</span>
          <span class="ms ray-hbtn" data-ray="expand" title="Widen">right_panel_open</span>
          <span class="ms ray-hbtn" data-ray="close" title="Close Ray">close</span>`;
        return;
      }
      const t = service.threadIndex.get(service.guard.user.id, this.threadId);
      head.innerHTML = `
        <span class="ms ray-back" data-ray-list title="All sessions">chevron_left</span>
        <div class="ray-title">${esc(t && !t.untitled ? t.title : 'New session')}</div>
        <span class="ms ray-hbtn" data-ray-menu="${this.threadId}" title="Session options">more_horiz</span>
        <span class="ms ray-hbtn" data-ray="expand" title="Widen">right_panel_open</span>
        <span class="ms ray-hbtn" data-ray="close" title="Close Ray">close</span>`;
      this.$('headbar').innerHTML =
        (this.menuFor === this.threadId && this.view === 'chat')
          ? Panel.actions(this.threadId, this.renaming === this.threadId,
                          this.confirmDelete === this.threadId,
                          t && !t.untitled ? t.title : '')
          : '';
    }

    /* Relative age, in the shape a chat list wants: now / 12m / 3h / 2d / 1mo */
    static ago(ts) {
      const s = Math.max(0, (Date.now() - ts) / 1000);
      if (s < 60) return 'now';
      if (s < 3600) return Math.floor(s / 60) + 'm';
      if (s < 86400) return Math.floor(s / 3600) + 'h';
      const d = Math.floor(s / 86400);
      return d < 30 ? d + 'd' : Math.floor(d / 30) + 'mo';
    }

    static bucket(ts) {
      const day = 86400000;
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      if (ts >= midnight.getTime()) return 'Today';
      if (ts >= midnight.getTime() - day) return 'Yesterday';
      return 'Earlier';
    }

    /** Figma anchors each row with a design thumbnail. We have nothing to
     *  preview, so a row gets a mark tinted by the tender the session was
     *  started from — deterministic, so the same tender is always the same
     *  colour and a long list becomes scannable. */
    static tile(thread) {
      const key = (thread && thread.projectId) || '';
      if (!key || key === global.RayContext.GENERAL || !global.rayTenderColour) {
        return `<span class="ray-tile"><span class="ms">chat_bubble</span></span>`;
      }
      /* Shared with the page chrome, so a tender is the same colour in Ray's
         list as it is on its own page. */
      return `<span class="ray-tile ${global.rayTenderColour(key)}">`
        + `<span class="ms">chat_bubble</span></span>`;
    }

    /** The rename + delete affordances, shared by a list row and the session
     *  header. Inline rather than a popover: the list scrolls, and a floating
     *  menu near the bottom of a 420px rail clips. */
    static actions(id, renaming, confirming, title) {
      if (renaming) {
        return `<div class="ray-acts">
          <input class="ray-rename" data-ray-rename="${id}" value="${esc(title)}"
                 placeholder="Session name" maxlength="80">
          <button class="ray-mini pri" data-ray-rename-save="${id}">Save</button>
          <button class="ray-mini" data-ray-cancel>Cancel</button>
        </div>`;
      }
      if (confirming) {
        return `<div class="ray-acts warn">
          <span class="ray-actmsg">Delete this session and its messages?</span>
          <button class="ray-mini danger" data-ray-del-confirm="${id}">Delete</button>
          <button class="ray-mini" data-ray-cancel>Cancel</button>
        </div>`;
      }
      return `<div class="ray-acts">
        <button class="ray-mini" data-ray-rename-start="${id}"><span class="ms">edit</span>Rename</button>
        <button class="ray-mini" data-ray-del-start="${id}"><span class="ms">delete</span>Delete</button>
      </div>`;
    }

    paintList() {
      const box = this.$('list');
      let rows = service.allThreads();
      if (this.query) {
        const q = this.query.toLowerCase();
        rows = rows.filter((t) => (t.title + ' ' + (t.snippet || '')).toLowerCase().indexOf(q) >= 0);
      }

      let out = `
        <div class="ray-search">
          <span class="ms">search</span>
          <input type="text" placeholder="Search sessions" data-ray="q" value="${esc(this.query)}">
        </div>`;

      if (!rows.length) {
        out += `<div class="ray-listempty">
            ${this.query ? 'No sessions match that.' : 'No sessions yet.'}
            <button class="ray-act" data-ray-new>Start a session</button></div>`;
      } else {
        let last = null;
        rows.forEach((t) => {
          const b = Panel.bucket(t.at);
          if (b !== last) { out += `<div class="ray-group">${b}</div>`; last = b; }
          const open = this.menuFor === t.id;
          out += `
            <div class="ray-rowwrap${open ? ' open' : ''}">
              <button class="ray-row${t.id === this.threadId ? ' on' : ''}" data-ray-thread="${t.id}">
                ${Panel.tile(t)}
                <span class="ray-rowtx">
                  <span class="ray-rowt">${esc(t.untitled ? 'New session' : t.title)}</span>
                  <span class="ray-rows">${esc(t.snippet || 'No messages yet')}</span>
                </span>
                <span class="ray-rowage">${t.at ? Panel.ago(t.at) : ''}</span>
              </button>
              <button class="ms ray-rowmenu" data-ray-menu="${t.id}" title="Session options">more_horiz</button>
              ${open ? Panel.actions(t.id, this.renaming === t.id,
                                     this.confirmDelete === t.id,
                                     t.untitled ? '' : t.title) : ''}
            </div>`;
        });
      }
      box.innerHTML = out;
    }

    /** Kept as the single repaint entry point the rest of the class calls. */
    paintChrome() {
      this.paintHeader();
      if (this.view === 'list') this.paintList();
      this.paintSurface();
    }

    /* ── Focus ───────────────────────────────────────────────────────────
       Navigating, or opening a dialog, re-points Ray at what the user is now
       looking at. The conversation is untouched — no rebind, no repaint of
       history, no lost scrollback. */
    focus(surfaceId, context) {
      this.surfaceId = surfaceId || this.surfaceId;
      this.context = context || {};
      if (!this.context.crumb) this.context.crumb = this.pageCrumb;
      /* Navigating changes what Ray is looking at, never which session you are
         in — the same way a Figma chat survives moving around a file. */
      this.session.setFocus(this.surfaceId, this.context);
      this.paintSurface();
      return this;
    }

    /* ── Attachments ─────────────────────────────────────────────────────
       A message can carry documents. The picker offers the tender's own files,
       guard-filtered — a document you may not read is never offered, so the
       permission model holds at the point of attachment rather than at the
       point of reading. Uploading is a separate scope again (`document.write`),
       which is why an Estimator can attach but not upload.                  */
    /** One attachment, as a card: an icon tile coloured by file type, the
     *  name, and what it is. Same card in the tray and under a sent message —
     *  only the remove button differs. */
    static attCard(a, removable) {
      const icon = a.kind === 'xlsx' ? 'table_chart'
        : a.kind === 'docx' ? 'description' : 'picture_as_pdf';
      const meta = [(a.kind || 'file').toUpperCase(),
                    a.pages ? a.pages + (a.pages === 1 ? ' page' : ' pages') : null]
        .filter(Boolean).join(' · ');
      return `<span class="ray-attcard">
          <span class="ic k-${esc(a.kind || 'pdf')}"><span class="ms">${icon}</span></span>
          <span class="meta"><span class="nm">${esc(a.name)}</span><span class="sub">${esc(meta)}</span></span>
          ${removable ? `<button class="ray-attx" data-ray-unattach="${a.id}" title="Remove">
              <span class="ms">close</span></button>` : ''}
        </span>`;
    }

    paintAttachments() {
      const box = this.$('atts');
      box.innerHTML = this.attachments.map((a) => Panel.attCard(a, true)).join('');

      const pick = this.$('attpick');
      if (!this.attachOpen) { pick.innerHTML = ''; return; }
      const guard = service.guard;
      let docs = [];
      try {
        docs = global.RayPermissions.Repositories.documents
          .list(guard, this.context.tenderId || null);
      } catch (e) { docs = []; }
      const taken = this.attachments.map((a) => a.id);
      const rows = docs.filter((d) => taken.indexOf(d.id) === -1);
      const canUpload = guard.scopes.indexOf('document.write') >= 0;

      pick.innerHTML = `<div class="ray-pickhead">Attach a document</div>`
        + (rows.length ? rows.map((d) => `
            <button class="ray-pickrow" data-ray-attachdoc="${d.id}">
              <span class="ms">${d.kind === 'xlsx' ? 'table_chart' : d.kind === 'docx' ? 'description' : 'picture_as_pdf'}</span>
              <span class="t">${esc(d.name)}<span class="s">${d.pages} pages${d.scanned ? ' · scanned' : ''}</span></span>
            </button>`).join('')
          : '<div class="ray-pickempty">Nothing else on this tender you can read.</div>')
        + (canUpload
            ? `<button class="ray-pickrow up" data-ray-upload>
                 <span class="ms">upload_file</span><span class="t">Upload from your computer</span></button>`
            : `<div class="ray-pickempty">Your role cannot upload new documents.</div>`);
    }

    attachDoc(id) {
      try {
        const d = global.RayPermissions.Repositories.documents.get(service.guard, id);
        this.attachments.push({ id: d.id, name: d.name, kind: d.kind, pages: d.pages });
        this.attachOpen = false;
        this.paintAttachments();
      } catch (err) { toast(err.reason || err.message); }
    }

    /** An uploaded file becomes a real document record, so it routes through
     *  the same reading strategies as anything else — and honestly reports
     *  that it has no indexed text yet. */
    upload(files) {
      const guard = service.guard;
      const tenderId = this.context.tenderId || 't-envind';
      Array.from(files).forEach((f, i) => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const kind = ['pdf', 'docx', 'xlsx'].indexOf(ext) >= 0 ? ext : 'pdf';
        const scanned = /scan|survey|photo|image/i.test(f.name);
        const doc = {
          id: 'd-up' + Date.now().toString(36) + i,
          tenderId, name: f.name, kind,
          pages: Math.max(1, Math.round(f.size / 45000)),
          bytes: f.size, textLayer: !scanned, scanned,
          classification: 'internal',
          uploaded: new Date().toISOString().slice(0, 10),
          outline: null,
        };
        try {
          global.RayPermissions.Repositories.documents.add(guard, doc);
          this.attachments.push({ id: doc.id, name: doc.name, kind: doc.kind, pages: doc.pages });
        } catch (err) { toast(err.reason || err.message); }
      });
      this.attachOpen = false;
      this.paintAttachments();
    }

    /* ── Prompt Library ──────────────────────────────────────────────────
       Instructions worth reusing. Picking one puts it in the composer rather
       than sending it — a saved prompt is a starting point, and the thing in
       front of you usually needs a word changed.                            */
    paintPrompts() {
      const box = this.$('prompts');
      if (!this.promptsOpen) { box.innerHTML = ''; return; }
      const guard = service.guard;
      let rows = [];
      try { rows = global.RayPermissions.Repositories.promptLibrary.list(guard); }
      catch (e) { rows = []; }
      const canWrite = guard.scopes.indexOf('prompt_library.write') >= 0;
      const draft = (this.$('input').value || '').trim();

      box.innerHTML = `<div class="ray-pickhead">Saved prompts</div>`
        + (rows.length ? rows.map((r) => `
            <div class="ray-promptrow">
              <button class="ray-pickrow" data-ray-prompt="${r.id}">
                <span class="ms">bookmark</span>
                <span class="t">${esc(r.label)}<span class="s">${esc(r.text)}</span></span>
              </button>
              ${canWrite ? `<button class="ray-promptx" data-ray-prompt-del="${r.id}"
                  title="Remove"><span class="ms">close</span></button>` : ''}
            </div>`).join('')
          : '<div class="ray-pickempty">No saved prompts yet.</div>')
        + (canWrite
            ? `<button class="ray-pickrow up" data-ray-prompt-save ${draft ? '' : 'disabled'}>
                 <span class="ms">bookmark_add</span>
                 <span class="t">${draft ? 'Save what you have typed' : 'Type something to save it'}</span>
               </button>`
            : `<div class="ray-pickempty">Your role cannot save prompts.</div>`);
    }

    usePrompt(id) {
      try {
        const r = global.RayPermissions.Repositories.promptLibrary.list(service.guard)
          .find((x) => x.id === id);
        if (!r) return;
        const box = this.$('input');
        box.value = r.text;
        this.promptsOpen = false;
        this.paintPrompts();
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      } catch (err) { toast(err.reason || err.message); }
    }

    savePrompt() {
      const text = (this.$('input').value || '').trim();
      if (!text) return;
      try {
        global.RayPermissions.Repositories.promptLibrary.add(service.guard, {
          label: text.replace(/\s+/g, ' ').slice(0, 46) + (text.length > 46 ? '…' : ''),
          text,
        });
        this.paintPrompts();
        toast('Saved to your prompt library');
      } catch (err) { toast(err.reason || err.message); }
    }

    /* ── Context chip ────────────────────────────────────────────────────
       What Ray is being told to look at, named and dismissible — the Figma
       selection pattern the sync-up asked for. Dismissing does not shrink what
       Ray may reach; it stops the page being assumed.                      */
    /** A trail, not a label: where you are, then what Ray is pointed at inside
     *  it. The root comes from the page's own breadcrumb so the chip and the
     *  header agree; the leaves come from the context, because they are the
     *  specific thing — the tender, the open document, the field. */
    contextLabel() {
      const c = this.context || {};
      const Repos = global.RayPermissions.Repositories;
      const named = (fn) => { try { return fn(); } catch (e) { return null; } };

      const crumbs = String(c.crumb || '').split('•').map((x) => x.trim()).filter(Boolean);
      const trail = crumbs.length ? [crumbs[0]] : [];
      let icon = 'web_asset';

      const tender = c.tenderId && named(() => Repos.tenders.get(service.guard, c.tenderId));
      if (tender) { trail.push(tender.name); icon = 'domain'; }

      const doc = c.documentId && named(() => Repos.documents.get(service.guard, c.documentId));
      if (doc) { trail.push(doc.name); icon = 'description'; }

      if (this.surfaceId === 'edit-dialog' && c.field) { trail.push(c.field); icon = 'edit_note'; }

      /* Nothing specific to point at — fall back to the rest of the page's own
         breadcrumb so the chip still says something true. */
      if (trail.length <= 1 && crumbs.length > 1) trail.push.apply(trail, crumbs.slice(1));
      if (!trail.length && c.pageTitle) trail.push(c.pageTitle);
      if (!trail.length) return null;

      return { icon, trail, text: trail[trail.length - 1] };
    }

    paintContext() {
      const box = this.$('ctx');
      const label = this.contextLabel();
      /* The section header only earns its place when there is a chip under it. */
      this.$('ctxlabel').style.display = label ? '' : 'none';
      if (!label) { box.innerHTML = ''; return; }
      const off = this.session && this.session.contextOff;
      const trail = label.trail
        .map((seg, i) => (i ? '<span class="sep">›</span>' : '')
          + `<span class="seg">${esc(seg)}</span>`).join('');
      box.innerHTML = off
        ? `<button class="ray-ctxadd" data-ray-ctx-on>
             <span class="ms">add</span>Add ${esc(label.text)} as context</button>`
        : `<span class="ray-ctxchip" title="Ray is answering about ${esc(label.trail.join(' › '))}. Dismiss to ask something general.">
             <span class="ms">${label.icon}</span>
             <span class="t">${trail}</span>
             <button class="ray-ctxx" data-ray-ctx-off title="Stop using this as context">
               <span class="ms">close</span></button>
           </span>`;
    }

    /* ── Credits ─────────────────────────────────────────────────────────
       Silent until the month's allowance is running down. No per-answer token
       count ever reaches this surface — the sync-up was explicit that metering
       every reply discourages people from using Ray at all.                */
    paintCredits() {
      const box = this.$('credit');
      const c = service.credits();
      if (c.pct < 60) { box.innerHTML = ''; return; }
      const low = c.pct >= 85;
      box.innerHTML = `
        <div class="ray-creditbar${low ? ' low' : ''}">
          <div class="ray-creditline">
            <span class="ms">${low ? 'error' : 'bolt'}</span>
            <span>${low ? 'Ray credits nearly used up' : 'Ray credits running low'}
              — <b>${c.pct}%</b> of this month's allowance used</span>
            <button class="ray-credittop" data-ray-action="topup">Top up</button>
          </div>
          <div class="ray-creditmeter"><i style="width:${Math.min(100, c.pct)}%"></i></div>
        </div>`;
    }

    paintSurface() {
      const s = global.RaySurfaces.resolve(this.surfaceId);
      const guard = service.guard;
      const n = service.registry.countsFor(s, guard);
      if (!document.documentElement.classList.contains('dev')) {
        this.$('surfacebar').innerHTML = '';
      } else this.$('surfacebar').innerHTML =
        `<span title="Ray sees which page you are on; it does not limit what it may look at">`
        + `Looking at <b>${s.id}</b></span> · `
        + `<span title="${n.primary} most relevant here — all ${n.total} are reachable from any page">`
        + `${n.total} tools</span> · `
        + `<span title="Everything Ray fetches is filtered by this role's permissions">`
        + `${esc(guard.user.role)}</span>`;
      /* `session` is still undefined on the first paint, which render() does
         before bindSession(); an unstarted thread is the right answer then. */
      const started = this.session ? this.session.history().length : 0;
      this.$('input').placeholder = s.id === 'edit-dialog'
        ? 'Ask Ray to draft, tighten or reuse…'
        : started ? 'Reply to Ray…' : 'Ask Ray anything…';
      this.paintContext();
      this.paintCredits();
      this.paintAttachments();
      this.paintPrompts();
    }

    /* ── Visibility ──────────────────────────────────────────────────────
       The shell owns the width as a custom property; everything that must
       reflow (content, and any modal that should stop short of the rail)
       reads --rail-w rather than knowing about Ray.                        */
    applyLayout() {
      if (this.mode === 'inline') return;
      const w = !this.open ? '0px' : (this.wide ? '640px' : '420px');
      if (this.shell) this.shell.style.setProperty('--rail-w', w);
      document.documentElement.classList.toggle('ray-rail-open', this.open);
      if (this.fab) this.fab.style.display = this.open ? 'none' : '';
      const btn = this.el.querySelector('[data-ray="expand"]');
      if (btn) {
        btn.textContent = this.wide ? 'right_panel_close' : 'right_panel_open';
        btn.title = this.wide ? 'Narrow' : 'Widen';
      }
    }
    show() {
      this.open = true;
      this.el.classList.add('open');
      store.set(OPEN_KEY, true);
      this.applyLayout();
      if (!this.$('body').children.length) this.paintHistory();
      this.$('input').focus();
    }
    hide() {
      if (this.mode === 'inline') return;
      this.open = false;
      this.el.classList.remove('open');
      store.set(OPEN_KEY, false);
      this.applyLayout();
    }
    toggleWide() {
      this.wide = !this.wide;
      this.el.classList.toggle('wide', this.wide);
      store.set(WIDE_KEY, this.wide);
      this.applyLayout();
    }

    /* ── Messages ────────────────────────────────────────────────────────── */
    /** The blank-conversation state. One line, then the things worth asking —
     *  no greeting bubble pretending a conversation has started. */
    greet() {
      const g = service.guard;
      const s = global.RaySurfaces.resolve(this.surfaceId);
      const n = service.registry.countsFor(s, g);
      this.$('body').innerHTML = `
        <div class="ray-empty">
          <img class="ray-mark lg" src="${RAY_IMG}" alt="">
          <h3>What's next?</h3>
          <p>Ask me anything across your tenders, documents and Response Library.
             I can see what you have open, and everything I fetch stays inside
             <b>${esc(g.user.name)}</b>'s permissions.</p>
          <div class="ray-starters">
            ${s.suggestions.map((q) =>
              `<button class="ray-starter" data-ray-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
          </div>
          <p class="ray-scope devonly">${n.total} tools available from anywhere on the site</p>
        </div>`;
    }

    paintHistory() {
      const body = this.$('body');
      body.innerHTML = '';
      const msgs = this.session.history();
      if (!msgs.length) {
        /* No thread, no receipts — a trace line left over from a cleared
           conversation would be describing a turn that no longer exists. */
        this.lastTrace = null;
        this.traceOpen = false;
        this.paintTrace();
        this.greet();
        return;
      }
      /* Scrollback is not the context window. The assembler decides what Ray is
         TOLD (the recency window, §2); this decides what the user can SCROLL
         BACK THROUGH, which should be the whole session until it gets silly. */
      const shown = msgs.slice(-40);
      if (msgs.length > shown.length) {
        body.insertAdjacentHTML('beforeend',
          `<div class="ray-older"><span class="ms">history</span> ${msgs.length - shown.length} earlier messages are in storage — ask and Ray will retrieve them.</div>`);
      }
      /* User text is escaped; assistant text is model output and goes through
         the sanitiser — the same path a live answer takes, so a reloaded
         conversation looks identical to the one you just had. */
      shown.forEach((m) => this.bubble(m.role,
        m.role === 'assistant'
          ? Panel.thinkBlock(m.steps, m.ms) + `<div class="ray-answer">${renderAnswer(m.text)}</div>`
          : esc(m.text) + Panel.attachRow(m.attachments)));
    }

    /** A turn, not a chat bubble. Ray's answers are prose set flush in the
     *  column — no tinted balloon, no avatar column — with the mark shown once
     *  as a small byline. The user's own words get the quiet container, which
     *  is the only thing that needs distinguishing when you scan back. */
    /** The cards shown under a message that carried documents. */
    static attachRow(atts) {
      if (!atts || !atts.length) return '';
      return '<div class="ray-attrow">'
        + atts.map((a) => Panel.attCard(a, false)).join('') + '</div>';
    }

    bubble(role, html) {
      const body = this.$('body');
      const el = document.createElement('div');
      el.className = `ray-turn ${role}`;
      el.innerHTML = role === 'assistant'
        ? `<div class="ray-byline"><img src="${RAY_IMG}" alt="">Ray</div>`
          + `<div class="ray-bubble">${html}</div>`
        : `<div class="ray-bubble user">${html}</div>`;
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      return el;
    }

    /* ── Sending ─────────────────────────────────────────────────────────── */
    /** Type a question into the composer, then send it. Everything that asks
     *  on the user's behalf — a starter card, a page button, the demo runner —
     *  goes through here, so a question always arrives the way a typed one
     *  does. Skipped when the tab is hidden: nobody is watching it type. */
    async run(q) {
      if (this.busy) return null;
      if (this.view === 'list') this.setView('chat');
      this.show();
      const box = this.$('input');
      box.value = '';
      if (!document.hidden) {
        box.focus();
        const per = Math.max(8, Math.round(620 / Math.max(1, q.length)));
        for (let i = 1; i <= q.length; i++) {
          box.value = q.slice(0, i);
          await new Promise((r) => setTimeout(r, per));
        }
        await new Promise((r) => setTimeout(r, 240));
      }
      box.value = '';
      return this.ask(q);
    }

    async ask(q) {
      if (this.view === 'list') this.setView('chat');
      this.busy = true;
      const empty = this.$('body').querySelector('.ray-empty');
      if (empty) { empty.remove(); this.paintSurface(); }

      /* Attachments belong to the message, not to the session: they go with
         this turn, are recorded on it, and the tray clears. */
      const attached = this.attachments.slice();
      this.session.contextData.attachments = attached;
      this.attachments = [];
      this.attachOpen = false;
      this.paintAttachments();

      this.bubble('user', esc(q) + Panel.attachRow(attached), attached);

      /* A turn is a thinking block and an answer. The thinking runs live while
         tools execute, then folds to one line — the sync-up asked for the
         steps to be visible but not to compete with the result. */
      const turn = this.bubble('assistant', `
        <div class="ray-think working" data-think>
          <div class="ray-thinkhead" data-think-toggle>
            <span class="lbl">Working<span class="ell">…</span></span>
          </div>
          <div class="ray-steps"></div>
        </div>
        <div class="ray-answer"></div>`);
      const bub = turn.querySelector('.ray-bubble');
      this.stepBox = bub.querySelector('.ray-steps');
      const think = bub.querySelector('[data-think]');

      try {
        const out = await this.session.send(q);

        if (!out.toolCalls) think.remove();
        else {
          think.classList.remove('working');
          think.querySelector('.ray-thinkhead').innerHTML =
            `<span class="ms">chevron_right</span>`
            + `<span class="lbl">Thought for ${Math.max(0.1, out.ms / 1000).toFixed(1)}s · `
            + `${out.toolCalls} step${out.toolCalls === 1 ? '' : 's'}</span>`;
        }

        this.lastTrace = out;
        this.paintTrace();
        this.paintChrome();       // the session may have just earned its name
        await this.stream(bub.querySelector('.ray-answer'), renderAnswer(out.text));
        this.busy = false;
        return out;
      } catch (err) {
        think.remove();
        bub.querySelector('.ray-answer').innerHTML =
          `<span class="ray-deny"><span class="ms">error</span> ${esc(err.message)}</span>`;
      }
      this.busy = false;
      this.$('body').scrollTop = this.$('body').scrollHeight;
    }

    /* ── Streaming ───────────────────────────────────────────────────────
       The answer is HTML — citations, tables, action buttons — so it cannot be
       revealed by slicing a string. Instead the markup is built up front and
       its TEXT is filled in progressively: blocks of prose arrive word by word,
       structural blocks (a table, a draft, a button row) arrive whole, because
       a half-drawn table reads as a bug rather than as thinking.            */
    stream(target, html) {
      const token = (this.streamToken = (this.streamToken || 0) + 1);
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const blocks = Array.from(holder.childNodes);
      const body = this.$('body');
      const atBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 60;

      /* Pace by ELAPSED TIME, not by tick count. A background tab clamps
         setTimeout to ~1s, and a tick-counted stream would then crawl for a
         minute; measuring against the clock reveals proportionally more per
         tick and still lands on schedule. Same reason a dropped frame should
         never slow an animation down.                                       */
      const TICK = 24, TARGET_MS = 1700;
      const totalWords = (holder.textContent.match(/\S+/g) || []).length || 1;
      const deadline = Date.now() + TARGET_MS * 4;

      /* Nobody is watching a hidden tab, and Chrome throttles deeply nested
         timers there to once a minute — which would leave a half-written
         answer on screen when the user comes back. Render it whole instead. */
      const dump = (resolve) => {
        while (blocks.length) target.appendChild(blocks.shift());
        target.querySelectorAll('*').forEach(() => {});
        body.scrollTop = body.scrollHeight;
        resolve();
      };

      return new Promise((rawResolve) => {
        /* The deadline inside the tick only helps if a tick actually fires. A
           single un-nested timeout is not subject to the same throttling as a
           chain of them, so it is the one thing guaranteed to run — without it
           a stalled stream leaves an answer half-written with no way out. */
        let watchdog = null;
        const resolve = () => { if (watchdog) clearTimeout(watchdog); rawResolve(); };
        watchdog = setTimeout(() => {
          if (token === this.streamToken) dump(resolve); else resolve();
        }, TARGET_MS * 4);

        if (document.hidden) return dump(resolve);
        const nextBlock = () => {
          if (token !== this.streamToken) return resolve();   // superseded
          if (!blocks.length) return resolve();
          /* Belt and braces: never let a throttled or slow tab strand an
             answer mid-sentence. */
          if (document.hidden || Date.now() > deadline) return dump(resolve);
          const block = blocks.shift();
          const stick = atBottom();
          target.appendChild(block);
          if (stick) body.scrollTop = body.scrollHeight;

          const prose = block.nodeType === 1
            && /^(P|UL|OL|BLOCKQUOTE)$/.test(block.tagName);
          if (!prose) return setTimeout(nextBlock, 70);

          /* Blank every text node, then refill them in order. */
          const words = (block.textContent.match(/\S+/g) || []).length;
          const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
          const parts = [];
          let n;
          while ((n = walker.nextNode())) {
            if (n.nodeValue.trim()) { parts.push({ node: n, words: n.nodeValue.split(/(\s+)/) }); n.nodeValue = ''; }
          }
          const tokens = parts.reduce((sum, part) => sum + part.words.length, 0);
          const dur = Math.max(140, TARGET_MS * (words / totalWords));
          const t0 = Date.now();

          let pi = 0, wi = 0, shown = 0;
          const tick = () => {
            if (token !== this.streamToken) return resolve();
            if (document.hidden || Date.now() > deadline) {
              parts.forEach((part) => {          // finish this block outright
                while (wi < part.words.length) part.node.nodeValue += part.words[wi++];
                wi = 0;
              });
              return dump(resolve);
            }
            const want = Math.ceil(Math.min(1, (Date.now() - t0) / dur) * tokens);
            while (shown < want && pi < parts.length) {
              const part = parts[pi];
              if (wi >= part.words.length) { pi++; wi = 0; continue; }
              part.node.nodeValue += part.words[wi++];
              shown++;
            }
            if (atBottom()) body.scrollTop = body.scrollHeight;
            if (pi < parts.length) setTimeout(tick, TICK);
            else setTimeout(nextBlock, 30);
          };
          tick();
        };
        nextBlock();
      });
    }

    submit() {
      const input = this.$('input');
      const q = input.value.trim();
      if (!q || this.busy) return;
      input.value = '';
      this.ask(q);
    }

    onEvent(ev) {
      if (!this.stepBox) return;
      if (ev.type === 'thinking') {
        const box = this.$('body');
        box.scrollTop = box.scrollHeight;
      }
      if (ev.type === 'tool') {
        const t = ev.data;
        const line = document.createElement('div');
        line.className = 'ray-step ' + Panel.toolKind(t.name) + (t.ok ? '' : ' bad');
        line.innerHTML = `<span class="ms">${t.ok ? 'check_small' : 'block'}</span>`
          + `<code>${esc(t.name)}</code> <span>${esc(t.summary || '')}</span>`;
        this.stepBox.insertBefore(line, this.stepBox.querySelector('.ray-work'));
      }
    }

    /** The collapsed thinking block, rebuilt from a stored turn. Same markup
     *  a live turn folds into, so history and the moment it happened look the
     *  same. */
    static thinkBlock(steps, ms) {
      if (!steps || !steps.length) return '';
      const lines = steps.map((st) =>
        `<div class="ray-step ${Panel.toolKind(st.name)}${st.ok === false ? ' bad' : ''}">`
        + `<span class="ms">${st.ok === false ? 'block' : 'check_small'}</span>`
        + `<code>${esc(st.name)}</code> <span>${esc(st.summary || '')}</span></div>`).join('');
      return `<div class="ray-think" data-think>
          <div class="ray-thinkhead" data-think-toggle>
            <span class="ms">chevron_right</span>
            <span class="lbl">Thought for ${Math.max(0.1, (ms || 1400) / 1000).toFixed(1)}s · `
        + `${steps.length} step${steps.length === 1 ? '' : 's'}</span>
          </div>
          <div class="ray-steps">${lines}</div>
        </div>`;
    }

    /** Which family a tool belongs to — looking things up, reading them,
     *  planning, or writing. Drives the step colour. */
    static toolKind(name) {
      if (/^search_/.test(name)) return 'k-find';
      if (/^(read_|outline_|extract_)/.test(name)) return 'k-read';
      if (/^(plan_|list_|get_)/.test(name)) return 'k-plan';
      if (/^(create_|generate_)/.test(name)) return 'k-write';
      return 'k-plan';
    }

    /* ── Trace ───────────────────────────────────────────────────────────
       The receipts. Hidden unless the demo is in detail mode: valuable to a
       reviewer, noise to anyone looking at the design. */
    paintTrace() {
      const box = this.$('trace');
      const tr = this.lastTrace;
      if (!tr || !document.documentElement.classList.contains('dev')) {
        box.innerHTML = '';
        return;
      }
      const saved = Math.max(0, tr.naiveTokens - tr.tokens);
      const head = `<button class="ray-tracebtn" data-ray-trace-toggle>`
        + `<span class="ms">${this.traceOpen ? 'expand_more' : 'chevron_right'}</span>`
        + `How Ray answered · ${tr.toolCalls} tool call${tr.toolCalls === 1 ? '' : 's'} · ${tr.tokens} tokens`
        + (tr.denials ? ` · <b class="deny">${tr.denials} blocked</b>` : '')
        + `</button>`;
      if (!this.traceOpen) { box.innerHTML = head; return; }

      const ctx = tr.trace.find((t) => t.kind === 'context');
      const ctxRows = ctx ? ctx.parts.map((p) =>
        `<tr><td>${esc(p.label)}</td><td class="n">${p.tokens}</td></tr>`).join('') : '';
      const toolRows = tr.trace.filter((t) => t.kind === 'tool').map((t) =>
        `<tr class="${t.ok ? '' : 'bad'}"><td><code>${esc(t.name)}</code><div class="sub">${esc(t.summary || t.message || '')}</div></td>`
        + `<td class="n">${t.tokens}</td></tr>`).join('');

      box.innerHTML = head + `<div class="ray-tracebody">
        <div class="tsec">Context assembled this turn</div>
        <table class="ttbl"><tbody>${ctxRows}</tbody></table>
        ${ctx && ctx.withheld ? `<div class="tnote"><span class="ms">inventory_2</span> ${ctx.withheld} older message${ctx.withheld === 1 ? '' : 's'} (${ctx.withheldTokens} tokens) left in storage — retrievable on demand.</div>` : ''}
        <div class="tsec">Tools executed <span class="thint">every call passed the permission guard</span></div>
        <table class="ttbl"><tbody>${toolRows || '<tr><td>none</td><td class="n">0</td></tr>'}</tbody></table>
        <div class="tfoot"><b>${tr.tokens}</b> tokens used · a send-everything implementation would have spent <b>${tr.naiveTokens}</b>${saved ? ` · <span class="save">${saved} saved</span>` : ''} · ${tr.ms}ms</div>
      </div>`;
    }

    /* ── In-answer actions ───────────────────────────────────────────────── */
    action(kind, node) {
      if (kind === 'ask') { this.run(node.getAttribute('data-q')); return; }
      if (kind === 'insert') {
        const target = this.context.targetField && document.querySelector(this.context.targetField);
        const bub = node.closest('.ray-bubble');
        const draft = bub.querySelector('.ray-draft') || bub.querySelector('p');
        if (target && draft) {
          target.value = draft.textContent.trim();
          target.dispatchEvent(new Event('input'));
          toast('Inserted into ' + (this.context.field || 'the field'));
        } else toast('No editable field on this surface');
        return;
      }
      if (kind === 'topup') {
        toast('Opens billing — mocked for this prototype');
        return;
      }
      if (kind === 'library' || kind === 'seed-library') {
        const g = service.guard;
        try {
          global.RayPermissions.Repositories.responseLibrary.add(g, {
            question: 'Describe your approach to local content and social procurement.',
            answer: 'Drafted by Ray from the tender documents and prior responses…',
            category: 'Social', words: 358, lastUsed: null, winRate: null,
          });
          toast('Saved to the Response Library');
        } catch (err) { toast(err.message); }
        return;
      }
    }
  }

  /* ── Rendering model output ────────────────────────────────────────────
     Answers are light HTML (citations, tables, action buttons), so they cannot
     simply be escaped — but they are MODEL OUTPUT and must never be trusted as
     markup. Everything is put through an allow-list: unknown elements are
     unwrapped to their text, and every attribute outside the list is dropped,
     which kills `on*` handlers, `href`/`src`, and inline styles.

     Keep this in the Angular port. A bypassSecurityTrustHtml on a model string
     is the same bug with a longer name.                                     */
  const ALLOWED = {
    B: [], I: [], EM: [], STRONG: [], P: [], BR: [], UL: [], OL: [], LI: [],
    TABLE: [], THEAD: [], TBODY: [], TR: [], TH: [], TD: [], BLOCKQUOTE: [], CODE: [],
    SPAN: ['class'], DIV: ['class'], BUTTON: ['class', 'data-ray-action'],
  };

  function sanitize(html) {
    const root = new DOMParser()
      .parseFromString('<div id="r">' + html + '</div>', 'text/html')
      .getElementById('r');
    let dirty = true;
    while (dirty) {
      dirty = false;
      Array.from(root.querySelectorAll('*')).forEach((el) => {
        const allow = ALLOWED[el.tagName];
        if (!allow) {                    // unwrap: keep the words, drop the tag
          el.replaceWith.apply(el, Array.from(el.childNodes));
          dirty = true;
          return;
        }
        Array.from(el.attributes).forEach((a) => {
          if (allow.indexOf(a.name) === -1) el.removeAttribute(a.name);
        });
      });
    }
    return root.innerHTML;
  }

  /* ── Tiny markdown-ish renderer. The provider returns light HTML plus
       newlines; this only handles the newline/bullet shaping.            */
  function mdish(s) {
    return String(s)
      .split(/\n{2,}/)
      .map((p) => /^\s*<(table|ul|div|blockquote|button)/.test(p) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  /** The one way model text reaches the DOM. Tables get their own horizontal
   *  scroller: the rail is 420px and a squeezed table is unreadable. */
  function renderAnswer(text) {
    const html = sanitize(mdish(text));
    const holder = document.createElement('div');
    holder.innerHTML = html;
    holder.querySelectorAll('table').forEach((t) => {
      const wrap = document.createElement('div');
      wrap.className = 'ray-scrollx';
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
    return holder.innerHTML;
  }

  function toast(msg) {
    let t = document.getElementById('rayToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rayToast'; t.className = 'ray-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('on'), 2400);
  }

  /* ── Public API ────────────────────────────────────────────────────────── */
  const RayPanel = {
    init(svc) { service = svc; return this; },
    get service() { return service; },
    mount(opts) { const p = new Panel(opts); panels.push(p); return p; },
    get panels() { return panels; },
    get current() { return panels.find((p) => p.mode !== 'inline') || panels[0] || null; },

    /** Re-point Ray without opening it — what a page or a dialog calls when
     *  the user's attention moves. Silent if the rail is closed. */
    focus(surfaceId, context) {
      const p = this.current;
      return p ? p.focus(surfaceId, context) : null;
    },

    /** Focus and open. Use for an explicit "ask Ray about this" affordance. */
    open(surfaceId, context) {
      const p = this.current;
      if (!p) return null;
      if (surfaceId) p.focus(surfaceId, context);
      p.show();
      return p;
    },
    toggle() {
      const p = this.current;
      if (p) p.open ? p.hide() : p.show();
      return p;
    },
    toast,
  };

  global.RayPanel = RayPanel;
})(window);
