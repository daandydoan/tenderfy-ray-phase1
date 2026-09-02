/* ═══════════════════════════════════════════════════════════════════════════
   §4 — Permission & security-based data fetching.

   The guard is the ONLY door to data. Repositories below never expose a raw
   fetch; every read takes an AccessContext and is filtered before it returns.
   The model never sees a row it was not entitled to, because the filtering
   happens under the tool executor, not in the panel.

   Three layers, cheapest first:
     1. scope     — does this role hold the permission string at all?
     2. tenancy   — does the record belong to the user's business?
     3. record    — is this specific record inside the user's assignment,
                    and does its classification allow the role to read it?

   Every decision is written to an audit trail so a denial is explainable.
   ═════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const AUDIT = [];
  const auditListeners = [];

  /* In the platform this is a server-side log. Here it is a bounded ring so a
     long session cannot grow it without limit. */
  const AUDIT_LIMIT = 500;

  function record(entry) {
    AUDIT.push(entry);
    if (AUDIT.length > AUDIT_LIMIT) AUDIT.splice(0, AUDIT.length - AUDIT_LIMIT);
    auditListeners.forEach((fn) => fn(entry));
    return entry;
  }

  /** Raised inside a tool executor; the loop converts it into a structured
   *  tool result so the model can explain the refusal rather than guess. */
  class PermissionError extends Error {
    constructor(action, resource, reason) {
      super(`Permission denied: ${action} on ${resource} — ${reason}`);
      this.name = 'PermissionError';
      this.action = action;
      this.resource = resource;
      this.reason = reason;
      this.denied = true;
    }
  }

  /* Classifications a role may read. Anything not listed is refused even when
     the scope string is held — "document.read" is not "read every document". */
  const CLASSIFICATION_RULES = {
    'Business Admin':            ['public', 'internal', 'confidential'],
    'Estimator':                 ['public', 'internal', 'confidential'],
    'Bid Coordinator (read-only)': ['public', 'internal'],
    'External Reviewer':         ['public'],
  };

  class PermissionGuard {
    constructor(user) { this.user = user; }

    get scopes() { return this.user.scopes || []; }

    /** Layer 1. Throws unless the role holds the scope. */
    assertScope(action, resourceLabel) {
      const ok = this.scopes.includes(action);
      record({ at: Date.now(), user: this.user.id, action, resource: resourceLabel,
               layer: 'scope', allowed: ok });
      if (!ok) {
        throw new PermissionError(action, resourceLabel,
          `role "${this.user.role}" does not hold "${action}"`);
      }
      return true;
    }

    /** Layers 2+3 as a predicate — used to filter lists silently. A list is
     *  filtered rather than refused: the user learns nothing about rows they
     *  cannot see, not even that they exist. */
    canRead(kind, rec) {
      if (!rec) return false;
      if (rec.businessId && rec.businessId !== this.user.businessId) return false;

      if (kind === 'tender') {
        return this.user.tenderIds.includes(rec.id);
      }
      if (kind === 'document') {
        if (!this.user.tenderIds.includes(rec.tenderId)) return false;
        const allowed = CLASSIFICATION_RULES[this.user.role] || ['public'];
        return allowed.includes(rec.classification || 'internal');
      }
      if (kind === 'response') {
        return rec.businessId === this.user.businessId;
      }
      if (kind === 'conversation') {
        return rec.userId === this.user.id;
      }
      return false;
    }

    /** Same checks, but for a record fetched by id — here a refusal is loud,
     *  because the caller named something specific. */
    assertRead(kind, rec, label) {
      this.assertScope(`${kind === 'response' ? 'response_library' : kind}.read`, label);
      const ok = this.canRead(kind, rec);
      record({ at: Date.now(), user: this.user.id, action: `${kind}.read`,
               resource: label, layer: 'record', allowed: ok });
      if (!ok) {
        throw new PermissionError(`${kind}.read`, label,
          rec && rec.classification === 'confidential'
            ? `"${rec.classification}" documents are not readable by ${this.user.role}`
            : 'record is outside your assigned scope');
      }
      return rec;
    }

    /** Redaction for anything that does reach the model: never let a value the
     *  user cannot see leak through a summary. */
    describeScope() {
      return {
        user: this.user.name, role: this.user.role,
        business: this.user.businessId,
        tenders: this.user.tenderIds.length,
        scopes: this.scopes.length,
      };
    }
  }

  /* ── Repositories ───────────────────────────────────────────────────────
     Every method takes a guard. There is deliberately no un-guarded read. */
  const F = () => global.RayFixtures;

  const Repositories = {
    tenders: {
      list(guard) {
        guard.assertScope('tender.read', 'tenders');
        return F().TENDERS.filter((t) => guard.canRead('tender', t));
      },
      get(guard, id) {
        const t = F().TENDERS.find((x) => x.id === id);
        return guard.assertRead('tender', t, `tender:${id}`);
      },
    },
    documents: {
      list(guard, tenderId) {
        guard.assertScope('document.read', 'documents');
        return F().DOCUMENTS
          .filter((d) => !tenderId || d.tenderId === tenderId)
          .filter((d) => guard.canRead('document', d));
      },
      get(guard, id) {
        const d = F().DOCUMENTS.find((x) => x.id === id);
        return guard.assertRead('document', d, `document:${id}`);
      },
      /** Uploading is a write. An Estimator may read every document on a
       *  tender and still not be allowed to add one, so the attach flow is
       *  gated here rather than in the panel. */
      add(guard, doc) {
        guard.assertScope('document.write', 'documents');
        const t = F().TENDERS.find((x) => x.id === doc.tenderId);
        if (!t || !guard.canRead('tender', t)) {
          throw new PermissionError('document.write', `tender:${doc.tenderId}`,
            'you cannot add documents to a tender outside your scope');
        }
        F().DOCUMENTS.push(doc);
        return doc;
      },

      /** Page text is the most sensitive read of all — re-check per call,
       *  because a document handle may outlive the check that produced it. */
      pageText(guard, docId, page) {
        const d = this.get(guard, docId);
        const raw = F().PAGE_TEXT[`${docId}:${page}`];
        if (raw) return raw;
        return `[p.${page} of ${d.name} — no indexed text; body continues]`;
      },
    },
    promptLibrary: {
      list(guard) {
        guard.assertScope('prompt_library.read', 'prompt_library');
        return F().PROMPT_LIBRARY.filter((r) => r.businessId === guard.user.businessId);
      },
      add(guard, entry) {
        guard.assertScope('prompt_library.write', 'prompt_library');
        const rec = Object.assign({ id: 'p-' + Math.random().toString(36).slice(2, 8),
                                    businessId: guard.user.businessId,
                                    active: true }, entry);
        F().PROMPT_LIBRARY.push(rec);
        return rec;
      },
      /* Editing and retiring both live here because the manager screen owns
         them. A default prompt's wording is Tenderfy's, so it can be switched
         off but not rewritten — same rule as the default workflow. */
      update(guard, id, patch) {
        guard.assertScope('prompt_library.write', 'prompt_library');
        const r = this.list(guard).find((x) => x.id === id);
        if (!r) return null;
        if (r.isDefault && ('label' in patch || 'text' in patch)) {
          throw { reason: 'A default prompt’s wording cannot be changed. You can switch it off, or add your own.' };
        }
        return Object.assign(r, patch);
      },
      /* Nothing in the rail calls this: the picker only selects and adds,
         because the library is managed on its own screen. It stays because
         that screen is the caller — the contract is the point, not the UI
         this prototype happens to render. */
      remove(guard, id) {
        guard.assertScope('prompt_library.write', 'prompt_library');
        const rows = F().PROMPT_LIBRARY;
        const i = rows.findIndex((r) => r.id === id && r.businessId === guard.user.businessId);
        if (i >= 0) rows.splice(i, 1);
      },
    },
    /* Workflows are business configuration, not tender content: everyone in
       the business sees the same ones, and only a role holding
       workflow.write can change them. The default that ships with Tenderfy
       is read-only — copying it is how you get an editable version, so a
       business can never break the method it was sold. */
    workflows: {
      list(guard) {
        guard.assertScope('workflow.read', 'workflows');
        return F().WORKFLOWS.filter((w) => w.businessId === guard.user.businessId);
      },
      get(guard, id) {
        return this.list(guard).find((w) => w.id === id) || null;
      },
      add(guard, entry) {
        guard.assertScope('workflow.write', 'workflows');
        const rec = Object.assign({ id: 'wf-' + Math.random().toString(36).slice(2, 8),
                                    businessId: guard.user.businessId,
                                    active: true, steps: [] }, entry);
        F().WORKFLOWS.push(rec);
        return rec;
      },
      update(guard, id, patch) {
        guard.assertScope('workflow.write', 'workflows');
        const w = this.get(guard, id);
        if (!w) return null;
        if (w.isDefault) {
          throw { reason: 'The Tenderfy Method cannot be edited. Duplicate it to make your own version.' };
        }
        return Object.assign(w, patch);
      },
      remove(guard, id) {
        guard.assertScope('workflow.write', 'workflows');
        const rows = F().WORKFLOWS;
        const i = rows.findIndex((w) => w.id === id && w.businessId === guard.user.businessId);
        if (i < 0) return;
        if (rows[i].isDefault) {
          throw { reason: 'The Tenderfy Method cannot be deleted.' };
        }
        rows.splice(i, 1);
      },
    },
    responseLibrary: {
      list(guard) {
        guard.assertScope('response_library.read', 'response_library');
        return F().RESPONSE_LIBRARY.filter((r) => guard.canRead('response', r));
      },
      add(guard, entry) {
        guard.assertScope('response_library.write', 'response_library');
        const rec = Object.assign({ id: 'r-' + Math.random().toString(36).slice(2, 8),
                                    businessId: guard.user.businessId }, entry);
        F().RESPONSE_LIBRARY.push(rec);
        return rec;
      },
    },
  };

  global.RayPermissions = {
    PermissionGuard, PermissionError, Repositories,
    audit: AUDIT,
    onAudit(fn) { auditListeners.push(fn); },
    clearAudit() { AUDIT.length = 0; },
  };
})(window);
