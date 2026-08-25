/* ═══════════════════════════════════════════════════════════════════════════
   Fixtures — stands in for the platform's real data layer.

   In the Angular app each of these maps to an existing API surface. The shape
   here is what Ray's repositories expect; swap the in-memory arrays for HTTP
   calls and nothing above this file changes.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── Identity ───────────────────────────────────────────────────────────
     Roles mirror the platform's Role Management screen. `scopes` are the
     permission strings the PermissionGuard checks; `businessId` and
     `tenderIds` bound the rows a user can ever see.                        */
  const USERS = [
    {
      id: 'u-aw', name: 'Andrew Williams', initials: 'AW', role: 'Business Admin',
      businessId: 'biz-tc', tenderIds: ['t-envind', 't-velocity', 't-civic', 't-northside'],
      scopes: [
        'tender.read', 'tender.write', 'document.read', 'document.write',
        'response_library.read', 'response_library.write',
        'subbie.read', 'staff.read', 'conversation.read', 'conversation.write',
        'prompt_library.read', 'prompt_library.write',
        'business.read', 'pricing.read',
      ],
    },
    {
      id: 'u-pm', name: 'Priya Mehta', initials: 'PM', role: 'Estimator',
      businessId: 'biz-tc', tenderIds: ['t-envind', 't-velocity'],
      scopes: [
        'tender.read', 'document.read',
        'response_library.read', 'response_library.write',
        'prompt_library.read', 'prompt_library.write',
        'conversation.read', 'conversation.write', 'pricing.read',
      ],
    },
    {
      id: 'u-jl', name: 'Jordan Lee', initials: 'JL', role: 'Bid Coordinator (read-only)',
      businessId: 'biz-tc', tenderIds: ['t-envind'],
      scopes: ['tender.read', 'document.read', 'response_library.read',
               'prompt_library.read', 'conversation.read', 'conversation.write'],
    },
    {
      id: 'u-ext', name: 'Sam Ortiz', initials: 'SO', role: 'External Reviewer',
      businessId: 'biz-tc', tenderIds: ['t-envind'],
      scopes: ['tender.read', 'conversation.read', 'conversation.write'],
    },
  ];

  /* ── Tenders ───────────────────────────────────────────────────────────── */
  const TENDERS = [
    { id: 't-envind',   businessId: 'biz-tc', name: 'Environmental Industries',
      ref: 'TND-2026-0188', org: 'Dept of Environment & Science', sector: 'Environmental',
      due: '2026-07-29', status: 'Pending', priority: 'High', value: 2450000 },
    { id: 't-velocity', businessId: 'biz-tc', name: 'Velocity Link Highway Extension',
      ref: 'TND-2026-0201', org: 'Transport & Main Roads', sector: 'Civil',
      due: '2026-09-12', status: 'In progress', priority: 'High', value: 8900000 },
    { id: 't-civic',    businessId: 'biz-tc', name: 'Civic Centre Redevelopment',
      ref: 'TND-2026-0177', org: 'Brisbane City Council', sector: 'Building',
      due: '2026-08-30', status: 'In progress', priority: 'Medium', value: 5100000 },
    { id: 't-northside', businessId: 'biz-tc', name: 'Northside School Upgrade',
      ref: 'TND-2026-0164', org: 'Dept of Education', sector: 'Education',
      due: '2026-10-04', status: 'Draft', priority: 'Low', value: 1200000 },
    /* Belongs to another business — must never surface, whatever the model asks. */
    { id: 't-foreign',  businessId: 'biz-hp', name: 'Hansen Depot Fitout',
      ref: 'TND-2026-0009', org: 'Hansen Projects', sector: 'Building',
      due: '2026-07-01', status: 'Closed', priority: 'Low', value: 640000 },
  ];

  /* ── Documents ──────────────────────────────────────────────────────────
     `profile` is what the DocumentReader routes on. It is metadata the
     platform already has (or can cheaply derive at upload time) — never
     something we learn by reading the whole file.                          */
  const DOCUMENTS = [
    { id: 'd-rft', tenderId: 't-envind', name: 'Request for Tender.pdf', kind: 'pdf',
      pages: 148, bytes: 6_240_000, textLayer: true, scanned: false,
      classification: 'internal', uploaded: '2026-06-02',
      outline: [
        { from: 1,   to: 6,   title: 'Invitation & key dates' },
        { from: 7,   to: 24,  title: 'Conditions of tendering' },
        { from: 25,  to: 62,  title: 'Scope of works' },
        { from: 63,  to: 88,  title: 'Technical specification' },
        { from: 89,  to: 104, title: 'Evaluation criteria' },
        { from: 105, to: 126, title: 'Response schedules & questions' },
        { from: 127, to: 148, title: 'Draft contract & annexures' },
      ] },
    { id: 'd-scope', tenderId: 't-envind', name: 'Scope of Works — Addendum 2.docx', kind: 'docx',
      pages: 11, bytes: 184_000, textLayer: true, scanned: false,
      classification: 'internal', uploaded: '2026-06-19', outline: null },
    { id: 'd-site', tenderId: 't-envind', name: 'Site Survey (scanned).pdf', kind: 'pdf',
      pages: 34, bytes: 41_800_000, textLayer: false, scanned: true,
      classification: 'internal', uploaded: '2026-06-11', outline: null },
    { id: 'd-qa', tenderId: 't-envind', name: 'Tenderer Q&A Register.xlsx', kind: 'xlsx',
      pages: 3, bytes: 92_000, textLayer: true, scanned: false,
      classification: 'internal', uploaded: '2026-07-01', outline: null },
    { id: 'd-rates', tenderId: 't-envind', name: 'Commercial Rates — CONFIDENTIAL.xlsx', kind: 'xlsx',
      pages: 2, bytes: 71_000, textLayer: true, scanned: false,
      classification: 'confidential', uploaded: '2026-07-03', outline: null },
    { id: 'd-vl-rft', tenderId: 't-velocity', name: 'RFT — Velocity Link.pdf', kind: 'pdf',
      pages: 212, bytes: 9_100_000, textLayer: true, scanned: false,
      classification: 'internal', uploaded: '2026-07-14', outline: [
        { from: 1,  to: 18,  title: 'Instructions to tenderers' },
        { from: 19, to: 96,  title: 'Technical requirements' },
        { from: 97, to: 140, title: 'Traffic management' },
        { from: 141, to: 212, title: 'Schedules' },
      ] },
    { id: 'd-hp', tenderId: 't-foreign', name: 'Hansen internal pricing.pdf', kind: 'pdf',
      pages: 12, bytes: 300_000, textLayer: true, scanned: false,
      classification: 'internal', uploaded: '2026-05-02', outline: null },
  ];

  /* ── Extracted content ──────────────────────────────────────────────────
     Page text keyed `docId:pageNo`. Only the pages the demo needs carry real
     prose; the rest are synthesised so paging and search behave sensibly.   */
  const PAGE_TEXT = {
    'd-rft:1':  'REQUEST FOR TENDER — Environmental remediation and revegetation services. Closing 2:00pm AEST, 29 July 2026. Reference TND-2026-0188.',
    'd-rft:3':  'Key dates. Site inspection 18 June 2026. Deadline for tenderer questions 8 July 2026. Tender close 29 July 2026.',
    'd-rft:12': 'Clause 4.3 Insurance. The Contractor shall effect and maintain Public Liability insurance of not less than $20,000,000 per occurrence, Workers Compensation as required by statute, and Professional Indemnity of not less than $5,000,000 in the aggregate, each maintained for the term and for seven (7) years thereafter.',
    'd-rft:19': 'Clause 6.1 Tender validity. Tenders shall remain open for acceptance for ninety (90) days from the closing date.',
    'd-rft:31': 'Scope of works. The Contractor shall undertake weed eradication across 42 hectares, revegetation with locally provenanced species at 1,200 stems per hectare, and 24 months of establishment maintenance.',
    'd-rft:52': 'Environmental management. The Contractor shall prepare a site-specific Construction Environmental Management Plan (CEMP) in accordance with AS/NZS ISO 14001:2016 and submit it for approval no later than ten (10) business days prior to site mobilisation.',
    'd-rft:91': 'Evaluation criteria and weightings. Price 40%. Technical capability and methodology 25%. Relevant experience 20%. Environmental and safety management 10%. Local content and social procurement 5%.',
    'd-rft:97': 'Non-price criteria are assessed on a 0–5 scale. A score below 2 on any criterion may render a tender non-conforming.',
    'd-rft:108': 'Schedule 4 — Response schedules. Tenderers must answer each question in the space provided. Responses exceeding the stated word limit will be truncated at evaluation.',
    'd-rft:109': 'Q1. Describe your organisation’s environmental management system, including certification held and how it is applied on comparable sites. (500 words)',
    'd-rft:110': 'Q2. Detail your proposed methodology for weed eradication and revegetation, including staging, species selection and establishment maintenance. (800 words)',
    'd-rft:112': 'Q3. Provide details of three comparable projects completed in the last five years, including client referees. (600 words)',
    'd-rft:114': 'Q4. Describe your Work Health and Safety management system and provide your LTIFR for the last three financial years. (400 words)',
    'd-rft:117': 'Q5. Outline your approach to local content and social procurement, including any Indigenous participation commitments. (400 words)',
    'd-rft:131': 'Draft contract — General Conditions. Liquidated damages apply at $4,500 per day for each day beyond the Date for Practical Completion.',
    'd-scope:2': 'Addendum 2 supersedes clause 4.3 of the Request for Tender. Public Liability insurance is increased to $25,000,000 per occurrence with effect from the date of this addendum.',
    'd-scope:5': 'Addendum 2 — the revegetation stem rate is amended from 1,200 to 1,500 stems per hectare across zones B and C only. Zone A is unchanged.',
    'd-scope:9': 'All other terms of the Request for Tender remain unaltered.',
    'd-site:4':  '[OCR] SITE SURVEY SHEET 04 — Zone B. Existing vegetation: predominantly lantana camara, mature canopy retained along northern boundary. Contours at 0.5m intervals.',
    'd-site:17': '[OCR] SITE SURVEY SHEET 17 — Zone C. Watercourse setback 30m marked in red. Acid sulfate soil sample points ASS-11 through ASS-19.',
    'd-site:28': '[OCR] SITE SURVEY SHEET 28 — Access track and laydown area, 1,800m2, existing hardstand suitable for site compound.',
    'd-qa:1': 'Q&A Register. Q: Is the CEMP required at tender or post-award? A: Post-award, within 10 business days of mobilisation. Q: Are stem rates in Addendum 2 cumulative? A: No, they replace the RFT rates for zones B and C.',
    'd-rates:1': 'CONFIDENTIAL — internal rate build-up. Weed eradication $1,940/ha. Revegetation $6.20/stem. Establishment maintenance $310/ha/month.',
    'd-vl-rft:104': 'Traffic management. A Traffic Management Plan prepared by an accredited practitioner is required prior to any lane occupancy.',
    'd-hp:3': 'Hansen internal margin schedule — not for distribution.',
  };

  /* ── Response Library ─────────────────────────────────────────────────── */
  const RESPONSE_LIBRARY = [
    { id: 'r-ems', businessId: 'biz-tc', question: 'Describe your environmental management system.',
      category: 'Environmental', words: 486, lastUsed: '2026-05-14', winRate: 0.72,
      answer: 'Tenderfy Civil operates an ISO 14001:2016-certified Environmental Management System (certificate EMS-4471, current to March 2028). On comparable remediation sites the EMS is applied through a site-specific CEMP…' },
    { id: 'r-whs', businessId: 'biz-tc', question: 'Describe your WHS management system and provide LTIFR.',
      category: 'Safety', words: 392, lastUsed: '2026-06-02', winRate: 0.81,
      answer: 'Our WHS management system is certified to ISO 45001:2018. LTIFR for FY23, FY24 and FY25 was 0.0, 1.2 and 0.0 respectively across 412,000 hours worked…' },
    { id: 'r-exp', businessId: 'biz-tc', question: 'Provide three comparable projects with referees.',
      category: 'Experience', words: 574, lastUsed: '2026-04-21', winRate: 0.64,
      answer: 'Project 1 — Moggill Creek riparian restoration (2024, $2.1M, Brisbane City Council)…' },
    { id: 'r-local', businessId: 'biz-tc', question: 'Outline your local content and social procurement approach.',
      category: 'Social', words: 358, lastUsed: '2026-03-08', winRate: 0.55,
      answer: 'We commit to a minimum 65% local content by value, measured under the Queensland Charter for Local Content…' },
  ];

  /* ── Prompt Library ─────────────────────────────────────────────────────
     The "save prompt" feature the Document Workspace already has, carried into
     Ray: instructions worth reusing, saved once and run against whatever is in
     front of you. Business-scoped like the Response Library, and read/write
     gated the same way — a read-only role can run a saved prompt but not add
     one.                                                                     */
  const PROMPT_LIBRARY = [
    { id: 'p-conflict', businessId: 'biz-tc', label: 'Find conflicts across documents',
      text: 'Review every document on this tender and list anything that conflicts between them — especially where an addendum overrides the original.' },
    { id: 'p-schedule', businessId: 'biz-tc', label: 'Pull the response schedule',
      text: 'Extract the response schedule questions with their word limits and page numbers, and tell me which ones we already have a library answer for.' },
    { id: 'p-risk', businessId: 'biz-tc', label: 'Commercial risk check',
      text: 'What are the commercial risks in this tender? Cover liquidated damages, insurance levels, payment terms and tender validity.' },
    { id: 'p-draft', businessId: 'biz-tc', label: 'Draft from our best answer',
      text: 'Draft an answer for this question using our highest-scoring Response Library entry, updated against this tender’s requirements. Stay inside the word limit.' },
  ];

  /* ── Seeded conversation ────────────────────────────────────────────────
     Long enough that naive "send everything" would be wasteful — which is the
     point of the retrieval-based ConversationStore.                         */
  const SEED_CONVERSATION = [
    { role: 'user',      text: 'What is the insurance requirement on Environmental Industries?' },
    { role: 'assistant', text: 'The insurance requirement is in clause 4.3: Public Liability at $20,000,000 per occurrence — but Addendum 2 raises it to $25,000,000. Professional Indemnity is $5,000,000 in the aggregate, held for seven years after the term.' },
    { role: 'user',      text: 'Who is the contact for that tender?' },
    { role: 'assistant', text: 'Lara Blake at the Dept of Environment & Science. Tender closes 2:00pm AEST on 29 July 2026.' },
    { role: 'user',      text: 'Remind me what the liquidated damages are.' },
    { role: 'assistant', text: 'Liquidated damages run at $4,500 per day past the Date for Practical Completion (draft contract, p.131).' },
    { role: 'user',      text: 'And the tender validity period?' },
    { role: 'assistant', text: 'Ninety days from the closing date (clause 6.1, p.19).' },
    { role: 'user',      text: 'Thanks — I will come back to the schedules later.' },
    { role: 'assistant', text: 'No problem. The response schedules are at pages 105–126 whenever you want them.' },
  ];

  /* ── Credits ────────────────────────────────────────────────────────────
     The sync-up decided against showing per-task token consumption — it
     discourages use. What the business actually needs to know is whether the
     month's allowance is running out, and only once it is close.

     Seeded just under the 60% threshold so the first substantial question in a
     demo tips it over and the notice appears while someone is watching.    */
  const CREDITS = { included: 600, used: 348, renews: '2026-09-01' };

  /* ── UI catalogue ───────────────────────────────────────────────────────
     Not a conversation — a reference. Each turn is labelled with the block it
     demonstrates, and the block explains itself before showing itself, so the
     session can be read as documentation of Ray's vocabulary rather than as a
     staged exchange about a tender.                                          */
  const UI_CATALOGUE = [
    { role: 'user', text: 'Short answer' },
    { role: 'assistant',
      text: '<div class="ray-what">A fact lifted straight from a document. One or two '
        + 'sentences, then a citation chip naming the file and page. This is most of '
        + 'what Ray returns.</div>'
        + 'Tenders close at 2:00pm AEST on <b>29 July 2026</b>.'
        + '\n<span class="ray-cite">Request for Tender.pdf p.3</span>' },

    { role: 'user', text: 'Long answer' },
    { role: 'assistant',
      text: '<div class="ray-what">Used for reviews and summaries. A bold lead-in, '
        + 'bulleted findings each carrying their own citation, and a closing note in '
        + 'grey saying what it cost to produce — how much was read, not how many '
        + 'tokens were spent.</div>'
        + '<b>What matters most</b>\n'
        + '<ul><li>A finding, stated plainly, with the evidence attached. '
        + '<span class="ray-cite">Request for Tender.pdf p.91</span></li>'
        + '<li>A second finding. Bold is used for the part that changes a decision — '
        + '<b>$20M → $25M</b> — not for emphasis generally. '
        + '<span class="ray-cite">Scope of Works — Addendum 2.docx p.2</span></li>'
        + '<li>A third. Bullets stay to one idea each. '
        + '<span class="ray-cite">Site Survey (scanned).pdf p.17 (OCR)</span></li></ul>'
        + '\n<span class="ray-note">The closing note: what was opened, and what that '
        + 'avoided opening.</span>' },

    { role: 'user', text: 'Table' },
    { role: 'assistant',
      text: '<div class="ray-what">For comparing things — documents against strategies, '
        + 'questions against library answers. Numeric columns never wrap; the whole '
        + 'table scrolls sideways inside the rail rather than squeezing.</div>'
        + '<table class="ray-tbl"><thead><tr><th>Document</th><th class="n">Pages</th>'
        + '<th>Strategy</th><th>Why</th></tr></thead><tbody>'
        + '<tr><td>A large text-layer PDF</td><td class="n">148p</td>'
        + '<td><span class="ray-strat s-paged">Page-by-page</span></td>'
        + '<td>outline first, then only the pages that matter</td></tr>'
        + '<tr><td>A small document</td><td class="n">11p</td>'
        + '<td><span class="ray-strat s-whole">Whole file</span></td>'
        + '<td>small enough to hold in context in one pass</td></tr>'
        + '<tr><td>A scan with no text layer</td><td class="n">34p</td>'
        + '<td><span class="ray-strat s-ocr">OCR</span></td>'
        + '<td>rasterised pages, OCR’d on demand and cached</td></tr>'
        + '</tbody></table>' },

    { role: 'user', text: 'Badges' },
    { role: 'assistant',
      text: '<div class="ray-what">Small pills that classify a row. Reading strategies '
        + 'use one set; Response Library coverage uses another. They carry meaning, so '
        + 'the same colour always means the same kind of thing.</div>'
        + '<b>Reading strategy</b>\n'
        + '<span class="ray-strat s-whole">Whole file</span> '
        + '<span class="ray-strat s-paged">Page-by-page</span> '
        + '<span class="ray-strat s-ocr">OCR</span> '
        + '<span class="ray-strat s-lazy">On demand</span>'
        + '\n\n<b>Library coverage</b>\n'
        + '<span class="ray-match">Library match · 81% win</span> '
        + '<span class="ray-gap">No match</span>' },

    { role: 'user', text: 'Draft block' },
    { role: 'assistant',
      text: '<div class="ray-what">Content Ray has written for a field, set apart from '
        + 'the surrounding prose so it is obvious what would be inserted. The actions '
        + 'below it act on the page, not the conversation.</div>'
        + '<div class="ray-draft">The drafted text sits in its own block. It is Ray’s '
        + 'output rather than Ray’s explanation, and the two should never be mistaken '
        + 'for each other — one goes into the tender, the other does not.</div>'
        + '<span class="ray-cite">Grounded in Request for Tender.pdf p.109</span>\n'
        + '<button class="ray-act" data-ray-action="insert">Insert into the field</button> '
        + '<button class="ray-act ghost" data-ray-action="library">Save to Response Library</button>' },

    { role: 'user', text: 'Response Library card' },
    { role: 'assistant',
      text: '<div class="ray-what">A reusable answer already written by the business, '
        + 'with the metadata that decides whether to reuse it: category, length, and '
        + 'how often it has won.</div>'
        + '<div class="ray-libcard"><b>The saved question this answer covers.</b>'
        + '<div class="m">Category · 392 words · 81% win rate</div>'
        + '<p>The opening of the stored answer, truncated — enough to judge whether it '
        + 'is the right one to reuse…</p>'
        + '<button class="ray-act" data-ray-action="insert">Insert</button></div>' },

    { role: 'user', text: 'Attachments',
      attachments: [
        { id: 'd-scope', name: 'A document from the tender.docx', kind: 'docx', pages: 11 },
        { id: 'd-upgeo', name: 'An uploaded scan.pdf', kind: 'pdf', pages: 18 },
      ] },
    { role: 'assistant',
      text: '<div class="ray-what">Documents sent with a message appear as cards beneath '
        + 'it — icon tiled by file type, name, and what it is. The same card shows in '
        + 'the composer before you send. Attached files are read first, ahead of '
        + 'anything else on the tender.</div>'
        + 'Ray answers from the attachments and says so, rather than searching the '
        + 'whole tender and hoping it lands on the same file.' },

    { role: 'user', text: 'Permission refusal' },
    { role: 'assistant',
      text: '<div class="ray-what">When the guard blocks a fetch, Ray stops and says so. '
        + 'It never speculates about what it could not open, and never implies the item '
        + 'does not exist.</div>'
        + 'The part of the answer Ray <i>can</i> give still comes first.'
        + '\n\n<span class="ray-deny"><span class="ms">lock</span> I stopped short '
        + 'because one item is outside your access — the reason is stated plainly. Ask a '
        + 'Business Admin if you need it.</span>' },

    { role: 'user', text: 'Retrieved messages' },
    { role: 'assistant',
      text: '<div class="ray-what">When Ray fetches older turns that are no longer in '
        + 'context, it quotes them rather than paraphrasing — so you can see exactly '
        + 'what was said, and that it was retrieved rather than remembered.</div>'
        + '<blockquote><b>You:</b> The earlier question, quoted verbatim.</blockquote>'
        + '<blockquote><b>Ray:</b> The earlier answer, quoted verbatim.</blockquote>'
        + '\n<span class="ray-note">Retrieved 2 messages from storage — they were not '
        + 'in context.</span>' },

    { role: 'user', text: 'Thinking block' },
    { role: 'assistant', ms: 3700,
      steps: [
        { name: 'list_documents', summary: 'what each step did, in one line', ok: true },
        { name: 'plan_document_review', summary: 'a strategy chosen per document', ok: true },
        { name: 'search_document', summary: 'find the passages before reading them', ok: true },
        { name: 'read_pages', summary: 'only the pages the search pointed at', ok: true },
        { name: 'read_pages', summary: 'a step the guard refused — shown in red', ok: false },
      ],
      text: '<div class="ray-what">Every answer carries one. While Ray works the steps '
        + 'arrive live; when the answer is ready the block folds to a single line. Click '
        + 'the line above to open it — the steps are kept, including any the permission '
        + 'guard refused.</div>'
        + 'The answer itself then follows, and the reasoning stays out of its way.' },
  ];

  global.RayFixtures = { USERS, TENDERS, DOCUMENTS, PAGE_TEXT, RESPONSE_LIBRARY,
                         PROMPT_LIBRARY, SEED_CONVERSATION, UI_CATALOGUE, CREDITS };
})(window);
