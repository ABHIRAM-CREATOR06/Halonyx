# Contributing to Halonyx

Halonyx is a final-year academic project — a from-scratch Signal Protocol implementation, not a production messenger. Contributions are welcome, but keep that context in mind: correctness of the crypto and clarity of the code matter more than feature breadth.

## Before you start

Read [`protocol/README.md`](protocol/README.md) and [`protocol/SECURITY_ANALYSIS.md`](protocol/SECURITY_ANALYSIS.md) if you're touching anything under `protocol/`. Read [`specification_docs/security_docs/datathreat.md`](specification_docs/security_docs/datathreat.md) before touching auth, key storage, or the mailbox — it documents 18 known threats and their status, and you don't want to reintroduce one that's already been analyzed.

## Setup

```bash
git clone https://github.com/ABHIRAM-CREATOR06/Halonyx.git
cd Halonyx
npm install
npm run dev
```

Node 20, 22, or 24 — matches the CI matrix. Anything outside that range isn't tested and may not work.

## Making changes

1. Fork the repo and branch off `main`.
2. Use tabs for indentation, not spaces, in JS files — matches the existing codebase.
3. Keep changes scoped. One fix or one feature per PR, not a bundle.
4. If you touch `protocol/`, add or update a test in `tests/`. Crypto code without a test doesn't get merged.
5. If you touch an endpoint or WebSocket message type, update the relevant table in `README.md` (API section) so the docs don't drift from the code again.

## Commit messages

Conventional-commit style, short and specific:

```
fix(auth): reject expired JWTs instead of silently passing
feat(protocol): add prekey exhaustion warning
docs(readme): correct benchmark folder path
```

Avoid vague messages like `update stuff` or `fixes`.

## Testing

```bash
npm test                 # full suite
npm run test:x25519      # crypto core only (X3DH + Double Ratchet)
```

Run both before opening a PR. CI runs the same suite on Node 20/22/24 and will fail the build if the X25519 tests get skipped rather than actually passing — don't rely on a green check that's secretly skipping the crypto core.

## Pull requests

- Describe *what* changed and *why*, not just *what*. If it's a security-relevant change, say so explicitly in the PR description.
- Link to the relevant threat ID (e.g. `T-07`) in `datathreat.md` if the PR addresses a known threat.
- Don't commit anything under `backend/db/` — `.gitignore` excludes the actual `.db` files and `.jwt_secret` for a reason. Schema files (`schema.sql`, `identity_schema.sql`, `key_schema.sql`) are the only things that belong there.
- Be patient. This is a small team maintaining a student project alongside coursework, not a company with a support SLA.

## What not to bother with

- Production-hardening PRs (rate limiting overhauls, infra, deployment tooling) are lower priority than protocol correctness — this project is explicitly not intended for production use.
- Cosmetic-only PRs (formatting, whitespace) without a functional change will likely sit unreviewed.

## Reporting bugs vs. reporting vulnerabilities

Regular bugs → open a GitHub issue using the bug report template.
Security vulnerabilities → **do not** open a public issue. See [`SECURITY.md`](SECURITY.md).
