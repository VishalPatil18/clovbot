# Clovbot

> A chatbot that Clover Health members can talk to.

Built with [_throughspec_](https://throughspec.v-ai.org/) - a Spec-Driven Development Kit built by Vishal.

---

## Quick Start

```bash
# 1. install dependencies
<command>

# 2. configure env
cp .env.example .env

# 3. run locally
<command>

# 4. run tests
<command>
```

---

## Project Structure

This project follows the **Spec-Driven Development** layout:

```text
.
├── CLAUDE.md              # behavior contract for Claude Code - read first
├── claude/                # durable memory layer
│   ├── srs.md             # frozen requirements
│   ├── plan.md            # staged build plan
│   ├── context.md         # current-state snapshot
│   ├── features.md        # append-only feature log
│   ├── design-decisions.md
│   └── learnings.md       # student-facing learning trail
├── design/                # design system + UI preview assets
└── .github/               # PR + issue templates
```

For the full workflow guide see [the Kit's documentation](https://example.com/spec-init/docs).

---

## Workflow

This project uses a strict Spec-Driven SDLC. Every feature flows through six phases:

1. Requirements → 2. Architecting → 3. Product Specs → 4. Tech Specs → 5. Planning → 6. Writing Code

Invoke any phase via Claude Code:

| Skill                | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `/spec-requirements` | Build or amend `claude/srs.md`            |
| `/spec-design`       | Build or amend `design/design.md`         |
| `/spec-plan`         | Build or amend `claude/plan.md`           |
| `/spec-feature`      | Run the 6-phase feature cycle             |
| `/spec-bug`          | Isolated bug resolution                   |
| `/spec-docs`         | Isolated documentation rewrite            |
| `/spec-sync`         | Reconcile memory files against repo state |

Supporting skills, invoked as needed:

| Skill                | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `/spec-architect`    | Design module/service/layer boundaries + ADRs         |
| `/spec-db-design`    | Design and review the database schema                 |
| `/spec-review`       | Multi-axis review (code/pr/frontend/backend/comments) |
| `/spec-code-quality` | Improve code quality and simplify                     |
| `/spec-security`     | Threat-model and harden                               |
| `/spec-performance`  | Measurement-first performance work                    |
| `/spec-test`         | Review test coverage and quality                      |
| `/spec-ux`           | Review usability and accessibility                    |
| `/spec-cicd`         | Review or set up CI/CD quality gates                  |
| `/spec-launch`       | Staged rollout across environments with rollback      |
| `/spec-git`          | Git operations and semantic-version releases          |
| `/spec-brainstorm`   | Generate options with explicit tradeoffs              |
| `/spec-suggest`      | Leverage-ranked improvement suggestions               |
| `/spec-research`     | External knowledge or market research                 |
| `/spec-resume`       | Resume interrupted work from a resumption brief       |

---

## Integrations

<!-- Integration blocks below are inserted or removed by `spec-init init --integrations …` and `spec-init customize --add/--remove <name>`. If no block appears in this section, no integrations are active. -->

### Caveman

This project is wired for [Caveman](https://github.com/JuliusBrussee/caveman) - a token-compression skill that makes the agent reply in terse "caveman" prose, cutting output tokens ~65% while keeping code, commands, and errors byte-exact. It also manages the compression mode across a session (`/caveman-stats` reports savings). Install it once (free, local, no account):

```sh
npx skills add JuliusBrussee/caveman
```

See `claude/caveman.md` for modes and usage.

### agentmemory

This project is wired for [agentmemory](https://github.com/rohitg00/agentmemory) - persistent memory for AI coding agents that captures decisions and context across sessions and injects them back at session start (local SQLite, no external database). Set it up once:

```sh
npx @agentmemory/agentmemory        # starts the memory server on port 3111
agentmemory connect claude-code     # wires the MCP server into Claude Code
npx skills add rohitg00/agentmemory -y
```

For a zero-cost setup, use local embeddings (`EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env`). See `claude/agentmemory.md`.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

_<choose a license>_
