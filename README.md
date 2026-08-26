# Tenderfy — Agentic Ray, Phase 1

A working base for Phase 1 of the Ray expansion: **one site-wide Ray**, opening
as a right-hand rail that pushes the page rather than floating over it, reading
as a conversation rather than a chat widget, organised as a flat list of
**projects**, Figma-style — with retrieval-based chat history,
multi-strategy document reading, and permission-enforced data access.

Built on the contractor side of the `tenderfy-subbie-portal` prototype — same
chrome, tokens (`#1D9E75` teal, `#394645` rail), Outfit, Material Symbols.

**Live demo:** <https://daandydoan.github.io/tenderfy-ray-phase1/>

## Run it

```bash
python3 serve.py
```

Before pushing a change that has to reach the live demo, stamp the asset URLs:

```bash
python3 stamp.py
```

GitHub Pages sends no cache-busting headers, so a browser that has already
seen the site will keep running the old `ray-panel.js`. `stamp.py` appends a
content hash to every local `.css`/`.js` reference, so a URL changes exactly
when its file does. It is idempotent — running it twice rewrites nothing.

Then open <http://localhost:4173>. No build step, no dependencies, no API key —
the model provider is mocked behind the same interface the real one implements.

## The demo path

Opening Ray for the first time lands on an **empty project** with three sample
questions. Click one and you get the whole sequence: the steps arriving live
while tools run, folding to `Thought for 3.7s · 8 steps`, then the answer
streaming in with its citations. Click that line to reopen the steps.

The back chevron shows the project list, which ships with two demo projects:

* **Guided demo — the Phase 1 requirements** — the one to present. **Click the
  chat field** and the next question types itself in and sends; the placeholder
  says which step is next, and a toast names the requirement it covers. (The
  **Demo** button in the header does the same thing, and shows the counter.)
  Clicking is ignored while you have something typed, so the field stays usable
  for real questions. Eight steps, mapped to the brief:

  | | Step | Shows |
  |---|---|---|
  | §3 | Review all documents | a reading strategy per file |
  | §3 | What insurance is required? | search first, then only the pages that matter |
  | §1 | Extract the response schedule | question extraction, on the shared service |
  | §1 | Find a past answer about safety | Response Library |
  | §1 | Draft an answer for Q1 | content generation, drafting into a field |
  | §3 | What changed in Addendum 2? | answering from a file the user attaches |
  | §2 | Remind me what you said | retrieved from storage, not resent |
  | §4 | Open another business's tender | Ray tries, the guard refuses |

  The thinking, tool calls and streaming are real at every step — only the
  model behind them is mocked.

* **UI elements — every block, explained** — a reference rather than a
  conversation. Each turn is labelled with the block it demonstrates — *Short
  answer*, *Table*, *Badges*, *Draft block*, *Attachments*, *Permission
  refusal*, *Thinking block* — and each block says what it is and when Ray uses
  it before showing itself. The content is deliberately generic (*Document
  name.pdf*, *Item A*), so it reads as a component sheet rather than as a second
  worked example. Scroll it; nobody has to drive.

Two more things surface as you go: the **reference chip** above the composer
names what Ray is pointed at (the tender, the open document, the field you are
editing) and can be dismissed with its × to ask something general; and after a
substantial question the **credit notice** appears, because the demo starts just
under its 60% threshold. Files you attach appear as cards **below** the
composer.

Ray is **already open** when the page loads, as the side panel — taking its own
column and pushing the page across. Closing him is remembered, so if you shut
Ray he stays shut until you reopen him from the header. The `⤡` in its header folds him down to a **chat dialog** — a floating
card, bottom-right, that leaves the page alone — and `⤢` puts him back. It is
one panel either way, so the conversation carries over untouched, and the choice
is remembered. Ray also changes what he shows for the room he is in: the compact
head and no tag in the dialog, the full character and a **Beta** tag in the
panel.

The rail is **dark by default**; the switch in the app header flips it to light
instantly, for demos in rooms where dark does not project well. Both forms
follow that switch.

## Two modes

The screens are the product; the architecture proof is a second layer folded
behind a flag, so the demo reads as an app rather than a lecture.

| | Default | Detail mode |
|---|---|---|
| Header | signed-in user | role switcher (Business Admin → External Reviewer) |
| Rail | the conversation | + reasoning trace, + surface/tool/role line |
| Pages | the screen | + reading plans, withheld rows, tool inventories |

Turn it on with **Show architecture detail** at the foot of the dashboard, or
`?dev=1` on any page (`?dev=0` to leave). Nothing is removed in either mode —
the same service runs underneath.

## What to look at

Two screens, deliberately: enough to show the rail travelling with you, without
a click-through app to maintain.

| Page | Screen |
|---|---|
| `index.html` | Dashboard — contract value, win rate, tasks, deadlines |
| `pages/tenders.html` | Tenders — folders and tender cards, from the contractor portal |

On **Tenders**, tick a card and it becomes the chat's reference: the chip reads
`Tenders › Velocity Link Highway Extension`, Ray's toolset widens to that
tender's documents, and questions answer from them. Ticking another moves the
reference; unticking hands it back to the page. This is the tender-detail
surface, reached by selection rather than by a separate screen.

The remaining sidebar items are inert on purpose — they toast rather than
navigate, so the demo stays on the two screens that carry it.

Open Ray from the header, ask something, then **move between the two pages**:
the rail stays open holding the same thread, and the page sits beside it rather
than under it. The back chevron opens the project list — grouped by day and
searchable — where `+` starts a project and each row's `⋯` renames or deletes
one (the project header carries the same `⋯` for the one you are in).

In detail mode, two more things are worth doing:

1. Open **“How Ray answered”** under a reply — the context assembled that turn,
   every tool call, every permission check, and what a send-everything
   implementation would have spent instead.
2. Change the role in the header and ask the same question again. The page rows,
   the advertised tools and Ray's answer all narrow together.

## Layout

```
ray/          the service — core, surfaces, tools, context, documents,
              permissions, provider, panel
data/         fixtures standing in for the platform's data layer
pages/        the surfaces, as click-through screens
docs/         ARCHITECTURE.md · MIGRATION.md
```

`docs/ARCHITECTURE.md` has the contracts and the Angular port mapping.
`docs/MIGRATION.md` has what replaces each thing Vertex was doing.

## Scope

This is a base, not the shipped feature. The model provider is mocked
(deterministic plans for the demo intents), search is lexical rather than
semantic, and the fixtures are synthetic. Everything the mock plugs into —
the loop, the tool contracts, the strategies, the guard — is the real design and
is meant to be ported.
