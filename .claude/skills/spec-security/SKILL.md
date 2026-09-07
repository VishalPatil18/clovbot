---
name: spec-security
description: Harden code against vulnerabilities and review security. Use when handling user input, authentication, sessions, data storage, file uploads, external/LLM integrations, or when the user says "security review", "is this secure", "harden this", "check for vulnerabilities", or invokes `/spec-security`. Threat-models first, treats every external input as hostile, and gates high-risk changes behind human approval.
---

# spec-security

Security is not a phase - it is a constraint on every line that touches user data, auth, or external systems. Treat every external input as hostile, every secret as sacred, every authorization check as mandatory.

---

## Read first

- The endpoints, handlers, and boundaries named by the request.
- `claude/context.md` **Current State** for the stack (framework auto-escaping, ORM, session mechanism).
- `claude/srs.md` for what data is sensitive and who is allowed to touch it.

## Step 1 - Threat model (five minutes, not a ceremony)

Controls bolted on without a threat model are guesses.

1. **Map trust boundaries** - where does untrusted data cross in? HTTP requests, form fields, file uploads, webhooks, third-party APIs, message queues, and **LLM output**. Every boundary is attack surface.
2. **Name the assets** - credentials, PII, payment data, admin actions, money movement.
3. **Run STRIDE** over each boundary: Spoofing (authn), Tampering (integrity/parameterized queries), Repudiation (audit logs), Information disclosure (encryption, generic errors), Denial of service (rate limits, size caps), Elevation of privilege (authz, least privilege).
4. **Write abuse cases next to use cases** - "how would I misuse this?" is your first test.

If you cannot name a feature's trust boundaries, you are not ready to secure it (OWASP A04: Insecure Design).

## Always do (no exceptions)

- Validate all external input at the boundary (schema validation at API routes/form handlers).
- Parameterize every query - never concatenate user input into SQL.
- Encode output (use framework auto-escaping; never `innerHTML`/`eval` with user data).
- HTTPS everywhere; hash passwords with bcrypt/scrypt/argon2 (>= 12 rounds).
- Security headers (CSP, HSTS, X-Frame-Options); cookies `httpOnly`, `secure`, `sameSite`.
- Run the package manager's native audit against the committed lockfile before every release.

## Ask first (human approval required)

New/changed auth flows, storing new categories of sensitive data, new external integrations, CORS changes, file-upload handlers, rate-limit changes, elevated permissions. **Halt and ask** - do not ship these silently.

## Never do

Commit secrets; log passwords/tokens/full card numbers; trust client-side validation as a boundary; disable security headers for convenience; store auth tokens in `localStorage`; expose stack traces to users.

## Prevention patterns to verify

- **Injection** - parameterized queries / ORM with bound params only.
- **Broken access control** - check the user owns the resource, not just that they are logged in.
- **Sensitive data exposure** - strip secret fields from API responses (allowlist, not denylist).
- **SSRF** - any server-side fetch of a user-influenced URL is allowlisted by scheme + host, rejects private/reserved resolved IPs, and forbids redirects.
- **Secrets** - from environment/vault, never code. If a secret was ever committed, rotate it - deleting the line is not enough.

## LLM / AI features (if present)

- Treat all model output as untrusted input - never pass it to `eval`, SQL, a shell, `innerHTML`, or a file path without validation and encoding.
- The system prompt is not a security boundary - enforce permissions in code. Untrusted text in the context window can carry instructions (prompt injection).
- Keep secrets and other users' data out of prompts; scope tool/agent permissions; require confirmation for destructive actions; cap tokens and loop depth.

## Output and memory

- Report findings as: _boundary/asset -> threat -> concrete exploit -> fix_, ranked Critical/High/Moderate/Low. Do not soften a real hole; quantify impact.
- Never auto-run forced audit remediation - preview, read changelogs, test each upgrade.
- Log accepted risks with a review date in `claude/design-decisions.md`.

## Red flags

- User input reaching a query, shell, or the DOM without validation/encoding.
- Endpoints with no authorization check; wildcard CORS; no rate limit on auth.
- Secrets in source or history; stack traces returned to users.
- LLM output flowing into a query, the DOM, a shell, or `eval`.
