/* ═══════════════════════════════════════════════════════════════════════════
   §1 — Surfaces. One service, many mount points.

   A surface is a *declaration*, not an implementation: what page Ray is on,
   what the user is looking at, which tools matter most here, and what to
   suggest. Every integration point in the spec is a row in this file — adding
   another is data, not a new Ray.

   Ray itself is site-wide. `primary` orders the tool schemas and drives the
   suggestion chips; it does not fence Ray in, because the user's permissions
   already do that (see ToolRegistry.forSurface).

   `card()` produces the surface context card: a small structured block that
   goes into every prompt in place of "here is the whole page". It is the
   cheapest context Ray has, and the reason a 148-page tender costs ~200
   tokens to be *aware* of.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const READ_TOOLS = ['list_tenders', 'get_tender', 'list_documents',
                      'search_conversation', 'search_response_library'];
  const DOC_TOOLS = ['plan_document_review', 'outline_document', 'read_pages',
                     'search_document', 'read_whole_document'];

  const SURFACES = {

    /* Any platform page. The generalist — this is what the FAB opens. */
    page: {
      id: 'page', title: 'Ray', subtitle: 'Tenderfy Co-Pilot',
      primary: READ_TOOLS.concat(DOC_TOOLS, ['generate_content']),
      suggestions: [
        'What are the evaluation criteria on this tender?',
        'What insurance is required?',
        'Which tenders am I on?',
      ],
      card(c) {
        return [
          `PAGE: ${c.pageTitle || 'Tenderfy'}`,
          c.tender ? `TENDER: ${c.tender.name} (${c.tender.ref}) · due ${c.tender.due} · ${c.tender.status}` : null,
          c.documentCount != null ? `DOCUMENTS VISIBLE TO USER: ${c.documentCount}` : null,
        ].filter(Boolean).join('\n');
      },
    },

    /* Tender detail — same panel, richer card, doc tools to hand. */
    tender: {
      id: 'tender', title: 'Ray', subtitle: 'Reviewing this tender',
      primary: READ_TOOLS.concat(DOC_TOOLS, ['extract_questions', 'generate_content']),
      suggestions: [
        'Review all documents for this tender',
        'What changed in Addendum 2?',
        'Extract the response schedule questions',
      ],
      card(c) {
        const t = c.tender || {};
        return [
          `PAGE: Tender detail`,
          `TENDER: ${t.name} (${t.ref})`,
          `ORGANISATION: ${t.org} · SECTOR: ${t.sector} · DUE: ${t.due} · STATUS: ${t.status}`,
          c.documents ? `DOCUMENTS: ${c.documents.map((d) => `${d.name} (${d.pages}p${d.scanned ? ', scanned' : ''})`).join('; ')}` : null,
        ].filter(Boolean).join('\n');
      },
    },

    /* Multi-document review. Opens straight into a review with no typing. */
    'document-review': {
      id: 'document-review', title: 'Ray', subtitle: 'Multi-document review',
      intentHint: 'review',
      primary: READ_TOOLS.concat(DOC_TOOLS, ['extract_questions']),
      suggestions: [
        'Review all documents for this tender',
        'What are the risks in the draft contract?',
        'Which requirements conflict between documents?',
      ],
      card(c) {
        return [
          'PAGE: Document review',
          c.tender ? `TENDER: ${c.tender.name}` : null,
          `SELECTED: ${(c.documents || []).map((d) => d.name).join('; ') || 'all documents'}`,
          'NOTE: choose a reading strategy per document before reading anything.',
        ].filter(Boolean).join('\n');
      },
    },

    /* An edit dialog — a block, a field, a section of a document being
       written. The card carries the field and its limit, so drafts land at
       the right length without the user restating it. */
    'edit-dialog': {
      id: 'edit-dialog', title: 'Ray', subtitle: 'Writing with you',
      primary: ['search_response_library', 'create_response_entry', 'search_document',
              'read_pages', 'generate_content', 'search_conversation'],
      suggestions: [
        'Draft an answer for this question',
        'Tighten this to the word limit',
        'Find a Response Library answer I can reuse',
      ],
      card(c) {
        return [
          `PAGE: Edit dialog`,
          `FIELD: ${c.field || 'content'}${c.wordLimit ? ` · WORD LIMIT: ${c.wordLimit}` : ''}`,
          c.tender ? `TENDER: ${c.tender.name}` : null,
          c.currentValue ? `CURRENT VALUE (truncated): ${String(c.currentValue).slice(0, 400)}` : 'CURRENT VALUE: empty',
        ].filter(Boolean).join('\n');
      },
    },

    /* Response Library. */
    'response-library': {
      id: 'response-library', title: 'Ray', subtitle: 'Response Library',
      primary: ['search_response_library', 'create_response_entry', 'generate_content',
              'search_conversation', 'search_document', 'list_documents'],
      suggestions: [
        'Find a past answer about environmental management',
        'Which questions have no library answer?',
        'Draft a new answer for local content',
      ],
      card(c) {
        return [`PAGE: Response Library`,
                `ENTRIES VISIBLE TO USER: ${c.entryCount != null ? c.entryCount : 'unknown'}`,
                'NOTE: prefer reusing an existing entry over writing a new one.'].join('\n');
      },
    },

    /* Document Workspace. Previously owned its own extraction + library code;
       now it is a surface like any other, with the same tools and guard. */
    'document-workspace': {
      id: 'document-workspace', title: 'Ray', subtitle: 'Document Workspace',
      intentHint: 'extract',
      primary: READ_TOOLS.concat(DOC_TOOLS, ['extract_questions', 'create_response_entry', 'generate_content']),
      suggestions: [
        'Extract the questions from this RFT',
        'Which questions can I answer from the library?',
        'Draft answers for the gaps',
      ],
      card(c) {
        return ['PAGE: Document Workspace',
                c.tender ? `TENDER: ${c.tender.name}` : null,
                c.document ? `OPEN DOCUMENT: ${c.document.name} (${c.document.pages}p)` : null,
                'NOTE: question extraction and Response Library writes run through the shared tools.'].filter(Boolean).join('\n');
      },
    },
  };

  function resolve(id) { return SURFACES[id] || SURFACES.page; }

  global.RaySurfaces = { SURFACES, resolve };
})(window);
