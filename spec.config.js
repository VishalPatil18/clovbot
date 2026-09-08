// spec.config.js - Throughspec project configuration.
//
// Claude reads this file at the start of every session (see CLAUDE.md section 2)
// and honors it. It is the single, friendly place to customize how Throughspec
// behaves in THIS project. Edit it freely - there is no build step, and the CLI
// never parses it, so it can never break a scaffold.
//
// What lives elsewhere (do not duplicate it here):
//   - persona and active integrations are managed by the CLI. Change them with
//     `spec-init customize --persona <p>` / `--add|--remove <integration>`.
//     They are recorded in .spec-init/meta.json and CLAUDE.md section 8.

// active-persona: <none>   // managed by spec-init - change via `spec-init customize --persona`

module.exports = {
  // --- Skills -------------------------------------------------------------
  // Every shipped skill is available by default. List the names of any skills
  // Claude should NOT use in this project (Claude will avoid invoking them).
  skills: {
    disabled: [
      // 'spec-market-research',
      // 'spec-ux',
    ],
  },

  // --- Workflow -----------------------------------------------------------
  workflow: {
    // The mandatory SDLC phase order. Claude will not write production code
    // until the phases a feature depends on are complete.
    phases: ['requirements', 'design', 'plan', 'feature'],
    // Allow skipping a phase WITHOUT logging an override in
    // claude/design-decisions.md? Keep false to preserve the spec-driven
    // guarantee that nothing is built ahead of its spec.
    allowSkip: false,
  },

  // --- Settings -----------------------------------------------------------
  settings: {
    // End file-changing responses with a suggested Conventional Commits message
    // (the commit invariant in CLAUDE.md section 2). Set false to turn it off.
    commitSuggestions: true,
    // Freeform, project-wide rules Claude must follow. These are honored the
    // same as CLAUDE.md section 7's custom instructions.
    customInstructions: [
      // 'Prefer Drizzle over Prisma.',
      // 'Never use class components in React.',
    ],
  },
};
