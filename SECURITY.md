# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

## Reporting a Vulnerability

**Do not file a public GitHub issue for security vulnerabilities.**

Email: `security@example.com`

Please include:

- A clear description of the vulnerability.
- Steps to reproduce, including a minimal proof of concept if possible.
- The version / commit SHA affected.
- The impact you believe this has.

We will:

1. Acknowledge receipt within **3 business days**.
2. Provide a preliminary assessment within **7 business days**.
3. Coordinate a disclosure timeline with you.

## Scope

In scope:

- Code under this repository.
- Dependencies pinned in this repository.
- Default deployment configurations shipped here.

Out of scope:

- Third-party services this project integrates with (report directly to that vendor).
- Issues requiring physical access to a user's device.

## Security Checklist (mandatory before merge for sensitive features)

- [ ] No hardcoded secrets (API keys, passwords, tokens).
- [ ] All user input validated at the system boundary.
- [ ] Parameterized queries used everywhere data hits the DB.
- [ ] No unsanitized HTML rendered (`dangerouslySetInnerHTML` or equivalent).
- [ ] CSRF protection enabled on state-changing endpoints.
- [ ] Authentication and authorization verified end-to-end.
- [ ] Rate limiting in place on public endpoints.
- [ ] Error messages do not leak sensitive data.
- [ ] Dependencies scanned for known vulnerabilities.
