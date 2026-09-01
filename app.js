/* ═══════════════════════════════════════════════════════════════════════════
   Shell — contractor chrome, the demo role switcher, and the single place the
   Ray service is constructed.

   Note what a page does NOT do: it never builds a Ray, never calls a model,
   never fetches a document. It declares where the user's attention is, and the
   site rail picks that up. That is the whole of §1.

       window.PAGE = {
         nav:'tenders', crumb:'Tenders • Tender Details',
         ray:{ surface:'tender', context:{ tenderId:'t-envind' } }
       };

   The rail is mounted once per page load, restores its own open state, and
   attaches to the ONE site conversation for this user — so navigating carries
   the thread with you instead of starting a new one.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* Two pages. The rest of the contractor nav is present so the chrome reads
     as the real app, but only these two are built — the demo is about Ray, and
     five more screens were five more things to explain. */
  const NAV = [
    { key: 'dashboard', icon: 'desktop_mac', label: 'Dashboard', href: 'index.html' },
    { key: 'tenders',   icon: 'domain',      label: 'Tenders',   href: 'pages/tenders.html' },
    { key: 'responses', icon: 'auto_awesome', label: 'Responses', href: 'pages/responses.html' },
    { key: null, icon: 'chat',                 label: 'Messages' },
    { key: null, icon: 'insert_drive_file',    label: 'Documents' },
    { key: null, icon: 'contacts',             label: 'Contacts' },
    { key: null, icon: 'manage_accounts',      label: 'Manage Staff' },
    { key: null, icon: 'groups',               label: 'Subcontractors' },
  ];

  /* Depth-aware links so pages/ and the root both work off one nav table. */
  const atRoot = !/\/pages\//.test(location.pathname);
  const rel = (href) => atRoot ? href : (href.indexOf('pages/') === 0 ? href.slice(6) : '../' + href);
  const asset = (p) => atRoot ? p : '../' + p;

  /* ── Ray's theme ───────────────────────────────────────────────────────
     Dark by default; the switch lives in the app header so it can be flipped
     live in front of an audience. Applied as a class on <html> and read from
     CSS custom properties, so the swap is instant — no reload, and whatever is
     on screen stays on screen. */
  function applyTheme(light) {
    document.documentElement.classList.toggle('ray-light', !!light);
    const btn = document.querySelector('[data-ray-theme]');
    if (btn) {
      btn.innerHTML = `<span class="ms">${light ? 'dark_mode' : 'light_mode'}</span>`
        + (light ? 'Dark' : 'Light');
      btn.title = light ? 'Switch Ray to dark' : 'Switch Ray to light';
    }
  }
  function themeIsLight() {
    try { return localStorage.getItem('ray_theme') === 'light'; } catch (e) { return false; }
  }
  global.rayToggleTheme = function () {
    const light = !themeIsLight();
    try { localStorage.setItem('ray_theme', light ? 'light' : 'dark'); } catch (e) {}
    applyTheme(light);
  };

  /* ── Working through a tender ────────────────────────────────────────
     The eight things a bid actually needs, in the order it needs them.

     This is not the guided demo's eight — those are ordered by which part of
     the brief they prove, which is the right order for showing the build and
     the wrong order for doing the work. These are the job: understand the
     pack, find what the addenda changed, get the questions, see what you have
     already answered, draft the rest, price the risk, approve, submit.

     The point of showing them as a path is that nobody has to know what to
     ask. A bid coordinator should not have to phrase a prompt to get started;
     they should be able to read where they are and press the next thing. */
  const STEPS = [
    { k: 'read',    n: 'Review the documents',
      d: 'What is in the pack, and how much of it matters',
      long: 'Ray picks a reading strategy per file — whole-file for the short ones, '
          + 'page-by-page for a 148-page RFT, OCR for anything scanned — and tells you '
          + 'what each one is for before you open any of them.',
      q: 'Review all documents for this tender' },
    { k: 'addenda', n: 'Check conflicts and addenda',
      d: 'What the addenda override in the original',
      long: 'Addenda quietly replace clauses in the original documents. Ray finds where '
          + 'they conflict and tells you which version governs, so you do not price '
          + 'against a superseded scope.',
      q: 'What changed in Addendum 2?' },
    { k: 'extract', n: 'Extract the response schedule',
      d: 'The questions you are required to answer',
      long: 'Pulls every question out of the response schedule with its word limit and '
          + 'page number, so the list you work from is the list you are marked on.',
      q: 'Extract the response schedule questions' },
    { k: 'match',   n: 'Match against your library',
      d: 'Which answers you have already written',
      long: 'Checks each question against your Response Library and scores the matches, '
          + 'so you rewrite only what you have to. Most bids reuse more than people expect.',
      q: 'Find a past answer about safety' },
    { k: 'draft',   n: 'Draft the gaps',
      d: 'Answers for the questions with no match',
      long: 'Drafts the questions nothing in the library covers, working from the tender '
          + 'documents and staying inside the word limit. You edit from a start, not a '
          + 'blank page.',
      q: 'Draft an answer for Q1' },
    { k: 'risk',    n: 'Check commercial risk',
      d: 'Insurance, damages, payment terms, validity',
      long: 'The terms that cost money if you miss them — liquidated damages, insurance '
          + 'levels, payment terms, how long your price stays open — each quoted with '
          + 'the page it came from.',
      q: 'What insurance is required?' },
    { k: 'approve', n: 'Review and approve responses',
      d: 'Triage what Ray drafted',
      long: 'Everything Ray wrote, in one list to approve or discard. Tick a response to '
          + 'hand it back to him for a rewrite, or tick two and ask him to merge them.',
      goto: 'responses' },
    { k: 'submit',  n: 'Compile the submission',
      d: 'Assemble and check nothing is missing',
      long: 'Assembles the approved responses into the submission and checks the schedule '
          + 'is complete — every question answered, every word limit respected.',
      todo: true },
  ];
  global.rayStepList = STEPS;

  /* Mocked progress, per tender and in memory — enough to show the three
     states a row can be in. A real one reads from the tender's own record. */
  const DONE = { 't-envind': 3, 't-velocity': 0, 't-civic': 6, 't-northside': 1 };
  global.rayStepsDone = function (tenderId) {
    return DONE[tenderId] || 0;
  };
  global.rayStepSkip = function (i, tenderId) {
    DONE[tenderId] = Math.max(DONE[tenderId] || 0, i + 1);
    const p = global.RayPanel && global.RayPanel.current;
    if (p) p.paintNextStep();
  };
  global.rayStepRun = function (i, tenderId) {
    const st = STEPS[i];
    if (!st) return;
    DONE[tenderId] = Math.max(DONE[tenderId] || 0, i + 1);   // doing it completes it
    if (st.goto === 'responses') {
      location.href = (/\/pages\//.test(location.pathname) ? '' : 'pages/') + 'responses.html';
      return;
    }
    if (st.todo) {
      global.RayPanel.toast('Compile the submission — not built in this prototype');
      const p0 = global.RayPanel && global.RayPanel.current;
      if (p0) p0.paintNextStep();
      return;
    }
    const p = global.RayPanel && global.RayPanel.current;
    if (p) p.run(st.q);
  };

  global.rayStepsDialog = function (tenderId) {
    const done = global.rayStepsDone(tenderId);
    global.rayDlg('Working through a tender', `
      <p>Ray suggests these in order, but you can start anywhere — and skip
         anything that does not apply to this bid.</p>
      <div class="dlg-steps">${STEPS.map((st, i) => `
        <div class="dlg-step ${i < done ? 'done' : i === done ? 'now' : ''}">
          <span class="ms">${i < done ? 'check_circle' : i === done ? 'play_circle' : 'radio_button_unchecked'}</span>
          <div class="t"><span class="h">${i + 1}. ${st.n}</span>
            <span class="d">${st.long || st.d}</span>
            ${i === done ? '<span class="badge-now">You are here</span>' : ''}</div>
        </div>`).join('')}</div>`);
  };

  /* ── Dialogs ─────────────────────────────────────────────────────────
     Ray owns a persistent session, so one-shot setup does not belong inside
     it — a conversation you scroll back through should not be littered with
     controls that were only true once. Setup happens in a dialog; the
     conversation keeps the answer. */
  function dlgEl() {
    let el = document.getElementById('rayDlg');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'rayDlg';
    el.className = 'dlg-back';
    el.hidden = true;
    el.innerHTML = `
      <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="rayDlgTitle">
        <div class="dlg-head"><span id="rayDlgTitle"></span>
          <button class="dlg-x" data-dlg-close aria-label="Close"><span class="ms">close</span></button></div>
        <div class="dlg-body" id="rayDlgBody"></div>
      </div>`;
    document.body.appendChild(el);
    /* Backdrop and ✕ close; the dialog itself does not. */
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-dlg-close]')) global.rayDlgClose();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.hidden) global.rayDlgClose();
    });
    return el;
  }
  global.rayDlg = function (title, body) {
    const el = dlgEl();
    el.querySelector('#rayDlgTitle').textContent = title;
    el.querySelector('#rayDlgBody').innerHTML = body;
    el.hidden = false;
    const first = el.querySelector('.dlg-body button, .dlg-body input');
    if (first) first.focus();
    return el.querySelector('#rayDlgBody');
  };
  global.rayDlgClose = function () {
    const el = document.getElementById('rayDlg');
    if (el) el.hidden = true;
  };

  /* Finishing a review is an event, not something Ray said, so it lands in
     a dialog too. The conversation keeps the analysis — the table, what
     matters most — which is the part worth scrolling back to. */
  global.rayReviewDialog = function () {
    global.rayDlg('Ray’s Review Complete', `
      <p>I’ve finished reviewing your documents — now it’s over to you.</p>
      <p>You can:</p>
      <ul class="dlg-list">
        <li><b>Edit responses</b> directly</li>
        <li><b>Use AI prompts</b> to refine further</li>
        <li><b>Approve or decline</b> responses individually</li>
      </ul>
      <p>Where similar questions were found, you’ll see the <b>Combine and Craft</b>
         option — use it to merge them into a single, polished AI-generated response.</p>
      <p>Let me know if you need anything else — <b>I’m here to help</b>.</p>
      <button class="btn pri dlg-wide" data-ray-goto-responses>View Responses</button>`);
    const el = document.getElementById('rayDlg');
    const go = el.querySelector('[data-ray-goto-responses]');
    if (go) go.onclick = () => {
      global.rayDlgClose();
      global.rayProgress(null);
      location.href = (/\/pages\//.test(location.pathname) ? '' : 'pages/') + 'responses.html';
    };
  };

  /* Finishing does not seize the screen. The whole point of running this in
     the background is that you went and did something else, and a modal
     landing on top of that is the interruption the float exists to avoid.
     The float switches to a done state and becomes the way in. */
  global.rayReviewComplete = function () {
    global.rayProgress({
      done: true,
      title: 'Review complete',
      sub: '16 responses drafted · 9 matched your library',
    });
  };

  /* ── The review, while it runs ───────────────────────────────────────
     Floating and out of the way, because the whole promise is "carry on
     with something else". It is not in the rail: the rail can be closed,
     and a job you started should not disappear when you close a panel. */
  global.rayProgress = function (opts) {
    let el = document.getElementById('rayProg');
    if (!opts) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'rayProg';
      el.className = 'rvw-float';
      document.body.appendChild(el);
    }
    el.classList.toggle('done', !!opts.done);
    el.innerHTML = (opts.done
        ? `<span class="rvw-tick"><span class="ms">check</span></span>`
        : `<span class="rvw-spin" aria-hidden="true"></span>`)
      + `<div class="rvw-t">${opts.title}<small>${opts.sub || ''}</small></div>`
      + (opts.done
        ? `<button class="rvw-go" data-rvw-open>View</button>
           <button class="rvw-x" data-rvw-close aria-label="Dismiss"><span class="ms">close</span></button>`
        : `<button class="rvw-stop" data-rvw-stop><span class="ms">stop_circle</span>Stop</button>`);
    const stop = el.querySelector('[data-rvw-stop]');
    if (stop) stop.onclick = opts.onStop || global.rayProgress.bind(null, null);
    const open = el.querySelector('[data-rvw-open]');
    if (open) open.onclick = () => global.rayReviewDialog();
    const close = el.querySelector('[data-rvw-close]');
    if (close) close.onclick = () => global.rayProgress(null);
    return el;
  };

  /* ── Empty state, on demand ──────────────────────────────────────────
     A first-run screen is worth showing and impossible to reach once you
     have projects, so the header can fake it. It hides the list rather
     than deleting anything — flip it back and the projects are all there.
     `rayEmptyDemo` is read by Panel.paintList(). */
  function applyEmpty(on) {
    global.rayEmptyDemo = !!on;
    const btn = document.querySelector('[data-ray-empty]');
    if (btn) {
      /* Icon only. Demo and Light get pressed during a demo and earn their
         labels; these two are set once beforehand, and four labelled pills
         squeezed the page crumb down to a lone home icon. */
      btn.innerHTML = `<span class="ms">${on ? 'inventory_2' : 'inbox'}</span>`;
      btn.title = on
        ? 'Showing the empty projects state — click to show your projects again'
        : 'Show the empty projects state';
      btn.classList.toggle('on', !!on);
    }
    const p = global.RayPanel && global.RayPanel.current;
    if (p && p.view === 'list') p.paintList();
  }
  global.rayToggleEmpty = function () {
    applyEmpty(!global.rayEmptyDemo);
  };

  /* ── The credit notice, on demand ────────────────────────────────────
     It is a real state, but in a demo it is a permanent orange bar warning
     about an allowance nobody is spending — it was the loudest thing in the
     panel and it never went away. Off unless asked for, like the empty
     state, and for the same reason: shown on purpose, not by accident. */
  function applyCredits(on) {
    global.rayCreditsDemo = !!on;
    const btn = document.querySelector('[data-ray-credits]');
    if (btn) {
      btn.innerHTML = `<span class="ms">${on ? 'bolt' : 'battery_full'}</span>`;
      btn.title = on ? 'Hide the credit warning' : 'Show the credit warning';
      btn.classList.toggle('on', !!on);
    }
    const p = global.RayPanel && global.RayPanel.current;
    if (p) p.paintCredits();
  }
  global.rayToggleCredits = function () { applyCredits(!global.rayCreditsDemo); };

  /* A tender's colour, derived from its id so it is stable everywhere it
     appears — the page title bar here, the session tiles in Ray's list. */
  const TENDER_RAMP = ['c-teal', 'c-indigo', 'c-orange', 'c-brown', 'c-cyan'];
  global.rayTenderColour = function (id) {
    let h = 0;
    for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 997;
    return TENDER_RAMP[h % TENDER_RAMP.length];
  };

  /* Dates are stored ISO and shown the way an Australian tender shows them. */
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  global.rayDate = function (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : (iso || '—');
  };

  /* ── Demo detail ───────────────────────────────────────────────────────
     The screens are the product; the architecture proof is a second layer.
     Off by default so the demo reads as an app rather than a lecture — the
     trace drawer, the role switcher and the explainer panels only appear with
     `?dev=1` (or the toggle on the dashboard). Nothing is removed, only
     folded away, so the Phase 1 mechanics stay demonstrable on request.     */
  function devOn() {
    try {
      if (/[?&]dev=1/.test(location.search)) { localStorage.setItem('ray_dev', '1'); return true; }
      if (/[?&]dev=0/.test(location.search)) { localStorage.setItem('ray_dev', '0'); return false; }
      return localStorage.getItem('ray_dev') === '1';
    } catch (e) { return false; }
  }
  global.rayToggleDev = function () {
    try { localStorage.setItem('ray_dev', devOn() ? '0' : '1'); } catch (e) {}
    location.href = location.pathname;
  };

  /* ── Identity ──────────────────────────────────────────────────────────
     Persisted so the chosen role survives navigation — this is the control a
     reviewer uses to watch §4 do its job. */
  function currentUser() {
    const id = (function () { try { return localStorage.getItem('ray_user'); } catch (e) { return null; } })()
      || 'u-aw';
    return global.RayFixtures.USERS.find((u) => u.id === id) || global.RayFixtures.USERS[0];
  }
  global.raySetUser = function (id) {
    try { localStorage.setItem('ray_user', id); } catch (e) {}
    location.reload();
  };

  function mount() {
    const cfg = global.PAGE || {};
    const screen = document.getElementById('screen');
    if (!screen) return;
    const user = currentUser();

    const ics = NAV.map((n) => n.href
      ? `<a class="cic ${cfg.nav === n.key ? 'active' : ''}" href="${rel(n.href)}" title="${n.label}">`
        + `<span class="ms fill">${n.icon}</span></a>`
      : `<a class="cic" data-toast="${n.label} — not built in this prototype" title="${n.label}">`
        + `<span class="ms fill">${n.icon}</span></a>`).join('');

    const dev = devOn();
    document.documentElement.classList.toggle('dev', dev);

    const roles = global.RayFixtures.USERS.map((u) =>
      `<option value="${u.id}"${u.id === user.id ? ' selected' : ''}>${u.name} — ${u.role}</option>`).join('');
    const identity = dev
      ? `<span class="rolesel" title="Prototype control — switches the signed-in role so you can watch the permission layer">
           <span class="ms" style="font-size:17px">badge</span>
           <select onchange="raySetUser(this.value)">${roles}</select>
         </span>`
      : `<span class="whoami">${user.name}</span>`;

    const wrap = document.createElement('div');
    wrap.className = 'capp';
    wrap.innerHTML = `
      <aside class="c-side">
        <div class="clogo"><img src="${asset('assets/logo-symbol.svg')}" alt="Tenderfy"></div>
        ${ics}
      </aside>
      <div class="c-main">
        <div class="c-header">
          <div class="l"><span class="ms fill" style="font-size:20px">home</span>
            <span>${cfg.crumb || 'Dashboard'}</span></div>
          <div class="r">
            ${identity}
            <span class="hthemes" data-ray-demo onclick="rayDemoStep()"></span>
            <span class="hthemes" data-ray-theme onclick="rayToggleTheme()"></span>
            <span class="hthemes" data-ray-empty onclick="rayToggleEmpty()"></span>
            <span class="hthemes" data-ray-credits onclick="rayToggleCredits()"></span>
            <span class="ms fill" title="Notifications">notifications</span>
            <span class="hray" onclick="RayPanel.toggle()" title="Ray — Tenderfy Co-Pilot">
              <img src="${asset('assets/ray.svg')}" alt="Ray"> Ray</span>
            <span class="cava">${user.initials}</span>
          </div>
        </div>
        <div class="c-content" id="content"></div>
      </div>`;
    wrap.querySelector('#content').appendChild(screen);
    document.body.insertBefore(wrap, document.body.firstChild);
    screen.style.display = '';

    /* ── The one Ray on the site ────────────────────────────────────────
       One service, one rail, one conversation. The page only says where the
       user is looking; if the rail was open on the last page, it opens here
       already holding the same thread.                                     */
    const service = new global.RayCore.RayService({ user });
    global.ray = service;
    global.RayPanel.init(service);

    /* Ray failing must never take the page down with it — the screens have to
       stand on their own, and a blank page hides the actual error. */
    try {
      /* Seed BEFORE mounting: the rail opens the most recent session in the
         project, so a demo thread created afterwards would sit behind an empty
         one the rail had already made. */
      seedDemo(service);
      const r = cfg.ray || { surface: 'page' };
      global.RayPanel.mount({
        surface: r.surface || 'page',
        /* The page's own breadcrumb rides along, so Ray's context chip can
           show the same trail the header does rather than inventing one. */
        context: Object.assign({ crumb: cfg.crumb || '' }, r.context || {}),
        mode: r.mode || 'rail',
        mount: r.mount,
      });
    } catch (err) {
      console.error('Ray failed to mount:', err);
    }

    applyTheme(themeIsLight());
    /* Deliberately not persisted: this is a demo switch, and coming back to a
       panel that claims you have no projects would read as data loss. */
    applyEmpty(false);
    applyCredits(false);
    paintDemo();

    if (typeof global.onPageReady === 'function') global.onPageReady(service, user);
  }

  /* ── Guided demo ───────────────────────────────────────────────────────
     One click advances one step: the question types itself into the composer
     and sends. The arc matches the seeded showcase, so you can either scroll
     that session or run it live — and running it live is the honest version,
     because the thinking and the streaming actually happen.                 */
  const DEMO = [
    { ref: '§3', label: 'Multi-document review — a strategy per file',
      q: 'Review all documents for this tender' },
    { ref: '§3', label: 'On-demand reading — search, then only the pages that matter',
      q: 'What insurance is required?' },
    { ref: '§1', label: 'Question extraction — was the Workspace’s own code',
      q: 'Extract the response schedule questions' },
    { ref: '§1', label: 'Response Library — reuse before rewrite',
      q: 'Find a past answer about safety' },
    { ref: '§1', label: 'Generate content — drafting for a field',
      q: 'Draft an answer for Q1' },
    { ref: '§3', label: 'Answer from a file the user hands over',
      q: 'What changed in Addendum 2?', attach: ['d-scope'] },
    { ref: '§2', label: 'Context management — retrieved, not resent',
      q: 'Remind me what you said about insurance' },
    { ref: '§4', label: 'Permission-based fetching — Ray tries, the guard refuses',
      q: 'Open the Hansen Depot Fitout tender for me' },
  ];
  const DEMO_TITLE = 'Guided demo — the Phase 1 requirements';
  let demoStep = 0;
  let demoBusy = false;

  function paintDemo() {
    const btn = document.querySelector('[data-ray-demo]');
    if (!btn) return;
    const done = demoStep >= DEMO.length;
    btn.innerHTML = `<span class="ms">${demoBusy ? 'more_horiz' : done ? 'replay' : 'play_arrow'}</span>`
      + (demoBusy ? 'Running' : done ? 'Restart' : `Demo ${demoStep + 1}/${DEMO.length}`);
    btn.title = done ? 'Start the demo again'
      : `${DEMO[demoStep].ref} · ${DEMO[demoStep].label}`;
  }

  /** True when the panel is sitting in the guided-demo project with steps
   *  still to run. Everything below keys off this, so the behaviour never
   *  leaks into a project the user is actually working in. */
  function inDemo(panel) {
    if (!panel || demoStep >= DEMO.length) return false;
    const svc = global.ray;
    if (!svc) return false;
    const rec = svc.threadIndex.get(svc.user.id, panel.threadId);
    return !!rec && rec.title === DEMO_TITLE;
  }

  /* The composer says what clicking it will do. */
  global.rayComposerHint = function (panel) {
    return inDemo(panel) && !demoBusy
      /* Just the counter. The composer is one row until something is typed,
         and 248px of it fits ~24 characters — every step's label overflowed.
         The label is not lost: it is the Demo button's tooltip, and the toast
         each step raises names the requirement as it runs. */
      ? `Click to run step ${demoStep + 1} of ${DEMO.length}`
      : null;
  };

  /* Clicking an empty composer in the demo project runs the next step. The
     empty check matters: it leaves the field usable for a real question, and
     for editing a prompt pulled from the library. */
  global.rayComposerActivate = function (panel) {
    if (demoBusy || !inDemo(panel)) return;
    if ((panel.$('input').value || '').trim()) return;
    global.rayDemoStep();
  };

  /** The flow runs in its own project, so it can be restarted cleanly without
   *  touching the catalogue beside it. */
  function demoSession(service, fresh) {
    const uid = service.user.id;
    let t = service.allThreads().find((x) => x.title === DEMO_TITLE);
    if (t && fresh) { service.deleteThread(t.id); t = null; }
    if (!t) {
      t = service.newThread('t-envind');
      t.seeded = true;
      service.threadIndex.rename(uid, t.id, DEMO_TITLE);
      service.threadIndex.touch(uid, t.id, null, Date.now(),
        'Runs the Phase 1 requirements one click at a time.');
      service.threadIndex.flush(uid);
    }
    return t;
  }

  global.rayDemoStep = async function () {
    const p = global.RayPanel && global.RayPanel.current;
    if (!p || demoBusy) return;
    if (demoStep >= DEMO.length) {          // restart in a clean project
      demoStep = 0;
      p.openThread(demoSession(global.ray, true).id);
      paintDemo();
      return;
    }
    const step = DEMO[demoStep++];
    demoBusy = true;
    paintDemo();
    try {
      if (demoStep === 1) p.openThread(demoSession(global.ray, true).id);
      if (step.focus) p.focus(step.focus[0], step.focus[1]);
      if (step.attach) step.attach.forEach((id) => p.attachDoc(id));
      global.RayPanel.toast(`${step.ref} · ${step.label}`);
      await p.run(step.q);
    } catch (err) { console.error('Demo step failed:', err); }
    demoBusy = false;
    paintDemo();
    if (global.RayPanel.current) global.RayPanel.current.paintSurface();
  };

  /* ── Demo seeding ──────────────────────────────────────────────────────
     Seeds the sessions a demo needs. Versioned: a plain "have I seeded?" flag
     meant anyone who had opened the prototype before a new exhibit was added
     never received it, and the only cure was clearing storage. On a version
     bump the previously seeded sessions are removed and rebuilt; sessions the
     user started themselves are left alone.

     Seeded sessions carry a `seeded` flag in the index, and the rebuild keys
     off THAT rather than off a list of ids in the flag — an older flag has no
     ids to offer, and cleaning up by "what did I make" is the only version of
     this that cannot leave duplicates behind.                               */
  const SEED_VERSION = 13;

  function seedDemo(service) {
    const uid = service.user.id;
    const key = 'ray_seeded::' + uid;
    let state = null;
    try { state = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { state = null; }
    if (state && state.v === SEED_VERSION) return;

    service.allThreads().filter((t) => t.seeded)
      .forEach((t) => service.deleteThread(t.id));

    /* One-time sweep for anything seeded before the flag existed. Those rows
       carry no marker, so they are identified by what they are: the named
       exhibit, the history thread (by its opening line), and empty untitled
       sessions. A thread the user named or wrote in matches none of these and
       is never touched. */
    if (!state || !(state.v >= 4)) {
      const exhibits = ['Everything Ray can show you',
                        'UI elements — every block Ray renders',
                        'UI elements — every block, explained', DEMO_TITLE];
      const opener = global.RayFixtures.SEED_CONVERSATION[0].text.slice(0, 30);
      service.allThreads().forEach((t) => {
        let count = 0;
        try { count = service.store.load(service.guard, t.id).messages.length; } catch (e) {}
        const isExhibit = exhibits.indexOf(t.title) >= 0;
        const isHistory = !t.untitled && t.title.indexOf(opener) === 0;
        const isEmpty = t.untitled && count === 0;
        if (isExhibit || isHistory || isEmpty) service.deleteThread(t.id);
      });
    }

    const mk = (surface, ctx) => {
      const t = service.newThread(ctx && ctx.tenderId);
      t.seeded = true;
      return { rec: t, session: service.thread(t.id, surface, ctx || {}) };
    };

    /* Two projects, doing two different jobs. (A "project" in the UI is a
       session in the code — same thing, different vocabulary.)

       1. A static catalogue: every block the panel can render, so a reviewer
          can see the vocabulary without anyone driving.
       2. An empty project the guided flow fills in live, one requirement per
          click. This is the one that proves the behaviour, because the tool
          calls, the thinking and the streaming actually happen. */
    const cat = mk('tender', { tenderId: 't-envind' });
    cat.session.seed(global.RayFixtures.UI_CATALOGUE);
    service.threadIndex.rename(uid, cat.rec.id, 'UI elements — every block, explained');
    service.threadIndex.touch(uid, cat.rec.id, null, Date.now() - 90 * 1000,
      'Each block says what it is and when Ray uses it.');

    const flow = mk('tender', { tenderId: 't-envind' });
    service.threadIndex.rename(uid, flow.rec.id, DEMO_TITLE);
    service.threadIndex.touch(uid, flow.rec.id, null, Date.now(),
      'Runs the Phase 1 requirements one click at a time.');

    service.threadIndex.flush(uid);
    try { localStorage.setItem(key, JSON.stringify({ v: SEED_VERSION })); } catch (e) {}
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-toast]');
    if (el && global.RayPanel) global.RayPanel.toast(el.getAttribute('data-toast'));
  });

  document.addEventListener('DOMContentLoaded', mount);
  global.RayShell = { currentUser, NAV, devOn };
})(window);
