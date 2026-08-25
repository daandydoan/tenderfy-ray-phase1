# Ray — Phase 1 architecture

One service, one panel, one set of tools, one guard. Every AI feature on the
platform is a *surface declaration* against that service rather than its own
implementation.

```
   the site rail ──────▶ ┌──────────────────────────────┐
   (one per page load,   │  RayPanel  (presentation)    │
    pushes the content)  └───────────────┬──────────────┘
                                         │  focus + context
                        ┌────────────────▼──────────────┐
                        │  RayService  (the only entry) │
                        │  · assemble context           │
                        │  · run the agentic loop       │
                        │  · persist the turn           │
                        └───┬───────────┬───────────┬───┘
                            │           │           │
              ┌─────────────▼──┐  ┌─────▼──────┐  ┌─▼────────────────┐
              │ ContextAssembler│  │ToolRegistry│  │ ModelProvider    │
              │ + Conversation  │  │ + executor │  │ (Anthropic|Mock) │
              │   Store   §2    │  │      §1    │  │        §3        │
              └─────────────────┘  └─────┬──────┘  └──────────────────┘
                                         │ every call
                              ┌──────────▼───────────┐
                              │  PermissionGuard §4  │
                              │  scope → tenancy →   │
                              │  record → audit      │
                              └──────────┬───────────┘
                                         │
                        ┌────────────────▼────────────────┐
                        │ Repositories · DocumentReader §3 │
                        │ whole · paged · OCR · on-demand  │
                        └──────────────────────────────────┘
```

### A note on class names

The rail shares a stylesheet with the page furniture, and the page owns short
generic names. `.sub` — the page's subtitle class, carrying `margin: 0 0 20px` —
was silently adding 20px to every attachment card and every trace row. Rail
elements use rail-specific names for anything the page might also want:
`.kind`, `.tsub`, `.ray-*`. Worth keeping to when adding new blocks.

## Colour

The palette is **Tenderfy's own**, taken from the subbie portal's `styles.css`
rather than invented here — an earlier pass built a bespoke accent ramp and it
was off-brand. What the portal actually provides:

* **Brand** — `--teal #1D9E75`, `--teal-bright #6ADDB5`, `--cta #38988A` (the
  single colour every primary button uses), `--secondary #FFBC4A`,
  `--accent #F95246`.
* **Status pairs** — grey / amber / green / pink, each a *tinted background with
  dark text*. The portal never fills a badge with saturated colour.
* **Entity ramp** — the avatar palette it uses to tell one contractor from
  another: `#38988A`, `#5C6BC0`, `#EF6C00`, `#6D4C41`, `#00838F`. Reused here
  for anything that needs identity — which tender, which file type, which kind
  of tool call. Same five hues, same job.

Component conventions come from the same place: cards flat white at 12px radius
and 22px padding with no coloured caps; badges at 100px radius, 12px, weight
500; buttons at 12px radius, weight 600, flat `--cta` for primary; tabs as teal
text over a 4px `--teal-bright` underline; identity as a round initialled
`.ava`; the dashboard's numbers in a bordered `.stat-pill` whose active cell
fills with `--header`.

`rayTenderColour(id)` is shared between the page chrome and the rail, so a
tender's avatar and its session tiles are always the same hue.

**The rail runs dark, and can be switched.** Dark is the default — the one dark
surface in the product, on a ground from the portal's own `--header` family
(`#2A3038`), which separates the assistant from the document you are working on
without a border doing all the work. A light theme ships alongside it for rooms
and projectors where dark does not survive, and the switch sits **in the app
header** so it can be flipped live in front of an audience.

The mechanism: every rail colour is a `--r-*` token declared twice — once on
`.ray-panel`, once on `html.ray-light .ray-panel`. Nothing below the token block
reaches for a page token or a literal, so a theme is a class on `<html>` and
never a second set of rules to maintain. The switch applies instantly with no
reload, so whatever is on screen stays on screen. The override block sits at the
**end** of the stylesheet: it has to win at equal specificity, and an earlier
attempt to keep it beside the panel rules silently lost half its declarations.

Both themes were measured, not eyeballed:

| | dark | light |
|---|---|---|
| Body | 11.1:1 | 11.5:1 |
| Citations | 8.0:1 | 5.8:1 |
| Notes, timestamps, thinking | 5.2:1 | 4.7:1 |

Two values exist only because of that check: `--r-tx-3` lifted to `#98A3A9` in
dark (3.4:1 before), and the light accent darkened to `#0F7355` — the brand
`--teal` reads 3.4:1 on white, and a 12px citation needs 4.5.

An earlier pass wrapped the rail in the portal's `.msg-card` (white, bright
edge) and bylined both turns. It was reverted: the conversation reads better as
prose with the question set apart, and the dark ground does the separating that
the card border was there to do.

The categorical rule still holds: if two things share a colour it is because
they are the same kind of thing. It is now expressed in Tenderfy's vocabulary.

## The dashboard

`index.html` is a copy of the live business-admin dashboard
(`stgbusinessadmin.tenderfy.org/dashboard`), measured in the browser rather than
eyeballed from a screenshot: cards white at **15px** radius with
`0 2px 4px rgba(0,0,0,.16)` and no border, on a **six-column** grid where the
contract-value card spans two; numbers at 32px/24px **weight 400** over a 16px
label and a 12px `#C6C6C6` timestamp; the top bar is `--cta #38988A` at 56px and
the rail `#394645`; the page title is teal, 18px, weight 500, behind a 4px bar.
Tabs, the Priority button, the grouped task table with its three circular
actions, and Upcoming Tenders with its red *Date Overdue* all follow the live
markup.

The data is ours, not the staging data — the dashboard talks about the same
tenders Ray does, so the two surfaces stay coherent.

Layout responds with **container queries** on `.c-content`, not viewport media
queries. The rail takes up to 640px of the window, so a viewport breakpoint
would leave the page cramped while the window is still "large" — a bug this
prototype hit three times before the cause was named.

## The two demo sessions

The prototype seeds exactly two, doing different jobs:

* **Guided demo** — empty until it is run, one requirement per click. The
  trigger is the **composer itself**: clicking an empty chat field in this
  session types the next question in and sends it, and the placeholder names
  the step. The header button does the same and carries the counter. Each step
  runs for real, so the tool calls, thinking and streaming all happen. The eight
  steps map one-to-one onto the Phase 1 brief (§1 ×3, §2, §3 ×3, §4).

  Two guards keep it from leaking: the panel only asks the shell what a click
  means, and the shell only answers when the active session *is* the demo
  session, steps remain, and the composer is **empty** — so typing a real
  question, or editing one pulled from the prompt library, is never hijacked.
* **UI elements** — a reference, not a staged exchange. Each turn is labelled
  with the block it demonstrates and each block explains itself before showing
  itself, so the session reads as documentation of Ray's vocabulary. The
  explanatory lead-in is `.ray-what`: rule-marked and muted, so it never reads
  as part of the block it describes.

The §4 step asks for a tender belonging to **another business** rather than a
confidential file. A confidential file is only refused for *some* roles — a
Business Admin can read it, and the demo would land wrong. Tenancy is refused
for every role, which makes it the honest way to show the guard working.

## Demo seeding

The demo sessions are seeded once per user and **versioned** (`SEED_VERSION`).
A plain "have I seeded?" flag meant that anyone who had opened the prototype
before a new exhibit was added never received it, and the only cure was clearing
storage by hand — bump the version instead and it reaches everyone.

Seeded sessions carry a `seeded` flag in the thread index, and a rebuild keys
off that rather than off a list of ids: an older flag has no ids to offer, and
cleaning up by *what I made* is the only version of this that cannot leave
duplicates. There is also a one-time sweep for sessions seeded before the flag
existed, identified by exhibit title, history opener, or empty-and-untitled.
A session the user named or wrote in matches none of those and is never touched.

## Demo modes

The prototype ships with the architecture proof folded away (`ray_dev` off).
Default mode shows the product; detail mode (`?dev=1`) adds the reasoning trace,
the role switcher and the per-page explainer panels. Markup for the second layer
stays in the DOM under `.devonly` — this is a demo affordance, not a product
feature, and it does not exist in the port.

## Files

| File | Responsibility |
|---|---|
| `ray/ray-core.js` | `RayService`, `RaySession`, the agentic loop, the system prompt |
| `ray/ray-surfaces.js` | Every mount point, as data: tools, suggestions, context card |
| `ray/ray-tools.js` | Tool schemas + the single executor that all calls pass through |
| `ray/ray-context.js` | `ConversationStore` (persistence, retrieval), `ContextAssembler` (recency, compaction, budget), `ThreadIndex` (project → sessions) |
| `ray/ray-documents.js` | `DocumentReader` and the four reading strategies |
| `ray/ray-permissions.js` | `PermissionGuard`, `PermissionError`, guarded repositories, audit trail |
| `ray/ray-provider.js` | `AnthropicProvider` (real) and `MockProvider` (prototype), one interface |
| `ray/ray-panel.js` | The panel: dock / wide / inline, message rendering, trace drawer |

## §1 — One service, one rail, one conversation

Ray is a **region of the application**, not a widget a page owns.

* **It reads as a conversation, not a chat widget.** Ray's turns are prose set
  flush in the column — no tinted balloon, no avatar rail; the mark appears once
  as a small byline. Only the user's own words get a container, because that is
  the one thing you need to pick out when scanning back. Citations are quiet
  inline annotations, and the reasoning trace folds away to a single muted line.
  The Ray mark is present at 20px in the header and 16px on a byline, and
  nowhere competes with what it is saying.
* **It pushes, it does not overlay.** The rail is a flex sibling of `.c-main`
  inside `.capp`; opening it sets `--rail-w` and the page reflows to live
  beside it. Nothing is ever hidden behind Ray. Below 1180px there is no room
  to push, so it overlays instead — the one place the rule bends.
* **It persists.** Open state and width are stored, so the rail stays as you
  navigate. That continuity is most of what makes Ray read as an agent rather
  than a chat box.
* **Flat sessions.** One list per user, newest first, the way Figma's chats
  work. `RayService.thread(id)` returns the session; `ThreadIndex` tracks which
  sessions exist, their names, last reply and recency. Navigating calls
  `focus()`, never `mount()`: moving around the platform changes the context
  card, never the session you are sitting in.

  > The sync-up proposed **project-based** organisation (a thread per tender).
  > That was reversed on 24 Aug in favour of a flat list — simpler, and closer
  > to the reference. `ThreadIndex` still records the tender a session was
  > started from, so re-introducing grouping is a query rather than a
  > migration, but nothing reads it today. Worth re-confirming with Shivam.
* **Two screens, not a tab strip.** The rail is a *list* of sessions and the
  *session* itself, the way Figma's Agents panel works: rows grouped by day,
  each with a title, the last thing Ray said and a relative age; a back chevron
  is the only way out of a session. At 420px a tab strip costs 40px permanently
  and still truncates every title — a list screen costs nothing while you are
  reading, and shows the whole title when you are choosing. Search filters by
  title and snippet; `+` starts a session. A session names itself from the
  first thing asked in it.
* **A turn shows its work, then gets out of the way.** While tools run, the
  steps arrive live under a *Working…* header; when the answer is ready the
  block folds to `Thought for 3.7s · 8 steps`, collapsed, with the steps still
  in the DOM to reopen. The answer then **streams**: the markup is built up
  front and its text filled in progressively, so prose arrives word by word
  while a table or a draft arrives whole — a half-drawn table reads as a bug,
  not as thinking. Pacing is measured against the **clock**, not a tick count,
  so a slow or throttled frame reveals proportionally more rather than dragging
  the answer out. If the tab is hidden, both the provider's pacing and the
  stream are skipped and the answer renders whole: nobody is watching, Chrome
  throttles deeply nested timers there to once a minute, and a half-written
  answer waiting on the user's return is worse than no animation at all.
* **The composer region is its own band.** Below the conversation the rail
  splits off a labelled *Reference* section holding the chip and the composer,
  over a tinted ground with a hairline rule, so the input never reads as part of
  Ray's last answer. Each part hides itself when it has nothing to show: no
  context label without a chip, no credit notice under 60%. Suggested prompts
  appear only in the blank state, as cards in the body — a persistent strip of
  them above the composer competed with the conversation for the same band.
* **A message can carry attachments.** The `+` in the composer offers the
  tender's own documents — **guard-filtered**, so a file you may not read is
  never offered, and the permission model holds at the point of attachment
  rather than only at the point of reading. Uploading is a *separate* scope
  (`document.write`): an Estimator may attach any document on their tender and
  still not be allowed to add one.

  An upload becomes a real document record, so it routes through the same
  `DocumentReader` as everything else — a file named like a scan lands on the
  OCR strategy — and it reports honestly that it has no indexed text yet
  rather than pretending to have read it. Attached documents are named in the
  context card as *read these first*, and the provider searches them instead of
  the tender at large. Attachments belong to the **message**, not the session:
  they ride with one turn, are recorded on it, and the tray clears.

  Cards are one line of filename with an ellipsis, over the file type — a
  wrapped name made them 89px tall around a 34px icon and no two the same
  height. The remove control sits **inside** the card; hung outside it, the
  scrolling tray clipped it.

  The tray sits **below** the composer. Cards are the tallest thing in that
  band, and above the field they pushed the reference chip away from the label
  it belongs to. It is capped at two rows and scrolls after that — the footer
  does not shrink, so an unbounded tray would eat the conversation a card at a
  time.
* **Saved prompts.** The bookmark beside the attach button holds reusable
  instructions — the "save prompt" feature the Document Workspace already has,
  carried into Ray. Picking one **fills the composer rather than sending it**: a
  saved prompt is a starting point, and the thing in front of you usually needs
  a word changed. Business-scoped and gated like everything else
  (`prompt_library.read` / `.write`), so a read-only role can run a saved prompt
  but not add one.

  The sync-up kept this feature pending Tom's decision on whether it belongs in
  an agent at all. It is built so it can be removed cleanly: one repository, one
  panel, two scopes.
* **The context is named and dismissible.** A chip above the composer says what
  Ray is being pointed at — the tender, the open document, or the field you are
  editing — with an × to take it away. Dismissing does *not* narrow what Ray may
  reach; the card is replaced with an explicit instruction not to assume the
  open tender, so a general question stops being answered as if it were about
  this page. Navigating re-offers the context. This is the Figma
  selection-reference pattern the sync-up asked for.
* **Credits, never tokens.** The rail shows nothing about cost until the
  month's allowance passes 60%, then a quiet notice with a meter; past 85% it
  turns red. Per-answer token counts never reach the product surface — the
  sync-up was explicit that metering every reply teaches people to use the
  assistant less. Tokens still exist in the detail-mode trace, which is an
  engineering view, and `chargeTurn()` converts them to credits at the boundary
  so the UI never sees the smaller unit.
* **Thinking survives a reload.** An assistant turn is persisted with its
  `steps` and duration, and `paintHistory` rebuilds the same collapsed block a
  live turn folds into. Before this, reopening a session lost every record of
  how Ray reached its answers — the part most worth keeping.
* **Scrollback is not the context window.** The assembler decides what Ray is
  *told* (§2, a six-message recency window); the panel renders up to 40 messages
  so the user can scroll the session. Conflating the two meant a reopened
  conversation showed six messages and said the rest were "not in context" —
  true of the prompt, irrelevant to the reader.
* **Sessions are CRUD.** Create (`+`), read (the list), rename and delete —
  from the row's `⋯` in the list, or the `⋯` in the session header for the one
  you are in. Both are inline rather than popovers: the list scrolls, and a
  floating menu near the bottom of a 420px rail clips against the composer.
  Delete asks first, and `deleteThread` clears the **conversation body** as well
  as the index entry — leaving the messages behind would keep them reachable
  through `search_conversation` after the user believed them gone. Deleting the
  session you are in lands on the next most recent; deleting the last one
  creates a fresh one, so the rail is never empty. A rename sticks: it clears
  `untitled`, so auto-naming never overwrites a name the user chose.
* **The project list is guard-filtered**, so the switcher can never offer a
  tender outside the user's scope.
* **A modal stops short of it.** The edit dialog's overlay is
  `right: var(--rail-w)`, so Ray stays visible and usable beside an open
  dialog — and the dialog does *not* spawn a second Ray; it re-points the rail
  at the field.

A page never constructs a Ray. It declares where the user is looking:

```js
window.PAGE = {
  ray: { surface: 'tender', context: { tenderId: 't-envind' } }
};
```

`RaySurfaces.SURFACES` is the whole integration list. A surface supplies three
things and nothing else:

* **`card(context)`** — a small structured block describing what the user is
  looking at. This replaces "send the page to the model": a 148-page tender is
  ~200 tokens of *awareness*. It is prefixed with a standing site block (who the
  user is, which tenders are in reach) so Ray always knows its own scope.
* **`suggestions`** — the starter prompts shown as chips.
* **`primary`** — which tools matter most here. **A hint, not a fence.**

Adding an integration point is a new entry in that object. It is not new Ray
code, a new prompt file, or a new endpoint.

### Why `primary` is not a fence

Capability is bounded by **permission**, not by which page you are standing on.
From the Response Library you can ask about a tender document; from a tender you
can search the library. `ToolRegistry.forSurface` returns everything the role may
run, ordered so the surface's own tools lead. Hard per-surface scoping still
exists — set `restrictTools: true` — but nothing uses it, because using it would
turn Ray back into a collection of page widgets.

### The Document Workspace's two special cases

Question extraction and Response Library creation were separate
implementations. They are now `extract_questions` and `create_response_entry`
in the shared registry, with identical behaviour, plus three things they did
not have before: the permission guard, the reading strategies, and the trace.

`extract_questions` reads the schedule section only — pages 105–126 of a
148-page RFT — by asking `outline_document` where the schedule is first.

## §2 — Context management

History lives in storage; the prompt is assembled per turn from four parts:

| Part | Cost | When |
|---|---|---|
| System prompt | ~160 tok | always |
| Surface context card | ~40–110 tok | always |
| Rolling summary of older turns | ≤ ~350 tok | once history passes the window |
| Last *N* messages verbatim | ~100–400 tok | always (`recencyTurns`, default 6) |
| **Retrieved older messages** | on request only | when the model calls `search_conversation` |

Compaction is incremental: `summarisedUpTo` marks what has already been
compacted, so a turn only ever summarises what is new. Cost per turn is flat as
a conversation grows — a 200-turn thread costs about what a 10-turn thread does.

Retrieval is a tool, not a preload. `search_conversation` searches strictly
*before* the current turn (`ctx.turnSeq`), so a question about the past never
retrieves itself.

`assemble()` returns `naiveTokens` alongside `used` — what a send-everything
implementation would have spent. The panel's trace drawer shows the difference,
which is the fastest way to prove the mechanism to a reviewer.

## §3 — Document reading

Strategy is chosen from metadata the platform already holds at upload time.
**No file is opened to decide how to open it.**

| Strategy | Chosen when | Behaviour |
|---|---|---|
| `whole` | text layer, `pages × 600 tok < 12,000` (≈20 pages) | one pass, cached |
| `paged` | text layer, larger | outline first (~100 tok), then explicit page ranges |
| `ocr` | `scanned` or no text layer | per-page OCR, cached; cost surfaced per page |
| `lazy` | narrow question against any document | search → snippets with page provenance |

Every chunk carries `{ docId, docName, page, via, tokens }`, so answers cite and
the trace shows exactly which pages were opened.

`planSet(docs, intent, budget)` plans a whole set at once, cheapest first.
Documents past the budget are marked `deferred` — meaning *fetched on demand if
the answer needs it*, not *ignored*. That is how "review multiple documents"
stays bounded without becoming lossy.

## §4 — Permissions

Three layers, cheapest first, on every fetch:

1. **Scope** — does the role hold `document.read`? Loud failure.
2. **Tenancy** — does the record belong to the user's business?
3. **Record** — is it inside the user's tender assignment, and does its
   classification allow this role? (`confidential` is not readable by a
   read-only coordinator even though they hold `document.read`.)

Two properties matter more than the rules themselves:

* **Lists are filtered, not refused.** A user learns nothing about rows they
  cannot see — not even that they exist.
* **Unreachable tools are never advertised.** `ToolRegistry.forSurface`
  intersects the surface's tool list with the role's scopes before the schemas
  are sent, so the model cannot be talked into trying. A call that slips
  through anyway returns `not_available`, and a record-level refusal returns
  `permission_denied` — both as *data*, so Ray can explain rather than guess.

Every decision is appended to `RayPermissions.audit`.

The prototype's page tables render through the same repositories the tools use.
The page and the assistant cannot disagree about what you may see.

## Extending it

**A new surface** — add an entry to `RaySurfaces.SURFACES`, then declare it from
the page. No other file changes.

**A new capability** — add a tool to `RayTools.TOOLS` with `scopes` and an
`input_schema`, then list its name on the surfaces that should reach it. The
executor, guard, audit and trace apply automatically.

**A new document type** — add a strategy object to `ray-documents.js` with
`applies(doc)` and a read method, and place it in `DocumentReader.plan()`.

## Porting to the Angular platform

The prototype uses globals so it runs from `file://`. The mapping is mechanical:

| Prototype | Angular |
|---|---|
| `RayService` | `@Injectable({providedIn:'root'}) RayService` |
| `PermissionGuard` | wraps the existing auth/permission service |
| `Repositories` | the existing HTTP data services, with a guard argument |
| `ConversationStore` | server-side persistence + a thin client cache |
| `ThreadIndex` | the sessions API; localStorage is a stand-in only |
| `RayPanel` | one component in the app shell, beside the router outlet |
| turn markup | `.ray-turn` + `.ray-byline`; only `.ray-bubble.user` is a container |
| `window.PAGE.ray` focus | route data, applied on `NavigationEnd` via `RayPanel.focus()` |
| `AnthropicProvider` | a **server-side** proxy — never call the API from the browser |

Three contracts must not drift when you port: the tool `input_schema` shapes
(they are sent to the model verbatim), the `PermissionGuard` layer order, and
the **output sanitiser**. Answers are light HTML, so `ray-panel.js` puts every
model string through an element/attribute allow-list before it reaches the DOM —
unknown tags are unwrapped, and every attribute outside the list is dropped.
`bypassSecurityTrustHtml` on a model string is the same bug with a longer name.
