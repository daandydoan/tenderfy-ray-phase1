# Removing the Vertex AI dependency

Vertex was doing four separable jobs. Renaming the client would have kept them
tangled; Phase 1 splits them, which is what actually removes the dependency.

| What Vertex did | What replaces it | Where |
|---|---|---|
| Generation / chat completion | `ModelProvider.createMessage()` — Anthropic Messages API shape | `ray/ray-provider.js` |
| Document parsing (PDF/DOCX/XLSX → text) | `DocumentReader` + per-strategy extraction at upload time | `ray/ray-documents.js` |
| OCR of scanned pages | `OcrStrategy`, page-level and cached | `ray/ray-documents.js` |
| Embeddings / semantic lookup | retrieval behind `search_document` and `search_conversation` | `ray-documents.js`, `ray-context.js` |

## Why the split matters

Under Vertex, "read this document" and "answer this question" were the same
call, so the whole file went to the model every time. Once reading is a tool the
model *calls*, it can ask for an outline, then three pages — which is the entire
saving in §3. The provider swap is a consequence of that split, not the cause.

## Order of work

1. **Extraction first.** Move parsing and OCR to `DocumentReader` behind the
   strategy interface, still calling Vertex underneath if you must. Nothing
   above the reader changes when the implementation is swapped later.
2. **Index at upload.** Persist `pages`, `bytes`, `textLayer`, `scanned` and a
   section outline when a file is uploaded. `plan()` routes on these; if they
   are missing, every document degrades to the paged strategy.
3. **Retrieval.** Stand up the search index behind `search_document` /
   `search_conversation`. The prototype's lexical match is a placeholder with
   the correct interface — swap the body, keep the signature and the
   `{docId, page, text}` return shape.
4. **Provider last.** Point `AnthropicProvider.endpoint` at a server-side proxy
   holding the key. The browser must never see it.
5. **Delete the Vertex client** and its config once nothing imports it.

Steps 1–3 can ship while Vertex is still generating. Step 4 is then a one-line
change, which is the point of the seam.

## Choosing a model

`AnthropicProvider` defaults to `claude-sonnet-5`. Tool-use, streaming and
prompt caching are all supported on the Messages API — cache the system prompt
and surface card, which are stable across a conversation, and you save most of
the fixed per-turn cost on top of what §2 already saves.

## What to verify after the swap

* A 148-page RFT produces an outline call before any page read.
* A scanned PDF routes to OCR and OCR results are cached per page.
* `search_conversation` returns messages that are **not** in the prompt.
* A confidential document is refused for a read-only role, and the refusal
  reaches the user as an explanation rather than a hallucinated answer.
* No API key is reachable from client code.
