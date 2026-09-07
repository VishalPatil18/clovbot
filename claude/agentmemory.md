# agentmemory - persistent memory & context

This project opted into [agentmemory](https://github.com/rohitg00/agentmemory), a
persistent memory system for AI coding agents. It captures what the agent does
across sessions - architectural decisions, code patterns, project context - and
injects the relevant slice back when a new session starts, so you stop
re-explaining the project every time.

## Install (once, per machine)

agentmemory is a globally installed tool, not code checked into this project:

```sh
npx @agentmemory/agentmemory        # starts the memory server on port 3111
agentmemory connect claude-code     # wires the MCP server into Claude Code
npx skills add rohitg00/agentmemory -y
```

Or install globally: `npm install -g @agentmemory/agentmemory`. In Claude Code
you can instead run `/plugin marketplace add rohitg00/agentmemory` then
`/plugin install agentmemory`, which registers the auto-capture hooks, skills,
and MCP tools in one step.

## Zero-cost setup

agentmemory stores everything in local SQLite with an in-memory vector index -
no external database, no paid tier. Configure `~/.agentmemory/.env`:

- **Embeddings:** `EMBEDDING_PROVIDER=local` keeps embedding free and offline.
- **Compression LLM:** point it at the provider you already use (e.g.
  `ANTHROPIC_API_KEY`) - it reuses your existing key, adding no new paid service.

## How it works

1. **Capture** - lifecycle hooks record tool use (with secrets stripped and SHA-256 dedup).
2. **Compress** - an LLM distills raw observations into facts, concepts, and narratives.
3. **Index** - stored in BM25 + vector indexes for hybrid retrieval.
4. **Inject** - at session start, the top matches are injected within a token budget (default ~2000).

Ports: 3111 (REST + MCP), 3112 (engine worker), 3113 (viewer dashboard at
`http://localhost:3113`).

## How to use it in this project

- **Recall before re-reading.** When you need prior context, query memory
  (`memory_recall` / `memory_smart_search`) before grepping or re-opening files -
  it is cheaper and carries the "why".
- **This does not replace the memory layer.** `claude/context.md`,
  `features.md`, and `design-decisions.md` remain the durable, reviewable source
  of truth. agentmemory is a fast recall cache on top of them, not a substitute -
  keep writing decisions to the memory files.
