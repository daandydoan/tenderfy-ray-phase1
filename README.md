# Tenderfy — Agentic Ray, Phase 1

A working base for Phase 1 of the Ray expansion: **one site-wide Ray**, opening
as a right-hand rail that pushes the page rather than floating over it, reading
as a conversation rather than a chat widget, organised as a flat list of
**sessions**, Figma-style — with retrieval-based chat history,
multi-strategy document reading, and permission-enforced data access.

Built on the contractor side of the `tenderfy-subbie-portal` prototype — same
chrome, tokens (`#1D9E75` teal, `#394645` rail), Outfit, Material Symbols.

**Live demo:** <https://daandydoan.github.io/tenderfy-ray-phase1/>

## Run it

```bash
python3 serve.py
```

Then open <http://localhost:4173>. No build step, no dependencies, no API key —
the model provider is mocked behind the same interface the real one implements.

## The demo path

Opening Ray for the first time lands on an **empty session** with three sample
questions. Click one and you get the whole sequence: the steps arriving live
while tools run, folding to `Thought for 3.7s · 8 steps`, then the answer
streaming in with its citations. Click that line to reopen the steps.

The back chevron shows the session list, which ships with two demo sessions:

* **Guided demo — the Phase 1 requirements** — the one to present. The **Demo**
  button in the app header runs it one click at a time: the question types
  itself into the composer and sends, and a toast names the requirement each
  step covers. Eight steps, mapped to the brief:

  | | Step | Shows |
  |---|---|---|
  | §3 | Review all documents | a reading strategy per file |
  | §3 | What insurance is required? | search first, then only the pages that matter |
  | §1 | Extract the response schedule | question extraction, on the shared service |
  | §1 | Find a past answer about safety | Response Library |
  | §1 | Draft an answer for Q1 | content generation inside an edit dialog |
  | §3 | What changed in Addendum 2? | answering from a file the user attaches |
  | §2 | Remind me what you said | retrieved from storage, not resent |
  | §4 | Open another business's tender | Ray tries, the guard refuses |

  The thinking, tool calls and streaming are real at every step — only the
  model behind them is mocked.

* **UI elements — every block, explained** — a reference rather than a
  conversation. Each turn is labelled with the block it demonstrates — *Short
  answer*, *Table*, *Badges*, *Draft block*, *Attachments*, *Permission
  refusal*, *Thinking block* — and each block says what it is and when Ray uses
  it before showing itself. Scroll it; nobody has to drive.

Two more things surface as you go: the **context chip** above the composer names
what Ray is pointed at (the tender, the open document, the field you are
editing) and can be dismissed with its × to ask something general; and after a
substantial question the **credit notice** appears, because the demo starts just
under its 60% threshold.

The rail is **dark by default**; the switch in the app header flips it to light
instantly, for demos in rooms where dark does not project well.

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

| Page | Screen |
|---|---|
| `index.html` | Dashboard — pipeline, tenders, deadlines |
| `pages/tenders.html` | Tender list |
| `pages/tender-detail.html` | Tender detail — information, documents, checklist |
| `pages/document-review.html` | Document set, reviewed in the rail |
| `pages/response-library.html` | Saved answers |
| `pages/document-workspace.html` | Build response — questions, and an editor the rail writes into |
| `pages/subbies.html` | Subcontractor list |

Open Ray from the header, ask something, then **navigate to another page**: the
rail stays open holding the same thread, and the page sits beside it rather than
under it. The back chevron opens the session list — grouped by day and
searchable — where `+` starts a session and each row's `⋯` renames or deletes
one (the session header carries the same `⋯` for the one you are in).

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
