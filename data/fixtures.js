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
        'workflow.read', 'workflow.write',
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
        'workflow.read', 'workflow.write',
        'conversation.read', 'conversation.write', 'pricing.read',
      ],
    },
    {
      id: 'u-jl', name: 'Jordan Lee', initials: 'JL', role: 'Bid Coordinator (read-only)',
      businessId: 'biz-tc', tenderIds: ['t-envind'],
      scopes: ['tender.read', 'document.read', 'response_library.read',
               'prompt_library.read', 'workflow.read',
               'conversation.read', 'conversation.write'],
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
  /* `isDefault` rows ship with Tenderfy; the rest the business wrote. Only
     `active` rows reach the composer's picker, so switching one off retires
     it without losing the wording — which is the whole reason status is a
     field rather than a delete. */
  const PROMPT_LIBRARY = [
    { id: 'p-gonogo', businessId: 'biz-tc', isDefault: true, active: true,
      created: '2024-01-07',
      label: 'Compare scope to specs and flag any risks for our Go/No-Go check.',
      text: 'Produce a structured bid / no-bid (Go/No-Go) assessment of this tender. Cover EVERY item in the Tenderfy criteria — strategic fit, capability, commercial viability, mandatory requirements and risk — rating each Green, Amber or Red with the reason. Name anything you could not find rather than assuming it.' },
    { id: 'p-dates', businessId: 'biz-tc', isDefault: true, active: true,
      created: '2024-01-07',
      label: 'Identify any ambiguous requirements, unrealistic timelines, or scope gaps that could affect our bid decision.',
      text: 'Extract every date, deadline, milestone, lead time, validity period and notice period mentioned anywhere in these documents, then flag the ones that conflict with each other or leave too little time to deliver. Quote the clause for each.' },
    { id: 'p-capability', businessId: 'biz-tc', isDefault: true, active: false,
      created: '2024-01-07',
      label: 'Assess our capability alignment against the client’s stated experience and resource requirements.',
      text: 'Summarise the technical approach the issuer expects in this tender so we can frame our response against it, then compare each expectation to what our company has actually delivered before. Separate what we can evidence from what we would have to claim.' },
    { id: 'p-compliance', businessId: 'biz-tc', isDefault: true, active: false,
      created: '2024-01-07',
      label: 'Flag any contractual red flags, unusual liability clauses, or onerous conditions we should review before proceeding.',
      text: 'Audit every mandatory compliance requirement the proponent must meet to bid AND to deliver this tender. Treat liability caps, indemnities, liquidated damages and insurance levels as red flags where they sit outside market norms, and say which are negotiable.' },
    { id: 'p-conflict', businessId: 'biz-tc', active: true, created: '2024-03-19',
      label: 'Find conflicts across documents',
      text: 'Review every document on this tender and list anything that conflicts between them — especially where an addendum overrides the original.' },
    { id: 'p-schedule', businessId: 'biz-tc', active: true, created: '2024-03-19',
      label: 'Pull the response schedule',
      text: 'Extract the response schedule questions with their word limits and page numbers, and tell me which ones we already have a library answer for.' },
    { id: 'p-risk', businessId: 'biz-tc', active: true, created: '2024-05-02',
      label: 'Commercial risk check',
      text: 'What are the commercial risks in this tender? Cover liquidated damages, insurance levels, payment terms and tender validity.' },
    { id: 'p-draft', businessId: 'biz-tc', active: false, created: '2024-05-02',
      label: 'Draft from our best answer',
      text: 'Draft an answer for this question using our highest-scoring Response Library entry, updated against this tender’s requirements. Stay inside the word limit.' },
  ];

  /* ── Workflows ──────────────────────────────────────────────────────────
     A workflow is an ordered list of prompts Ray runs one at a time, pausing
     for approval between each. The Tenderfy Method is the one that ships;
     a business can copy it, edit it, or write its own. Step `k` matches the
     keys in app.js's STEPS, which is what lets the panel's guide and this
     screen describe the same eight things.                                  */
  const WORKFLOWS = [
    { id: 'wf-tenderfy', businessId: 'biz-tc', isDefault: true, active: true,
      created: '2024-01-07', name: 'Tenderfy Method',
      description: 'The eight steps Tenderfy recommends for every bid, from the Go / No-Go call through to the final compliance check. Each one ends with your review and approval before Ray moves on.',
      steps: [
        { k: 'gonogo', title: 'Go / No-Go',
          prompt: 'Rate this opportunity against the Tenderfy Go / No-Go criteria — strategic fit, capability, commercial viability, mandatory requirements and risk — as Green, Amber or Red with a reason for each. Then recommend GO, GO SUBJECT TO CONDITIONS, HOLD or NO-GO. Name any missing information rather than assuming it.' },
        { k: 'plan', title: 'Plan the tender',
          prompt: 'Work backwards from the closing date to a task list — title, brief, due date, priority, suggested assignee — and a Delivery Plan covering milestones, responsibilities, risks and approvals. Mark which tasks you could do yourself, but start none of them until I say so.' },
        { k: 'buyer', title: 'Understand the buyer',
          prompt: 'Research this buyer’s goals, initiatives and public commitments, compare them against what our company genuinely does, and propose specific value-adds. Not "strong communication" — a named plan, programme or measurable improvement, each with how it would be implemented and what evidence supports it.' },
        { k: 'feedback', title: 'Learn from feedback',
          prompt: 'Search our previous tenders to this same buyer for scores, evaluator comments and outcomes, then turn them into things to repeat and things to fix. Do not apply feedback from other buyers, and if none exists for this one, say so.' },
        { k: 'schedule', title: 'Complete the responses',
          prompt: 'Pull out every question in the response schedule with its word limit, mandatory flag and evaluation weighting, then answer each one against the buyer’s requirements using company knowledge and everything approved earlier in this bid. Flag anything needing specialist input rather than inventing it.' },
        { k: 'method', title: 'Methodology & technical',
          prompt: 'Build project-specific methodology from the scope, programme and technical documents — sequencing, resources, interfaces, risk, commissioning — as a narrative of how the work actually gets done. Raise technical gaps for an SME rather than filling them in.' },
        { k: 'build', title: 'Build the tender',
          prompt: 'Choose the template and structure, then select and rework content for this specific bid — resumes, project profiles, methodologies, value-adds — rather than reusing it unchanged. Keep edits on the tender copy; never overwrite master library content.' },
        { k: 'final', title: 'Final review',
          prompt: 'Check the submission against the original documents — every mandatory requirement, every question, word limits, schedules, signatures — then read it as an evaluator would and sort what you find into Critical, Recommended and Optional. I make the call that it is ready.' },
      ] },
    { id: 'wf-quick', businessId: 'biz-tc', active: true, created: '2024-06-11',
      name: 'Quick qualification', 
      description: 'A three-step pass for the tenders that arrive on a Friday afternoon — enough to decide whether they are worth a proper look on Monday.',
      steps: [
        { k: 'scan', title: 'Scan the pack',
          prompt: 'List what is in this tender pack, what each document is for, and anything that appears to be missing from a standard set.' },
        { k: 'gates', title: 'Check the gates',
          prompt: 'Find the mandatory requirements we would be excluded on — licences, insurance levels, turnover, certifications, local content — and tell me plainly whether we meet each one.' },
        { k: 'call', title: 'Make the call',
          prompt: 'On what you have found, recommend whether this is worth a full Go / No-Go, and give me the two or three things that would decide it.' },
      ] },
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
    { role: 'assistant', ms: 1800,
      steps: [
        { name: 'search_document', summary: 'find the passage before reading it', ok: true },
        { name: 'read_pages', summary: 'one page, the one the search pointed at', ok: true },
      ],
      text: '<div class="ray-what">A fact lifted straight from a document. One or two '
        + 'sentences, then a citation chip naming the file and page. This is most of '
        + 'what Ray returns.<br><br>Every answer carries the folded line above it: '
        + 'while Ray works the steps arrive live, and once the answer is ready the '
        + 'block collapses to one line. Click it to see the steps — they are kept, '
        + 'including any the permission guard refused.</div>'
        + 'The answer sits here, in a sentence or two, with the source named underneath.'
        + '\n<span class="ray-cite">Document name.pdf p.12</span>' },

    { role: 'user', text: 'Long answer' },
    { role: 'assistant', ms: 4100,
      steps: [
        { name: 'list_documents', summary: 'what is readable on this record', ok: true },
        { name: 'outline_document', summary: 'sections first, so the read can be narrowed', ok: true },
        { name: 'read_pages', summary: 'only the pages that carry the answer', ok: true },
      ],
      text: '<div class="ray-what">Used for reviews and summaries. A bold lead-in, '
        + 'bulleted findings each carrying their own citation, and a closing note in '
        + 'grey saying what it cost to produce — how much was read, not how many '
        + 'tokens were spent.</div>'
        + '<b>A heading, when the answer has parts</b>\n'
        + '<ul><li>A finding, stated plainly, with its evidence attached. '
        + '<span class="ray-cite">Document name.pdf p.4</span></li>'
        + '<li>Bold marks the part that <b>changes a decision</b> — a figure, a date, a '
        + 'threshold — not emphasis generally. '
        + '<span class="ray-cite">Another document.docx p.9</span></li>'
        + '<li>One idea per bullet; the citation says where it came from. '
        + '<span class="ray-cite">A scanned file.pdf p.17 (OCR)</span></li></ul>'
        + '\n<span class="ray-note">The closing note: what was opened, and what that '
        + 'avoided opening.</span>' },

    { role: 'user', text: 'Table' },
    { role: 'assistant', ms: 2600,
      steps: [
        { name: 'list_documents', summary: 'what is readable on this record', ok: true },
        { name: 'plan_document_review', summary: 'a strategy chosen per document', ok: true },
      ],
      text: '<div class="ray-what">For comparing things — documents against strategies, '
        + 'questions against saved answers. Numeric columns never wrap; the whole table '
        + 'scrolls sideways inside the rail rather than squeezing.</div>'
        + '<table class="ray-tbl"><thead><tr><th>Item</th><th class="n">Size</th>'
        + '<th>Label</th><th>Reason</th></tr></thead><tbody>'
        + '<tr><td>First row</td><td class="n">148p</td>'
        + '<td><span class="ray-strat s-paged">Page-by-page</span></td>'
        + '<td>a short line explaining the label</td></tr>'
        + '<tr><td>Second row</td><td class="n">11p</td>'
        + '<td><span class="ray-strat s-whole">Whole file</span></td>'
        + '<td>a short line explaining the label</td></tr>'
        + '<tr><td>Third row</td><td class="n">34p</td>'
        + '<td><span class="ray-strat s-ocr">OCR</span></td>'
        + '<td>a short line explaining the label</td></tr>'
        + '</tbody></table>' },

    { role: 'user', text: 'Badges' },
    { role: 'assistant', ms: 2300,
      steps: [
        { name: 'list_documents', summary: 'what is readable on this record', ok: true },
        { name: 'plan_document_review', summary: 'a strategy chosen per document', ok: true },
      ],
      text: '<div class="ray-what">Small pills that classify a row. Reading strategies '
        + 'use one set; saved-answer coverage uses another. They carry meaning, so the '
        + 'same colour always means the same kind of thing.</div>'
        + '<b>Reading strategy</b>\n'
        + '<span class="ray-strat s-whole">Whole file</span> '
        + '<span class="ray-strat s-paged">Page-by-page</span> '
        + '<span class="ray-strat s-ocr">OCR</span> '
        + '<span class="ray-strat s-lazy">On demand</span>'
        + '\n\n<b>Coverage</b>\n'
        + '<span class="ray-match">Match found</span> '
        + '<span class="ray-gap">No match</span>' },

    { role: 'user', text: 'Block' },
    { role: 'assistant', ms: 3200,
      steps: [
        { name: 'search_response_library', summary: 'check for something reusable first', ok: true },
        { name: 'search_document', summary: 'gather what the draft should be built on', ok: true },
        { name: 'generate_content', summary: 'drafted to the field’s word limit', ok: true },
      ],
      text: '<div class="ray-what">Content Ray has written for a field, set apart from '
        + 'the surrounding prose so it is obvious what would be inserted. The actions '
        + 'below it act on the page, not the conversation.</div>'
        + '<div class="ray-draft">The drafted text sits in its own block. It is Ray’s '
        + 'output rather than Ray’s explanation, and the two should never be mistaken '
        + 'for each other — one goes into the document, the other does not.</div>'
        + '<span class="ray-cite">Grounded in Document name.pdf p.8</span>\n'
        + '<button class="ray-act" data-ray-action="insert">Insert into the field</button> '
        + '<button class="ray-act ghost" data-ray-action="library">Save for reuse</button>' },

    { role: 'user', text: 'CTA Card' },
    { role: 'assistant', ms: 1400,
      steps: [
        { name: 'search_response_library', summary: 'one reusable answer, scored', ok: true },
      ],
      text: '<div class="ray-what">Something already written and worth reusing, with the '
        + 'metadata that decides whether to reuse it: category, length, and how often it '
        + 'has worked.</div>'
        + '<div class="ray-libcard"><b>The question this saved answer covers.</b>'
        + '<div class="m">Category · 392 words · 81% win rate</div>'
        + '<p>The opening of the stored answer, truncated — enough to judge whether it '
        + 'is the right one to reuse…</p>'
        + '<button class="ray-act" data-ray-action="insert">Insert</button></div>' },

    { role: 'user', text: 'Attachments',
      attachments: [
        { id: 'd-scope', name: 'Document name.docx', kind: 'docx', pages: 11 },
        { id: 'd-upgeo', name: 'Scanned upload.pdf', kind: 'pdf', pages: 18 },
      ] },
    { role: 'assistant', ms: 2100,
      steps: [
        { name: 'search_document', summary: 'search inside what was handed over', ok: true },
        { name: 'read_pages', summary: 'only the pages that matched', ok: true },
      ],
      text: '<div class="ray-what">Documents sent with a message appear as cards beneath '
        + 'it — icon tiled by file type, name, and what it is. The same card shows below '
        + 'the composer before you send. Attached files are read first, ahead of '
        + 'anything else.</div>'
        + 'Ray answers from the attachments and says so, rather than searching '
        + 'everything and hoping it lands on the same file.' },

    { role: 'user', text: 'No permission' },
    { role: 'assistant', ms: 900,
      steps: [
        { name: 'list_tenders', summary: 'what is in scope for this user', ok: true },
        { name: 'get_tender', summary: 'a step the guard refused — shown in red', ok: false },
      ],
      text: '<div class="ray-what">When the guard blocks a fetch, Ray stops and says so. '
        + 'It never speculates about what it could not open, and never implies the item '
        + 'does not exist.</div>'
        + 'The part of the answer Ray <i>can</i> give still comes first.'
        + '\n\n<span class="ray-deny"><span class="ms">lock</span> I stopped short '
        + 'because one item is outside your access — the reason is stated plainly. Ask an '
        + 'administrator if you need it.</span>' },

    { role: 'user', text: 'Quotes' },
    { role: 'assistant', ms: 1200,
      steps: [
        { name: 'search_conversation', summary: 'earlier messages, retrieved not resent', ok: true },
      ],
      text: '<div class="ray-what">When Ray fetches older turns that are no longer in '
        + 'context, it quotes them rather than paraphrasing — so you can see exactly what '
        + 'was said, and that it was retrieved rather than remembered.</div>'
        + '<blockquote><b>You:</b> The earlier question, quoted verbatim.</blockquote>'
        + '<blockquote><b>Ray:</b> The earlier answer, quoted verbatim.</blockquote>'
        + '\n<span class="ray-note">Retrieved 2 messages from storage — they were not '
        + 'in context.</span>' },

  ];

  global.RayFixtures = { USERS, TENDERS, DOCUMENTS, PAGE_TEXT, RESPONSE_LIBRARY,
                         PROMPT_LIBRARY, WORKFLOWS, SEED_CONVERSATION, UI_CATALOGUE, CREDITS };
})(window);
