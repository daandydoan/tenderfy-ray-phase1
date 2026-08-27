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

  /* ── Empty state, on demand ──────────────────────────────────────────
     A first-run screen is worth showing and impossible to reach once you
     have projects, so the header can fake it. It hides the list rather
     than deleting anything — flip it back and the projects are all there.
     `rayEmptyDemo` is read by Panel.paintList(). */
  function applyEmpty(on) {
    global.rayEmptyDemo = !!on;
    const btn = document.querySelector('[data-ray-empty]');
    if (btn) {
      btn.innerHTML = `<span class="ms">${on ? 'inventory_2' : 'inbox'}</span>`
        + (on ? 'Empty' : 'Projects');
      btn.title = on
        ? 'Showing the empty state — click to show your projects again'
        : 'Show the empty projects state';
      btn.classList.toggle('on', !!on);
    }
    const p = global.RayPanel && global.RayPanel.current;
    if (p && p.view === 'list') p.paintList();
  }
  global.rayToggleEmpty = function () {
    applyEmpty(!global.rayEmptyDemo);
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
