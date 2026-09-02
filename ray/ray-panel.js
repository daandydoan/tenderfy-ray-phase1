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

  /* Pages live at the root and under pages/ — resolve the artwork once.

     Ray has two marks. The compact one is Ray-as-affordance: the header chip
     and the reopen button, where he is a control you press. The full character
     is Ray-as-presence, and only earns the room once he has a side panel of
     his own — so the rail, its empty state and every reply he signs use it,
     while an inline panel folded into a dialog keeps the compact mark. */
  const ART = (/\/pages\//.test(location.pathname) ? '../' : '') + 'assets/';
  const RAY_IMG = ART + 'ray.svg';
  const RAY_FULL = ART + 'ray-panel.svg';
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /* How many chats "Recent" shows before it defers to its own chip. Enough
     to cover today's work without pushing Projects off the first screen. */
  const RECENT_CAP = 6;

  const OPEN_KEY = 'ray_rail_open';
  const WIDE_KEY = 'ray_rail_wide';
  const FORM_KEY = 'ray_form';       // 'dialog' | 'rail' — see setForm()
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} },
    getStr(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    setStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
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
         whole difference between "a chat on this page" and "Ray is open".
         It also opens **by default**: this is a demo of an agent, and making
         the first move a hunt for the Ray button buries the thing being
         demonstrated. Closing is still remembered, so anyone who shuts Ray
         keeps him shut — only a visitor with nothing stored gets the default. */
      this.open = this.mode === 'inline' ? true
        : this.opts.open != null ? this.opts.open
        : store.get(OPEN_KEY, true);
      this.wide = this.mode !== 'inline' && store.get(WIDE_KEY, false);
      /* How the panel presents itself. Ray opens **expanded**, as the rail:
         this is a demo of an agent that works alongside you, and opening
         collapsed sells that short. Collapsing to the dialog is a deliberate
         act, and it sticks. Inline embeds have no say — they are already
         inside something. */
      this.form = this.mode === 'inline' ? 'rail'
        : store.getStr(FORM_KEY, 'rail') === 'dialog' ? 'dialog' : 'rail';
      this.view = 'chat';            // 'list' | 'project' | 'chat'
      this.query = '';               // session search
      this.attachments = [];         // files pinned to the next message
      this.attachOpen = false;
      this.promptsOpen = false;
      this.wfOpen = false;
      /* Which of the platform's documents Ray is pointed at. null means "not
         chosen" — the tender's own documents stand in until the user edits
         the list, so the band is right before anyone has touched it. */
      this.refDocs = null;
      this.refPickOpen = false;
      this.stepOpen = false;      // the guide strip, shut until asked
      this.stepAt = null;         // stepper: which segment is being looked at
      this.openProject = null;      // the project whose page you are on
      this.listFilter = null;    // which project is expanded in the list
      this.guideOff = false;      // dismissed outright — only from expanded
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
        toast('Project deleted');
        this.paintChrome();
        return;
      }
      toast('Project deleted');
      this.paintChrome();
    }

    /** A new session records the tender it was started from, for provenance —
     *  nothing groups on it. */
    /** A chat belongs to a project when one is named, or to whatever tender
     *  Ray is currently pointed at. 'free' starts one deliberately outside
     *  any project — asking Ray something that is not about a bid. */
    newSession(tenderId) {
      if (global.rayEmptyDemo && global.rayToggleEmpty) global.rayToggleEmpty();
      const into = tenderId === 'free' ? null
        : tenderId != null ? tenderId : this.context.tenderId;
      if (into) this.openProject = into;
      const t = service.newThread(into);
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
      el.className = `ray-panel mode-${this.mode} form-${this.form} view-chat`
        + (this.open ? ' open' : '') + (this.wide ? ' wide' : '');
      el.id = 'rayPanel';
      el.innerHTML = `
        <div class="ray-head" data-ray="head"></div>
        <div class="ray-headbar" data-ray="headbar"></div>
        <div data-ray="progline"></div>
        <div class="ray-list" data-ray="list"></div>
        <div class="ray-body" data-ray="body"></div>
        <div class="ray-nextslot" data-ray="nextstep"></div>
        <!-- Outside the footer on purpose. Stacked in there with the credit
             notice, the reference band and the composer, the footer grew to
             half the panel and the conversation got what was left. Its own
             zone under the conversation keeps the two notices from reading as
             one wall of chrome. -->

        <div class="ray-trace" data-ray="trace"></div>
        <div class="ray-foot">
          <div class="ray-credit" data-ray="credit"></div>
          <div class="ray-sec input">
            <div class="ray-seclabel" data-ray="ctxlabel">Reference</div>
            <div class="ray-ctx" data-ray="ctx"></div>
            <!-- The two pickers are popovers anchored to the composer, opening
                 upward over the conversation. Inline they pushed the whole
                 input band down every time one was opened, which moved the
                 field out from under the cursor that had just clicked it. -->
            <div class="ray-composerwrap">
              <div class="ray-attpick" data-ray="attpick"></div>
              <div class="ray-attpick" data-ray="prompts"></div>
              <div class="ray-attpick" data-ray="refpick"></div>
              <div class="ray-attpick" data-ray="wfpick"></div>
              <form class="ray-composer" data-ray="composer">
                <!-- The left slot is the method, not a paperclip. Everything
                     Ray can be asked to do as a process starts here, which
                     gives the workflow a permanent home rather than living
                     only in whatever guidance form happens to be showing. -->
                <button type="button" class="ray-attach" data-ray-workflow
                        title="Start a workflow"><span class="ms">play_lesson</span></button>
                <textarea rows="1" placeholder="Reply to Ray…" data-ray="input"></textarea>
                <!-- Attach and saved prompts sit with Send: all three act on
                     the message you are about to send. -->
                <button type="button" class="ray-attach" data-ray-attach title="Attach a document">
                  <span class="ms">attach_file</span></button>
                <button type="button" class="ray-attach" data-ray-prompts title="Saved prompts">
                  <span class="ms">bookmark</span></button>
                <button type="submit" class="ray-send" title="Send"><span class="ms">arrow_upward</span></button>
              </form>
            </div>
            <!-- Attachment cards sit UNDER the composer: they are the tallest
                 thing in this band, and above the field they pushed the
                 reference chip away from the label it belongs to. -->
            <div class="ray-atts" data-ray="atts"></div>
            <input type="file" multiple hidden data-ray="file">
            <div class="ray-surfacebar" data-ray="surfacebar"></div>
          </div>
        </div>`;
      host.appendChild(el);
      this.el = el;
      this.$ = (n) => el.querySelector(`[data-ray="${n}"]`);

      /* The title bar is a size handle too. On a floating card, double-click
         is the move people try first; the icon is for those who don't. Guarded
         off the controls so a double-click on ⋯ or ✕ is not also a resize. */
      if (this.mode !== 'inline') {
        el.querySelector('[data-ray="head"]').addEventListener('dblclick', (e) => {
          if (e.target.closest('.ray-hbtn, .ray-back')) return;
          this.setForm(this.form === 'dialog' ? 'rail' : 'dialog');
        });
      }

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
      this.$('input').addEventListener('input', () => this.autosize());
      this.autosize();   // settle the one-line height before anything is typed

      /* The pickers stay open until their own button is pressed again. No
         click-outside, no Escape: they open *upward*, clear of the composer,
         so leaving one up costs nothing — you can read the list and type
         against it. Dismissing on an outside click made browsing the library
         a fight, since every click to see more closed the thing being read. */
      this.$('input').addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === 'Return') && !e.shiftKey) {
          e.preventDefault(); this.submit();
        }
      });

      el.addEventListener('click', (e) => {
        /* Clicking into the composer can mean "run the next scripted step" —
           the shell decides, and only ever when the field is empty, so typing
           your own question is never hijacked. */
        if (e.target.matches('[data-ray="input"]') && global.rayComposerActivate) {
          global.rayComposerActivate(this);
        }
        if (e.target.closest('[data-ray="close"]')) { this.hide(); return; }
        if (e.target.closest('[data-ray="expand"]')) { this.toggleWide(); return; }
        if (e.target.closest('[data-ray="toform"]')) {
          this.setForm(this.form === 'dialog' ? 'rail' : 'dialog'); return;
        }
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
          this.attachOpen = !this.attachOpen;
          this.promptsOpen = this.refPickOpen = this.wfOpen = false;
          this.paintPickers(); return;
        }
        if (e.target.closest('[data-ray-prompts]')) {
          this.promptsOpen = !this.promptsOpen;
          this.attachOpen = this.refPickOpen = this.wfOpen = false;
          this.paintPickers(); return;
        }
        const seg = e.target.closest('[data-ray-seg]');
        if (seg) { this.stepAt = +seg.getAttribute('data-ray-seg'); this.paintNextStep(); return; }
        const step = e.target.closest('[data-ray-step]');
        if (step) {
          global.rayStepRun(+step.getAttribute('data-ray-step'), this.context.tenderId);
          return;
        }
        /* The row toggles, but not when the press was for a control inside
           it — otherwise Start would expand the thing it is dismissing. */
        if (e.target.closest('[data-ray-step-toggle]')
            && !e.target.closest('[data-ray-step],[data-ray-skip],[data-ray-steps]')) {
          this.stepOpen = !this.stepOpen; this.paintNextStep(); return;
        }
        const skip = e.target.closest('[data-ray-skip]');
        if (skip) {
          global.rayStepSkip(+skip.getAttribute('data-ray-skip'), this.context.tenderId);
          return;
        }
        if (e.target.closest('[data-ray-go-responses]')) {
          global.rayGoResponses(); return;
        }
        /* The workflow button opens a picker in the composer, the way saved
           prompts do — choosing which of several methods to run is the same
           kind of small choice, and a modal to reach a modal was one screen
           too many. [data-ray-steps] comes from the guide, which is already
           inside a workflow, so it opens that one directly. */
        if (e.target.closest('[data-ray-workflow]')) {
          this.wfOpen = !this.wfOpen;
          this.attachOpen = this.promptsOpen = this.refPickOpen = false;
          this.paintPickers(); return;
        }
        const pick = e.target.closest('[data-ray-pick-wf]');
        if (pick) {
          this.wfOpen = false; this.paintPickers();
          global.rayStartWorkflow(pick.getAttribute('data-ray-pick-wf'),
                                  this.context.tenderId);
          return;
        }
        if (e.target.closest('[data-ray-steps]')) {
          global.rayStepsDialog(this.context.tenderId); return;
        }
        if (e.target.closest('[data-ray-guide-off]')) {
          this.guideOff = true; this.stepOpen = false; this.paintNextStep();
          toast('Guide hidden — reopen it from the header');
          return;
        }
        if (e.target.closest('[data-ray-guide-on]')) {
          this.guideOff = false; this.paintNextStep(); return;
        }
        const cp = e.target.closest('[data-ray-copy]');
        if (cp) { this.copyAnswer(cp); return; }
        const up = e.target.closest('[data-ray-prompt]');
        if (up) { this.usePrompt(up.getAttribute('data-ray-prompt')); return; }
        if (e.target.closest('[data-ray-prompt-save]')) { this.savePrompt(); return; }
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
        const roff = e.target.closest('[data-ray-ref-off]');
        if (roff) {
          const id = roff.getAttribute('data-ray-ref-off');
          this.refDocs = this.referenceDocs().map((d) => d.id).filter((x) => x !== id);
          this.paintContext();
          return;
        }
        const ron = e.target.closest('[data-ray-ref-on]');
        if (ron) {
          this.refDocs = this.referenceDocs().map((d) => d.id)
            .concat(ron.getAttribute('data-ray-ref-on'));
          this.paintContext();
          return;
        }
        if (e.target.closest('[data-ray-refpick]')) {
          this.refPickOpen = !this.refPickOpen;
          this.attachOpen = this.promptsOpen = this.wfOpen = false;
          this.paintAttachments(); this.paintPrompts(); this.paintRefPick();
          return;
        }
        const fil = e.target.closest('[data-ray-filter]');
        if (fil) {
          const k = fil.getAttribute('data-ray-filter');
          /* "Show all" only ever turns the filter on; a chip toggles it. */
          this.listFilter = (fil.classList.contains('ray-chip')
                             && this.listFilter === k) ? null : k;
          this.paintList();
          return;
        }
        const proj = e.target.closest('[data-ray-proj]');
        if (proj) {
          this.openProject = proj.getAttribute('data-ray-proj');
          this.setView('project');
          return;
        }
        const nin = e.target.closest('[data-ray-new-in]');
        if (nin) { this.newSession(nin.getAttribute('data-ray-new-in')); return; }
        if (e.target.closest('[data-ray-list]')) { this.goBack(); return; }
        const nw = e.target.closest('[data-ray-new]');
        if (nw) { this.newSession(nw.getAttribute('data-ray-new') || undefined); return; }

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
    /** The back chevron walks out one level. From a chat that belongs to the
     *  project you drilled into, that is the project page — landing back at
     *  the index would throw away the step you just took. */
    goBack() {
      if (this.view === 'chat' && this.openProject) {
        const t = service.threadIndex.get(service.guard.user.id, this.threadId);
        if (t && t.tenderId === this.openProject) { this.setView('project'); return; }
      }
      this.openProject = null;
      this.setView('list');
    }

    setView(view) {
      this.view = view;
      this.menuFor = this.renaming = this.confirmDelete = null;
      /* 'project' is a second list screen, not a third kind of thing: it
         shares the list container and hides the composer exactly as the
         index does. Only the contents differ. */
      this.el.classList.toggle('view-list', view !== 'chat');
      this.el.classList.toggle('view-chat', view === 'chat');
      this.paintHeader();
      if (view === 'chat') this.$('input').focus();
      else this.paintList();
    }

    /* The size controls, which differ by form. A dialog offers one move —
       become the rail. The rail offers two — widen, or fold back down. */
    /* The way back to a hidden guide. Only rendered while it is hidden, so
       it costs nothing the rest of the time — and it is in the header rather
       than where the strip was, because "closed" should mean closed. */
    guideBtn() {
      if (!this.guideOff || !this.context.tenderId || !global.rayStepList) return '';
      return `<span class="ms ray-hbtn" data-ray-guide-on
                    title="Show the guide">checklist</span>`;
    }

    formBtns() {
      if (this.mode === 'inline') return '';
      if (this.form === 'dialog') {
        return `<span class="ms ray-hbtn" data-ray="toform"
                      title="Expand to the side panel">open_in_full</span>`;
      }
      return `<span class="ms ray-hbtn" data-ray="toform"
                    title="Collapse to the chat dialog">close_fullscreen</span>`
           + `<span class="ms ray-hbtn" data-ray="expand" title="Widen">right_panel_open</span>`;
    }

    /* In dialog form Ray introduces himself, the way the co-pilot popup does:
       avatar, name, and the context underneath. In the rail the title is the
       project, because by then you know whose panel you are in. */
    idBlock(sub) {
      return `<span class="ray-ava"><img src="${this.mark}" alt=""></span>
              <div class="ray-title">Ray<span>${esc(sub)}</span></div>`;
    }

    paintHeader() {
      const head = this.$('head');
      const dialog = this.form === 'dialog' && this.mode !== 'inline';
      if (this.view === 'project') {
        head.innerHTML =
          `<span class="ms ray-back" data-ray-list title="All projects">chevron_left</span>`
          + (dialog ? this.idBlock(this.tenderName(this.openProject))
                    : `<div class="ray-title">${esc(this.tenderName(this.openProject))}</div>`)
          + `<span class="ms ray-hbtn" data-ray-new="${this.openProject}"
                   title="New chat in this project">add</span>`
          + this.formBtns()
          + `<span class="ms ray-hbtn" data-ray="close" title="Close Ray">close</span>`;
        return;
      }
      if (this.view === 'list') {
        head.innerHTML = (dialog
          ? this.idBlock('Tenderfy Co-Pilot')
          : `<span class="ray-halo"><img class="ray-mark" src="${this.mark}" alt=""></span>
             <div class="ray-title">Projects</div>
             ${this.betaTag}`)
          + `<span class="ms ray-hbtn" data-ray-new="free" title="New chat">add</span>`
          + this.formBtns()
          + `<span class="ms ray-hbtn" data-ray="close" title="Close Ray">close</span>`;
        return;
      }
      const t = service.threadIndex.get(service.guard.user.id, this.threadId);
      const name = t && !t.untitled ? t.title : 'New project';
      head.innerHTML =
        `<span class="ms ray-back" data-ray-list title="All projects">chevron_left</span>`
        + (dialog ? this.idBlock(name)
                  : `<div class="ray-title">${esc(name)}</div>${this.betaTag}`)
        + this.guideBtn()
        + `<span class="ms ray-hbtn" data-ray-menu="${this.threadId}" title="Project options">more_horiz</span>`
        + this.formBtns()
        + `<span class="ms ray-hbtn" data-ray="close" title="Close Ray">close</span>`;
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
    /** `icon` and `kind` are what separate a project's tile from a chat's.
     *  Both take the tender's hue; a project wears it as a tint and a chat
     *  as a fill, so the two never read as the same kind of thing. */
    static tile(thread, icon, kind) {
      const ic = icon || 'chat_bubble';
      const k = kind ? ` ${kind}` : '';
      const key = (thread && thread.tenderId) || '';
      if (!key || key === global.RayContext.NO_TENDER || !global.rayTenderColour) {
        return `<span class="ray-tile${k}"><span class="ms">${ic}</span></span>`;
      }
      /* Shared with the page chrome, so a tender is the same colour in Ray's
         list as it is on its own page. */
      return `<span class="ray-tile${k} ${global.rayTenderColour(key)}">`
        + `<span class="ms">${ic}</span></span>`;
    }

    /** The rename + delete affordances, shared by a list row and the session
     *  header. Inline rather than a popover: the list scrolls, and a floating
     *  menu near the bottom of a 420px rail clips. */
    static actions(id, renaming, confirming, title) {
      if (renaming) {
        return `<div class="ray-acts">
          <input class="ray-rename" data-ray-rename="${id}" value="${esc(title)}"
                 placeholder="Project name" maxlength="80">
          <button class="ray-mini pri" data-ray-rename-save="${id}">Save</button>
          <button class="ray-mini" data-ray-cancel>Cancel</button>
        </div>`;
      }
      if (confirming) {
        return `<div class="ray-acts warn">
          <span class="ray-actmsg">Delete this project and its messages?</span>
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
      let rows = global.rayEmptyDemo ? [] : service.allThreads();
      if (this.query) {
        const q = this.query.toLowerCase();
        rows = rows.filter((t) => (t.title + ' ' + (t.snippet || '')).toLowerCase().indexOf(q) >= 0);
      }

      /* Two levels. A project is a tender and holds the chats about it; the
         grouping key was already there — ThreadIndex has recorded `tenderId`
         on every thread since the start — so this is a query, not a
         migration. */
      const NONE = global.RayContext.NO_TENDER;
      const byTender = {};
      rows.forEach((t) => {
        const k = (!t.tenderId || t.tenderId === NONE) ? '' : t.tenderId;
        if (k) (byTender[k] = byTender[k] || []).push(t);
      });
      const ids = Object.keys(byTender).sort((a, b) =>
        (byTender[b][0].at || 0) - (byTender[a][0].at || 0));

      if (this.view === 'project') { this.paintProject(box, byTender); return; }

      let out = `
        <div class="ray-search">
          <span class="ms">search</span>
          <input type="text" placeholder="Search projects and chats" data-ray="q" value="${esc(this.query)}">
        </div>`;

      if (!rows.length) {
        out += `<div class="ray-listempty">
            <span class="ray-halo lg"><img class="ray-mark lg" src="${this.mark}" alt=""></span>
            <p class="ray-emptyhead">${this.query ? 'Nothing matches that' : 'Nothing here yet'}</p>
            <p class="ray-emptysub">${this.query
              ? 'Try a different word, or start a chat for it.'
              : 'Pick a tender to start a project, or just start chatting.'}</p>
            <button class="ray-act go" data-ray-new>
              <span class="ms">add</span>New chat</button></div>`;
        box.innerHTML = out;
        return;
      }

      /* Recent leads, and it is every chat by recency — a chat inside a
         project is still the one you had five minutes ago, and hiding it
         behind a drill-in would be the slowest possible route back to it. */
      const only = this.listFilter;
      const chip = (key, label, n) => `
        <button class="ray-chip${only === key ? ' on' : ''}" data-ray-filter="${key}">
          ${label}<span class="n">${n}</span></button>`;
      out += `
        <div class="ray-chips">
          ${chip('recent', 'Recent', rows.length)}
          ${chip('projects', 'Projects', ids.length)}
        </div>`;

      if (only !== 'projects') {
        /* Capped in the combined view so Projects stays above the fold.
           Nothing is lost — the chip opens the full list. */
        const cap = only === 'recent' ? rows.length : RECENT_CAP;
        out += `<div class="ray-group">Recent</div>`
             + rows.slice(0, cap).map((t) => this.chatRow(t, false)).join('');
        if (rows.length > cap) {
          out += `<button class="ray-showall" data-ray-filter="recent">
                    Show all ${rows.length} chats</button>`;
        }
      }

      if (ids.length && only !== 'recent') {
        out += `<div class="ray-group">Projects</div>`;
        ids.forEach((tid) => {
          const chats = byTender[tid];
          const steps = global.rayStepList;
          const done = steps ? global.rayStepsDone(tid) : 0;
          out += `
            <button class="ray-projrow" data-ray-proj="${tid}">
              ${Panel.tile({ tenderId: tid }, 'folder', 'proj')}
              <span class="ray-rowtx">
                <span class="ray-rowt">${esc(this.tenderName(tid))}</span>
                <span class="ray-rows">${chats.length} chat${chats.length === 1 ? '' : 's'}${
                  steps ? ` \u00b7 ${done} of ${steps.length} steps` : ''}</span>
              </span>
              <span class="ms car">chevron_right</span>
            </button>`;
        });
      }

      if (only === 'projects' && !ids.length) {
        out += `<p class="ray-nofilter">No projects yet. Open a tender and start
                a chat there to make one.</p>`;
      }
      box.innerHTML = out;
    }

    /** A tender's name, or a readable stand-in once it leaves your scope —
     *  the chats stay yours either way. */
    tenderName(tid) {
      try {
        const t = global.RayPermissions.Repositories.tenders.get(service.guard, tid);
        if (t) return t.name;
      } catch (e) { /* fall through */ }
      return 'A tender you can no longer read';
    }

    /** The project page: one tender's chats, and nothing else competing for
     *  the column. Reached by drilling in, left by the back chevron. */
    paintProject(box, byTender) {
      const tid = this.openProject;
      const chats = byTender[tid] || [];
      /* Deleting the last chat dissolves the project — there is no record of
         it apart from its chats, so there is nothing left to show. */
      if (!chats.length) { this.openProject = null; this.setView('list'); return; }
      const steps = global.rayStepList;
      const done = steps ? global.rayStepsDone(tid) : 0;
      box.innerHTML = `
        <div class="ray-projhead">
          ${Panel.tile({ tenderId: tid }, 'folder', 'proj')}
          <span class="ray-rowtx">
            <span class="ray-rowt">${esc(this.tenderName(tid))}</span>
            <span class="ray-rows">${chats.length} chat${chats.length === 1 ? '' : 's'}${
              steps ? ` \u00b7 ${done} of ${steps.length} steps` : ''}</span>
          </span>
        </div>
        <button class="ray-projnew" data-ray-new-in="${tid}">
          <span class="ms">add</span>New chat in this project</button>
        <div class="ray-group">Chats</div>
        ${chats.map((t) => this.chatRow(t, true)).join('')}`;
    }

    /* One chat row. `known` drops the tender tile for a dot: on a project
       page every chat carries the same tender, so the colour says nothing
       the header has not already said. */
    chatRow(t, known) {
      const open = this.menuFor === t.id;
      return `
        <div class="ray-rowwrap${open ? ' open' : ''}${known ? ' known' : ''}">
          <button class="ray-row${t.id === this.threadId ? ' on' : ''}" data-ray-thread="${t.id}">
            ${known ? '<span class="ray-rowdot"></span>' : Panel.tile(t)}
            <span class="ray-rowtx">
              <span class="ray-rowt">${esc(t.untitled ? 'New chat' : t.title)}</span>
              <span class="ray-rows">${esc(t.snippet || 'No messages yet')}</span>
            </span>
            <span class="ray-rowage">${t.at ? Panel.ago(t.at) : ''}</span>
          </button>
          <button class="ms ray-rowmenu" data-ray-menu="${t.id}" title="Chat options">more_horiz</button>
          ${open ? Panel.actions(t.id, this.renaming === t.id,
                                 this.confirmDelete === t.id,
                                 t.untitled ? '' : t.title) : ''}
        </div>`;
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
      const wasTender = this.context && this.context.tenderId;
      this.surfaceId = surfaceId || this.surfaceId;
      this.context = context || {};
      if (!this.context.crumb) this.context.crumb = this.pageCrumb;
      /* A hand-picked reference list belongs to the tender it was picked
         from. Moving to another one starts from that tender's documents
         rather than carrying over ids that are no longer readable. */
      if (this.context.tenderId !== wasTender) {
        this.refDocs = null;
        this.refPickOpen = false;
        this.guideOff = false;    // a different tender gets its guide back
      }
      /* Navigating changes what Ray is looking at, never which session you are
         in — the same way a Figma chat survives moving around a file. */
      this.session.setFocus(this.surfaceId, this.context);
      this.paintSurface();
      return this;
    }

    /* ── Attachments ─────────────────────────────────────────────────────
       Rendered below the composer. References are the platform documents Ray
       may read for the whole conversation; attachments are files sent with
       one message and read first. Two different things, so they do not share
       a row.
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
          <span class="meta"><span class="nm">${esc(a.name)}</span><span class="kind">${esc(meta)}</span></span>
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
    /* Four pickers share the band above the composer and only one may be
       open. Repainting them together is what keeps that true — adding a
       fifth to one branch and forgetting another is how they drift apart. */
    paintPickers() {
      this.paintAttachments(); this.paintPrompts();
      this.paintRefPick(); this.paintWorkflows();
    }

    /** The workflows this business can run, in the same shape as the saved
     *  prompt list: pick one and it opens. */
    paintWorkflows() {
      const box = this.$('wfpick');
      if (!box) return;
      if (!this.wfOpen) { box.innerHTML = ''; return; }
      let rows = [];
      try {
        rows = global.RayPermissions.Repositories.workflows
          .list(service.guard).filter((w) => w.active !== false);
      } catch (e) { rows = []; }
      const cur = global.rayActiveWorkflow && global.rayActiveWorkflow();
      box.innerHTML = `<div class="ray-pickhead">Start a workflow</div>`
        + (rows.length ? rows.map((w) => `
            <div class="ray-promptrow">
              <button class="ray-pickrow${cur && cur.id === w.id ? ' on' : ''}"
                      data-ray-pick-wf="${w.id}">
                <span class="ms">play_lesson</span>
                <span class="t">${esc(w.name)}<span class="s">${
                  w.steps.length} step${w.steps.length === 1 ? '' : 's'} · ${
                  esc(w.description)}</span></span>
              </button>
            </div>`).join('')
          : '<div class="ray-pickempty">No workflows yet.</div>');
    }

    paintPrompts() {
      const box = this.$('prompts');
      if (!this.promptsOpen) { box.innerHTML = ''; return; }
      const guard = service.guard;
      let rows = [];
      /* Only live prompts. Switching one off in the AI Manager is how you
         retire it without losing the wording, so an inactive row must not
         still be offered here. */
      try {
        rows = global.RayPermissions.Repositories.promptLibrary.list(guard)
          .filter((r) => r.active !== false);
      } catch (e) { rows = []; }
      const canWrite = guard.scopes.indexOf('prompt_library.write') >= 0;
      const draft = (this.$('input').value || '').trim();

      /* Pick one, or save what you have typed. Nothing here removes a prompt:
         the library is managed on its own screen, and a destructive control
         one mis-click from the send button is not worth the convenience. */
      box.innerHTML = `<div class="ray-pickhead">Saved prompts</div>`
        + (rows.length ? rows.map((r) => `
            <div class="ray-promptrow">
              <button class="ray-pickrow" data-ray-prompt="${r.id}">
                <span class="ms">bookmark</span>
                <span class="t">${esc(r.label)}<span class="s">${esc(r.text)}</span></span>
              </button>
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
        this.paintPrompts();      // stays open — the button is the only way out
        this.autosize();
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      } catch (err) { toast(err.reason || err.message); }
    }

    /** Copy the answer as plain text — what someone pasting into a tender
     *  response actually wants, not the markup or the reasoning steps.
     *  execCommand is the fallback: the async clipboard needs a secure
     *  context and a permission that can be refused. */
    copyAnswer(btn) {
      const turn = btn.closest('.ray-turn');
      const body = turn && turn.querySelector('.ray-answer');
      if (!body) return;
      const text = (body.innerText || '').trim();
      const done = () => {
        btn.classList.add('done');
        btn.querySelector('.ms').textContent = 'check';
        setTimeout(() => {
          btn.classList.remove('done');
          const ic = btn.querySelector('.ms');
          if (ic) ic.textContent = 'content_copy';
        }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => this.copyFallback(text, done));
      } else {
        this.copyFallback(text, done);
      }
    }
    copyFallback(text, done) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
      } catch (e) { toast('Could not copy — select the text instead'); }
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

    /* ── Reference chip ──────────────────────────────────────────────────
       What Ray is being told to look at, named and dismissible — the Figma
       selection pattern the sync-up asked for. Dismissing does not shrink what
       Ray may reach; it stops the page being assumed.

       Called "reference" in the UI, not "context": context already means the
       assembled prompt in §2, and having one word for both made every
       conversation about it ambiguous.                                     */
    /** A trail, not a label: where you are, then what Ray is pointed at inside
     *  it. The root comes from the page's own breadcrumb so the chip and the
     *  header agree; the leaves come from the context, because they are the
     *  specific thing — the tender, the open document, the field. */
    /* ── References ──────────────────────────────────────────────────────
       What Ray is pointed at is a set of the platform's own documents, not
       the screen you happen to be on. A page tells you where you are; it
       does not tell Ray what to read. Removing a chip narrows the card, so
       the band is a control rather than a status line.                     */
    availableDocs() {
      try {
        return global.RayPermissions.Repositories.documents
          .list(service.guard, this.context.tenderId || null);
      } catch (e) { return []; }
    }

    referenceDocs() {
      const all = this.availableDocs();
      if (this.refDocs === null) return all;         // untouched: everything readable
      const want = this.refDocs;
      return all.filter((d) => want.indexOf(d.id) >= 0);
    }

    /* The card names exactly what the chips show — otherwise the band would
       be decoration and Ray would still read what the user removed. */
    syncReferences() {
      if (this.session) this.session.contextData.documents = this.referenceDocs();
    }

    static docIcon(kind) {
      return kind === 'xlsx' ? 'table_chart'
           : kind === 'docx' ? 'description' : 'picture_as_pdf';
    }

    paintContext() {
      const box = this.$('ctx');
      /* A surface can hand Ray something that is not a document. The Responses
         screen hands him the rows you ticked, and those are the reference —
         showing that tender's files instead would be answering a question
         nobody asked. Ticking is the control here, so no × on the chips. */
      const picked = this.context.responses || [];
      /* On the Responses screen the reference is whatever is ticked, and
         nothing else. Falling through would list every document in the
         business — true, but not an answer to anything being asked here. */
      if (!picked.length && this.surfaceId === 'response-library') {
        this.$('ctxlabel').style.display = 'none';
        box.innerHTML = '';
        if (this.session) this.session.contextData.documents = [];
        return;
      }
      if (picked.length) {
        this.$('ctxlabel').style.display = '';
        if (this.session) this.session.contextData.documents = [];
        box.innerHTML = picked.map((r) => `
          <span class="ray-ctxchip" title="${esc(r.q)}">
            <span class="ms">auto_awesome</span>
            <span class="t"><span class="seg">${esc(r.q)}</span></span>
          </span>`).join('');
        this.paintRefPick();
        return;
      }
      const docs = this.referenceDocs();
      const spare = this.availableDocs().length - docs.length;
      this.syncReferences();
      this.$('ctxlabel').style.display = '';

      const chips = docs.map((d) => `
        <span class="ray-ctxchip" title="${esc(d.name)} — ${d.pages} pages${d.scanned ? ', scanned' : ''}">
          <span class="ms">${Panel.docIcon(d.kind)}</span>
          <span class="t"><span class="seg">${esc(d.name)}</span></span>
          <button class="ray-ctxx" data-ray-ref-off="${d.id}" title="Stop referencing this document">
            <span class="ms">close</span></button>
        </span>`).join('');

      const add = (spare > 0 || !docs.length)
        ? `<button class="ray-ctxadd" data-ray-refpick>
             <span class="ms">add</span>${docs.length ? 'Add document' : 'Add a document as reference'}</button>`
        : '';

      box.innerHTML = chips + add
        || '<span class="ray-ctxnone">No documents on this tender you can read.</span>';
      if (!box._ovBound) {
        box.addEventListener('scroll', () => this.markCtxOverflow(), { passive: true });
        box._ovBound = true;
      }
      this.markCtxOverflow();
      this.paintRefPick();
    }

    /* A hidden scrollbar still has to say there is more. The fade is driven
       from the actual scroll position, so it appears only on the end that
       genuinely has something behind it and disappears when you reach it. */
    markCtxOverflow() {
      const box = this.$('ctx');
      if (!box) return;
      const more = box.scrollWidth - box.clientWidth;
      box.classList.toggle('more-l', box.scrollLeft > 2);
      box.classList.toggle('more-r', more > 2 && box.scrollLeft < more - 2);
    }

    paintRefPick() {
      const pick = this.$('refpick');
      if (!pick) return;
      if (!this.refPickOpen) { pick.innerHTML = ''; return; }
      const shown = this.referenceDocs().map((d) => d.id);
      const rows = this.availableDocs().filter((d) => shown.indexOf(d.id) === -1);
      pick.innerHTML = `<div class="ray-pickhead">Documents on this tender</div>`
        + (rows.length ? rows.map((d) => `
            <button class="ray-pickrow" data-ray-ref-on="${d.id}">
              <span class="ms">${Panel.docIcon(d.kind)}</span>
              <span class="t">${esc(d.name)}<span class="s">${d.pages} pages${d.scanned ? ' · scanned' : ''}</span></span>
            </button>`).join('')
          : '<div class="ray-pickempty">Everything you can read here is already referenced.</div>');
    }

    paintCredits() {
      const box = this.$('credit');
      const c = service.credits();
      /* Shown when the demo asks for it, not whenever the number drifts past
         a threshold — see applyCredits(). */
      if (!global.rayCreditsDemo) { box.innerHTML = ''; return; }
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
      const hint = global.rayComposerHint && global.rayComposerHint(this);
      this.$('input').placeholder = hint ? hint
        : s.id === 'edit-dialog' ? 'Ask Ray to draft, tighten or reuse…'
        : started ? 'Reply to Ray…' : 'Ask Ray anything…';
      this.paintContext();
      this.paintCredits();
      this.paintAttachments();
      this.paintPrompts();
      /* The empty state depends on what Ray is pointed at — the path only
         exists once there is a tender — and focus() lands here after the
         first paint, so it has to be redrawn. Only while it IS the empty
         state: a conversation must never be repainted out from under you. */
      if (this.session && !this.session.history().length
          && this.$('body').querySelector('.ray-empty')) this.greet();
      this.paintNextStep();
    }

    /* ── Visibility ──────────────────────────────────────────────────────
       The shell owns the width as a custom property; everything that must
       reflow (content, and any modal that should stop short of the rail)
       reads --rail-w rather than knowing about Ray.                        */
    /* Both of these say the same thing: the full character and the Beta tag
       belong to Ray-as-a-place. A dialog is Ray-as-a-control you summoned, and
       so is an inline embed — they get the compact head and no tag. */
    get isPanel() { return this.mode !== 'inline' && this.form === 'rail'; }
    get mark() { return this.isPanel ? RAY_FULL : RAY_IMG; }
    get betaTag() { return this.isPanel ? '<span class="ray-beta">Beta</span>' : ''; }

    applyLayout() {
      if (this.mode === 'inline') return;
      /* A dialog floats over the page, so it reserves nothing: --rail-w stays
         0 and the content keeps its full width. Only the rail pushes. */
      const floats = this.form === 'dialog';
      const w = (!this.open || floats) ? '0px' : (this.wide ? '640px' : '420px');
      if (this.shell) this.shell.style.setProperty('--rail-w', w);
      /* Mirrored onto <html> so page-level fixed furniture — the review
         float — can sit clear of the rail. --rail-w lives on .capp, which a
         body-level element cannot inherit from. */
      document.documentElement.style.setProperty('--ray-rail', w);
      document.documentElement.classList.toggle('ray-rail-open', this.open && !floats);
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

    /** Promote the dialog to the rail, or collapse it back. Nothing about the
     *  conversation moves: it is one panel, one thread, one session, wearing a
     *  different shape. The history is repainted only because the mark and the
     *  Beta tag are read at render time — and never mid-answer, which would
     *  drop the turn being streamed. */
    setForm(form) {
      if (this.mode === 'inline' || form === this.form) return;
      this.form = form;
      this.el.classList.toggle('form-dialog', form === 'dialog');
      this.el.classList.toggle('form-rail', form === 'rail');
      store.setStr(FORM_KEY, form);
      this.applyLayout();
      this.paintHeader();
      if (!this.busy) this.paintHistory();
      toast(form === 'rail' ? 'Ray expanded to the side panel'
                            : 'Ray collapsed to the chat dialog');
    }

    /* ── Messages ────────────────────────────────────────────────────────── */
    /** The blank-conversation state. One line, then the things worth asking —
     *  no greeting bubble pretending a conversation has started. */
    /* ── Guiding, in the conversation ────────────────────────────────────
       A checklist in a panel is something you have to notice and read. For
       someone who is not going to phrase a prompt, the thing that works is
       being offered the next move where they are already looking — inside
       the conversation, as the last thing Ray said.

       So the path is not a sidebar. It is one card, always the next step,
       appearing under whatever Ray just answered.                          */
    nextStepCard() {
      const id = this.context.tenderId;
      const steps = global.rayStepList;
      if (!id || !steps) return '';
      const done = global.rayStepsDone(id);
      if (done >= steps.length) {
        /* Same .ray-nextrow as the live state: .ray-nextbar itself is a block
           that expects a row inside it, so bare children stack. */
        return `<div class="ray-nextbar done">
            <div class="ray-nextrow">
              <span class="ray-wintick sm"><span class="ms">check</span></span>
              <span class="t"><strong>All ${steps.length} stages complete</strong></span>
              <button class="ray-nextlink" data-ray-steps>See what we did</button>
              <button class="ray-nextgo" data-ray-go-responses>Review</button>
            </div>
          </div>`;
      }
      const st = steps[done];
      const open = this.stepOpen;
      const pct = Math.round(done / steps.length * 100);
      /* Three depths, and each earns its place. Shut, it is one line saying
         what is next — enough to act on, small enough to ignore. Open, it
         says why, how far along you are and what follows, which is the
         orientation people want before committing to a step. The whole
         guide, with what each step actually does, stays in a dialog: that is
         reference, and reference does not belong in the footer. */
      const more = !open ? '' : `
        <div class="ray-nextmore">
          <p class="d">${esc(st.long || st.d)}</p>
          ${steps[done + 1] ? `<p class="then">Then: ${esc(steps[done + 1].n)}${
            steps[done + 2] ? ` → ${esc(steps[done + 2].n)}` : ''}</p>` : ''}
          <div class="ray-nextlinks">
            <button class="ray-nextlink" data-ray-skip="${done}">Skip this step</button>
            <button class="ray-nextlink" data-ray-steps>See all ${steps.length} steps</button>
            <button class="ray-nextlink off" data-ray-guide-off>Hide the guide</button>
          </div>
        </div>`;
      /* The meter is outside the collapse: how far along you are is the one
         thing worth knowing without opening anything, and as a line on the
         bottom edge it costs no height and no width. */
      return `<div class="ray-nextbar${open ? ' open' : ''}">
          <div class="ray-nextrow" data-ray-step-toggle>
            <span class="ms">arrow_forward</span>
            <span class="t"><b>Next · ${done + 1} of ${steps.length}</b> ${esc(st.n)}</span>
            <span class="ms caret">expand_more</span>
            <button class="ray-nextgo" data-ray-step="${done}"${this.busy ? ' disabled' : ''}>Start</button>
          </div>
          ${more}
          <div class="ray-nextmeter" title="${done} of ${steps.length} done">
            <i style="width:${pct}%"></i></div>
        </div>`;
    }

    /* ── Guidance as dialogue ────────────────────────────────────────────
       The other way to show this. Instead of a control docked above the
       composer, Ray simply says what he can do next, in his own voice, at
       the end of what he just said — the way a person who was helping you
       would. There is no card, no border and no chrome: it is a sentence and
       two things to press.

       The bet is that a bid coordinator reads Ray's answer to the end and
       stops there. Anything docked below that is furniture they have to
       learn to look at; a sentence in the same column as the answer is just
       the next thing he said.                                              */
    offerLine() {
      const id = this.context.tenderId;
      const steps = global.rayStepList;
      if (!id || !steps || this.guideOff) return '';
      const done = global.rayStepsDone(id);
      /* Finishing should land. Eight stages of a bid is a real piece of work
         and the panel said "All 8 steps done" in the same grey as everything
         else — true, and completely flat. */
      if (done >= steps.length) {
        let tn = null;
        try { tn = global.RayPermissions.Repositories.tenders.get(service.guard, id); }
        catch (e) {}
        return `<div class="ray-offerline">
            <div class="ray-win">
              <span class="ray-wintick"><span class="ms">check</span></span>
              <div class="t"><b>That's the whole method</b>
                <span>${esc(tn ? tn.name : 'This tender')} has been through all
                  ${steps.length} stages — assessed, planned, written, built and
                  checked. It's ready for your final approval.</span></div>
            </div>
            <div class="ray-offeracts">
              <button class="ray-offergo" data-ray-go-responses>Review the tender</button>
              <button class="ray-offerlink" data-ray-steps>See what we did</button>
            </div>
          </div>`;
      }
      const st = steps[done];
      const first = done === 0;
      /* `say` is a clause, not a label: this is Ray speaking, and a subtitle
         dropped into a sentence reads as a fragment.

         He offers to do the work rather than asking whether he may. That is
         the brief's model — Ray completes the majority of it, the human
         guides, reviews and approves — and "Would you like me to…?" put the
         work back on the person the whole thing exists to take it off. The
         approval has not gone anywhere: it moved to the button, which is
         where a human in the loop actually belongs. */
      const line = esc(st.say || st.d.toLowerCase());
      const pct = Math.round(done / steps.length * 100);
      return `<div class="ray-offerline">
          <p>${first ? `Let me ${line}.` : `Next, let me ${line}.`}</p>
          <div class="ray-offerprog">
            <span>Step ${done + 1} of ${steps.length}</span>
            <div class="ray-offermeter"><i style="width:${pct}%"></i></div>
          </div>
          <div class="ray-offeracts">
            <button class="ray-offergo" data-ray-step="${done}"${this.busy ? ' disabled' : ''}>
              Go ahead</button>
            <button class="ray-offerlink" data-ray-skip="${done}">Skip</button>
            <button class="ray-offerlink" data-ray-steps>See all ${steps.length} steps</button>
            <button class="ray-offerlink off" data-ray-guide-off>Stop suggesting</button>
          </div>
        </div>`;
    }

    /* ── Guidance as a stepper ───────────────────────────────────────────
       The third way. Both others live at the bottom, near the composer, and
       both show one step at a time. This shows the whole method at once,
       pinned under the header where it cannot scroll away.

       That matters for what the brief actually asks of this: the saved
       prompts are how someone is "introduced to the Tenderfy Method and
       taken through all the relevant steps". You cannot learn a method from
       a control that only ever names the next thing.

       Eight segments, because eight labels will not fit in 420px — the
       segments carry position, the line beneath carries the name.          */
    stepperBar() {
      const id = this.context.tenderId;
      const steps = global.rayStepList;
      if (!id || !steps || this.guideOff) return '';
      const done = global.rayStepsDone(id);
      const at = Math.min(this.stepAt == null ? done : this.stepAt, steps.length - 1);
      const st = steps[at];
      const finished = done >= steps.length;
      const segs = steps.map((x, i) => {
        const state = i < done ? 'done' : i === done ? 'now' : 'next';
        /* The ring marks what you are browsing, which is meaningless once
           every stage is done and nothing is "next". */
        const ring = !finished && i === at ? ' at' : '';
        return `<button class="ray-seg ${state}${ring}"
                        data-ray-seg="${i}" title="${esc((i + 1) + '. ' + x.n)}"></button>`;
      }).join('');
      const isNext = at === done;
      if (done >= steps.length && this.stepAt == null) {
        return `<div class="ray-stepper done">
            <div class="ray-segs">${segs}</div>
            <div class="ray-stepnow">
              <span class="ray-wintick sm"><span class="ms">check</span></span>
              <span class="t"><strong>All ${steps.length} stages complete</strong></span>
              <button class="ray-nextlink" data-ray-steps>See what we did</button>
              <button class="ray-nextgo" data-ray-go-responses>Review</button>
            </div>
          </div>`;
      }
      return `<div class="ray-stepper">
          <div class="ray-segs">${segs}</div>
          <div class="ray-stepnow">
            <span class="t"><b>${at + 1}</b> ${esc(st.n)}${
              at < done ? ' <span class="tick ms">check</span>' : ''}</span>
            <button class="ray-nextlink" data-ray-steps>Details</button>
            ${isNext ? `<button class="ray-nextlink" data-ray-skip="${done}">Skip</button>` : ''}
            <button class="ray-nextgo" data-ray-step="${at}"${this.busy ? ' disabled' : ''}>${
              at < done ? 'Again' : 'Start'}</button>
          </div>
        </div>`;
    }

    /* Orientation, with no content cost: a hairline under the header. It is
       the one thing worth knowing at a glance, and it does not need words. */
    paintProgress() {
      const box = this.$('progline');
      if (!box) return;
      const id = this.context.tenderId;
      const steps = global.rayStepList;
      if (!id || !steps || this.view === 'list' || this.guideOff
          || global.rayGuideStyle !== 'chat') { box.innerHTML = ''; return; }
      const done = global.rayStepsDone(id);
      box.innerHTML = `<div class="ray-progline" title="${done} of ${steps.length} steps done">
          <i style="width:${Math.round(done / steps.length * 100)}%"></i></div>`;
    }

    /* Kept in its own slot under the conversation so it survives a history
       repaint and never becomes a message — it is an offer, not something
       Ray said, and it must not end up in the scrollback twice. */
    /* Lives at the end of the conversation, inside the body — it reads as
       part of what Ray said. It is still never persisted: paintHistory
       rebuilds the turns from storage and then calls this, so the offer is
       always the current one and old offers never pile up in the scrollback. */
    /** Two presentations of the same thing, switched from the app header so
     *  they can be put side by side in a demo:
     *
     *    strip — a control docked below the conversation. Always in the same
     *            place, always visible, and unmistakably a piece of UI.
     *    chat  — Ray says what he can do next at the end of what he just
     *            said. No chrome; it reads as him talking.
     *
     *  Neither is persisted. The old offer is removed before the new one is
     *  drawn, so it is always the current step and the scrollback never
     *  fills with stale suggestions. */
    /* Looking at an earlier segment is browsing, not a new position — the
       moment the list advances, the stepper goes back to pointing at what is
       actually next. */
    resetStepAt() { this.stepAt = null; }

    paintNextStep() {
      const body = this.$('body');
      const slot = this.$('nextstep');
      /* The greeting states progress too, so it has to move with it —
         otherwise it sits there saying "6 of 8" under a guide that says the
         method is finished. Only while it IS the greeting: never repaint a
         conversation someone is reading. */
      if (body && this.session && !this.session.history().length
          && body.querySelector('.ray-empty') && !this._regreet) {
        this._regreet = true;          // greet() calls back into here
        this.greet();
        this._regreet = false;
        return;
      }
      const stale = body && body.querySelector('.ray-offerline');
      if (stale) stale.remove();
      if (slot) slot.innerHTML = '';
      this.paintProgress();
      this.paintHeader();          // the way back in lives in the header
      if (this.view === 'list') return;
      if (global.rayGuideStyle === 'steps') {
        const bar = this.$('progline');
        if (bar) bar.innerHTML = this.stepperBar();
        return;
      }
      if (global.rayGuideStyle === 'chat') {
        const html = this.offerLine();
        if (html && body) body.insertAdjacentHTML('beforeend', html);
        return;
      }
      if (slot && !this.guideOff) slot.innerHTML = this.nextStepCard();
    }

    greet() {
      const g = service.guard;
      const s = global.RaySurfaces.resolve(this.surfaceId);
      const n = service.registry.countsFor(s, g);
      const id = this.context.tenderId;
      const steps = global.rayStepList;

      /* Bottom-aligned, not centred. An empty panel is mostly empty space,
         and the greeting belongs next to the thing you type into rather than
         floating in the middle of nothing — it also puts it directly above
         whichever guidance form is showing, so the two read as one block. */
      if (id && steps) {
        let t = null;
        try { t = global.RayPermissions.Repositories.tenders.get(g, id); } catch (e) {}
        const done = global.rayStepsDone(id);
        const name = esc(t ? t.name : 'this tender');
        /* Ad-hoc questions, deliberately not the eight: the guide already
           offers the method, so these are the "or just ask me something"
           half. Repeating a step here would make the panel look like it is
           offering the same thing twice. */
        const asks = [
          'What insurance is required?',
          'What changed in Addendum 2?',
          'What are the evaluation criteria?',
        ];
        this.$('body').innerHTML = `
          <div class="ray-empty">
            <span class="ray-halo lg"><img class="ray-mark lg" src="${this.mark}" alt=""></span>
            <h3>How can Ray help?</h3>
            <p>${done >= steps.length
                 ? `<b>${name}</b> has been through all ${steps.length} stages.`
                 : done
                 ? `You're <b>${done} of ${steps.length}</b> of the way through <b>${name}</b>.`
                 : `Let's work through <b>${name}</b>. There are ${steps.length} steps,
                    and I'll offer the next one each time.`}
               <br>You can also just ask me anything about it.</p>
            <div class="ray-starters">
              ${asks.map((q) =>
                `<button class="ray-starter" data-ray-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
            </div>
          </div>`;
        this.paintNextStep();
        return;
      }

      this.$('body').innerHTML = `
        <div class="ray-empty">
          <span class="ray-halo lg"><img class="ray-mark lg" src="${this.mark}" alt=""></span>
          <h3>How can Ray help?</h3>
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
            + Panel.turnFoot(m.at)
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
        ? `<div class="ray-byline"><img src="${this.mark}" alt="">Ray</div>`
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
          this.autosize();
          await new Promise((r) => setTimeout(r, per));
        }
        await new Promise((r) => setTimeout(r, 240));
      }
      box.value = '';
      this.autosize();
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
        /* Added once the answer has finished arriving, so the copy control
           never offers a half-streamed answer and the time is the moment Ray
           actually finished rather than when it started. */
        bub.insertAdjacentHTML('beforeend', Panel.turnFoot(Date.now()));
        this.busy = false;
        this.paintNextStep();
        this.$('body').scrollTop = this.$('body').scrollHeight;
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

    /** Grow the composer to fit what has been typed, up to the CSS cap.
     *  Height must be cleared before reading scrollHeight — otherwise the
     *  box can only ever grow, never shrink back when text is deleted. */
    autosize() {
      const box = this.$('input');
      if (!box) return;
      /* Empty goes back to the natural single row. Measuring an empty box
         sizes it to the *placeholder*, so a long one — the demo's "Click to
         run step 3 of 8…" — would leave the composer two lines tall with
         nothing typed in it, eating the space this is meant to save. */
      if (!box.value) { box.style.height = ''; return; }
      box.style.height = 'auto';
      box.style.height = box.scrollHeight + 'px';
    }

    submit() {
      const input = this.$('input');
      const q = input.value.trim();
      if (!q || this.busy) return;
      input.value = '';
      this.autosize();
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
    /** The row under a finished answer: copy it, and when it was said.
     *  Absent while a turn is still streaming — there is nothing to copy
     *  yet, and a timestamp on an unfinished answer would be a guess. */
    static turnFoot(at) {
      const d = new Date(at || Date.now());
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="ray-turnfoot">
          <button class="ray-copy" data-ray-copy title="Copy this answer">
            <span class="ms">content_copy</span></button>
          <span class="ray-time">${esc(time)}</span>
        </div>`;
    }

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
        `<tr class="${t.ok ? '' : 'bad'}"><td><code>${esc(t.name)}</code><div class="tsub">${esc(t.summary || t.message || '')}</div></td>`
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
      if (kind === 'responses') {
        const to = (/\/pages\//.test(location.pathname) ? '' : 'pages/') + 'responses.html';
        location.href = to;
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
