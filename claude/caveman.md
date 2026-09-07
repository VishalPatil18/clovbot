# Caveman - token-lean sessions

This project opted into [Caveman](https://github.com/JuliusBrussee/caveman), a
token-compression skill for Claude Code, Codex, Gemini, Cursor, and other AI
agents. It makes the agent reply in terse "caveman" prose - cutting output
tokens ~65% on average while keeping code, commands, and error text byte-exact.

## Install (once, per machine)

Caveman is a globally installed agent skill, not a file checked into this
project. Install it once - free, local, no account, zero telemetry:

```sh
npx skills add JuliusBrussee/caveman
```

Or use the universal installer:

```sh
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash
```

Requires Node >= 18. It auto-detects installed agents.

## Modes and session management

Caveman manages the compression mode across a session - the level you pick
sticks until you change it or the session ends.

| Command                        | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `/caveman [lite\|full\|ultra]` | Set the compression level for the current session        |
| `/caveman-stats`               | Show real token usage and lifetime savings for this repo |
| `/caveman-compress <file>`     | Rewrite a memory file to caveman format (input savings)  |

On Claude Code, caveman mode activates automatically from the first message.

## Why it fits this project

Throughspec is spec-driven and token-lean by design. Caveman trims the agent's
prose without touching the substance of specs, plans, or code - so the memory
layer and the SDLC workflow stay intact while sessions cost fewer tokens.
