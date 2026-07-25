# Security Policy

Halonyx is a student final-year project — an from-scratch implementation of the Signal Protocol built to explore applied cryptography. **It is not intended for production deployment**, and has not had a professional security audit. Treat it accordingly: don't use it to protect anything that actually matters yet.

That said, the project takes its own threat model seriously (see [`specification_docs/security_docs/datathreat.md`](specification_docs/security_docs/datathreat.md), 18 classified threats with severity and remediation status) and genuinely wants to hear about anything that isn't already tracked there.

## Supported Versions

There are no tagged releases yet — only `main`. Security reports are evaluated against the current state of `main`.

| Branch | Supported |
|---|---|
| `main` | ✅ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** A public issue is a disclosure to anyone watching the repo, including anyone who'd misuse it before a fix ships.

Instead:

1. Use [GitHub's private vulnerability reporting](https://github.com/ABHIRAM-CREATOR06/Halonyx/security/advisories/new) for this repo (Security tab → Report a vulnerability), **or**
2. Email the maintainer directly with a description of the issue, steps to reproduce, and its potential impact.

Include, where relevant:
- Which component is affected (`protocol/`, `backend/`, `frontend/`, transport, storage)
- Whether it's already listed in `datathreat.md` under a different severity than you'd assign
- A minimal reproduction if you have one

### What happens next

This is maintained by students alongside coursework, not a company with a security team on call — response times will be days, not hours. You can expect:

- Acknowledgment of the report
- An honest assessment of severity and whether it's already known
- Credit in the fix commit / changelog if you want it, or anonymity if you'd rather not be named

### Scope

In scope:
- The Signal Protocol implementation (X3DH, Double Ratchet, key management) in `protocol/`
- Authentication and session handling in `backend/server.js`
- Safety Number computation and verification logic
- Anything that could leak plaintext, private keys, or session state to the relay server or a third party
- Anything that defeats forward secrecy or post-compromise security

Out of scope / already known and tracked:
- Anything already documented in `datathreat.md` at its current severity — check there first
- The fact that this isn't production-hardened in general (missing HTTPS enforcement in dev, no CSP, etc. — these are tracked, not news)
- Denial-of-service against the free-tier hosted demo at halonyx.onrender.com specifically (report it, but it's not a priority fix — it's a demo instance)

There's no bug bounty. This is an academic project, not a company. What you get is a genuine, undefensive response and credit if you want it.
