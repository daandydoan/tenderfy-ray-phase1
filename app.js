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
  /* The Tenderfy Method, from the company brief. Eight stages of a bid, each
     of which Agent Ray works and a human reviews and approves — that pattern
     is the point of the brief, not a detail: "the human only in the loop to
     guide, review and approve", against a target of Ray completing 80%+.

     These replace an earlier invented eight that were document-shaped —
     review the pack, extract questions, draft. Those described what Ray can
     do to a file. These describe how a bid is actually won, which is what
     the method is for. */
  const STEPS = [
    { k: 'gonogo',  n: 'Go / No-Go',
      d: 'Whether this one is worth bidding',
      say: 'assess this against your Go / No-Go criteria and give you a recommendation',
      long: 'Rates the opportunity against the Tenderfy criteria — strategic fit, capability, '
          + 'commercial viability, mandatory requirements, risk — as Green, Amber or Red with '
          + 'a reason for each, then recommends GO, GO SUBJECT TO CONDITIONS, HOLD or NO-GO. '
          + 'Missing information is named, never assumed.',
      q: 'Review all documents for this tender' },

    { k: 'plan',    n: 'Plan the tender',
      d: 'The task list and delivery plan',
      say: 'build the task list and delivery plan, working back from the closing date',
      long: 'Works backwards from the closing date to a task list — title, brief, due date, '
          + 'priority, suggested assignee — and a Delivery Plan covering milestones, '
          + 'responsibilities, risks and approvals. Ray marks which tasks he could do himself, '
          + 'but starts none of them until you say so.',
      todo: 'Plan the tender — needs the Tenderfy task and Delivery Plan templates' },

    { k: 'buyer',   n: 'Understand the buyer',
      d: 'Their priorities, and where we add real value',
      say: 'research the buyer and find where we can add real value',
      long: 'Researches the buyer\u2019s goals, initiatives and commitments, compares them against '
          + 'what the company genuinely does, and proposes specific value-adds — not '
          + '"strong communication" but a named plan, programme or measurable improvement, '
          + 'each with how it would be implemented and what evidence supports it.',
      todo: 'Understand the buyer — needs web research, not built in this prototype' },

    { k: 'feedback', n: 'Learn from feedback',
      d: 'What this buyer said about our last bids',
      say: 'look at what this buyer said about our previous submissions',
      long: 'Searches previous tenders to this same buyer for scores, evaluator comments and '
          + 'outcomes, then turns them into things to repeat and things to fix. Feedback from '
          + 'other buyers is never applied, and if none exists it says so rather than '
          + 'substituting something unrelated.',
      q: 'Find a past answer about safety' },

    { k: 'schedule', n: 'Complete the responses',
      d: 'Every question in the response schedule',
      say: 'work through the response schedule and draft the answers',
      long: 'Pulls out every question with its word limit, mandatory flag and evaluation '
          + 'weighting, then answers each one against the buyer\u2019s requirements using company '
          + 'knowledge and everything approved earlier in the bid. Anything needing specialist '
          + 'input is flagged rather than invented.',
      q: 'Extract the response schedule questions' },

    { k: 'method',  n: 'Methodology & technical',
      d: 'How we will actually deliver the work',
      say: 'develop the methodology and technical content for this project',
      long: 'Builds project-specific methodology from the scope, programme and technical '
          + 'documents — sequencing, resources, interfaces, risk, commissioning — as a '
          + 'narrative of how the work gets done. Technical gaps are raised for an SME rather '
          + 'than filled in.',
      q: 'Draft an answer for Q1' },

    { k: 'build',   n: 'Build the tender',
      d: 'Assemble and tailor the submission',
      say: 'assemble the submission and tailor the content to this buyer',
      long: 'Chooses the template and structure, then selects and reworks content for this '
          + 'specific bid — resumes, project profiles, methodologies, value-adds — rather than '
          + 'reusing it unchanged. Edits stay on the tender copy; master library content is '
          + 'never overwritten.',
      todo: 'Build the tender — needs the Tenderfy templates and the assembled submission' },

    { k: 'final',   n: 'Final review',
      d: 'Compliance, quality and readiness to submit',
      say: 'run the final compliance and quality check before submission',
      long: 'Checks the submission against the original documents — every mandatory '
          + 'requirement, every question, word limits, schedules, signatures — then reads it '
          + 'as an evaluator would and sorts what it finds into Critical, Recommended and '
          + 'Optional. You make the call that it is ready.',
      todo: 'Final review — needs the assembled tender to check against' },
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
    if (p) { p.resetStepAt(); p.paintNextStep(); }
  };
  global.rayStepRun = function (i, tenderId) {
    const st = STEPS[i];
    if (!st) return;
    DONE[tenderId] = Math.max(DONE[tenderId] || 0, i + 1);   // doing it completes it
    const back = global.RayPanel && global.RayPanel.current;
    if (back) back.resetStepAt();
/* No step navigates on its own. Being thrown onto another screen mid-method
   loses the panel, the conversation and your place in the guide — the way
   out is offered at the end and pressed on purpose. */
    /* Steps with no mocked answer say what they would do and why they are
       not here, rather than running something adjacent and looking wrong. */
    if (st.todo) {
      global.RayPanel.toast(st.todo);
      const p0 = global.RayPanel && global.RayPanel.current;
      if (p0) p0.paintNextStep();
      return;
    }
    const p = global.RayPanel && global.RayPanel.current;
    if (p) p.run(st.q);
  };

  global.rayGoResponses = function () {
    location.href = (/\/pages\//.test(location.pathname) ? '' : 'pages/') + 'responses.html';
  };

  global.rayStepsDialog = function (tenderId) {
    const done = global.rayStepsDone(tenderId);
    const finished = done >= STEPS.length;
    /* The dialog is where the method is read, so it is also where it is
       started — a list of what Ray could do with no way to set him going is
       a brochure. */
    const cta = finished
      ? `<button class="btn dlg-wide" data-dlg-close>Close</button>`
      : `<button class="btn pri dlg-wide" data-ray-start-workflow>
           <span class="ms">play_arrow</span>${done ? `Continue from step ${done + 1}`
                                                    : 'Start the workflow'}</button>`;
    global.rayDlg('Working through a tender', `
      <p>Ray works through these in order and checks in at each one. You can
         start anywhere, and skip anything that does not apply to this bid.</p>
      <div class="dlg-steps">${STEPS.map((st, i) => `
        <div class="dlg-step ${i < done ? 'done' : i === done ? 'now' : ''}">
          <span class="ms">${i < done ? 'check_circle' : i === done ? 'play_circle' : 'radio_button_unchecked'}</span>
          <div class="t"><span class="h">${i + 1}. ${st.n}</span>
            <span class="d">${st.long || st.d}</span>
            ${i === done ? '<span class="badge-now">You are here</span>' : ''}</div>
        </div>`).join('')}</div>
      ${cta}`);
    const el = document.getElementById('rayDlg');
    const go = el.querySelector('[data-ray-start-workflow]');
    if (go) go.onclick = () => {
      global.rayDlgClose();
      const p = global.RayPanel && global.RayPanel.current;
      if (p) { p.guideOff = false; p.paintNextStep(); }
      global.rayStepRun(global.rayStepsDone(tenderId), tenderId);
    };
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
      global.rayGoResponses();
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

  /* ── Which guidance to show ──────────────────────────────────────────
     Two ways of putting the same eight steps in front of someone, kept
     side by side so they can be compared in the room rather than argued
     about in the abstract:

       strip — docked below the conversation. Always in one place, always
               visible, unmistakably a control. Easy to find, easy to
               ignore, and it costs height whether or not it is wanted.
       chat  — Ray says what he can do next at the end of his answer. No
               chrome at all, and it lands where the eye already is; but it
               scrolls away with the conversation and has no fixed home.  */
  const GUIDE_STYLES = ['strip', 'chat', 'steps'];
  const GUIDE_META = {
    strip: { ic: 'dock_to_bottom', say: 'a docked strip' },
    chat:  { ic: 'forum',          say: 'Ray asking in the conversation' },
    steps: { ic: 'linear_scale',   say: 'a stepper under the header' },
  };
  function applyGuide(style) {
    global.rayGuideStyle = GUIDE_STYLES.indexOf(style) >= 0 ? style : 'strip';
    const btn = document.querySelector('[data-ray-guide]');
    if (btn) {
      const cur = global.rayGuideStyle;
      const nxt = GUIDE_STYLES[(GUIDE_STYLES.indexOf(cur) + 1) % GUIDE_STYLES.length];
      btn.innerHTML = `<span class="ms">${GUIDE_META[cur].ic}</span>`;
      btn.title = `Guidance: ${GUIDE_META[cur].say} — click for ${GUIDE_META[nxt].say}`;
      btn.classList.toggle('on', cur !== 'strip');
    }
    const p = global.RayPanel && global.RayPanel.current;
    if (p) p.paintNextStep();
  }
  global.rayToggleGuide = function () {
    const i = GUIDE_STYLES.indexOf(global.rayGuideStyle);
    applyGuide(GUIDE_STYLES[(i + 1) % GUIDE_STYLES.length]);
  };

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
            <span class="hthemes" data-ray-guide onclick="rayToggleGuide()"></span>
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
    applyGuide('strip');
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
