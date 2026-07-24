## What does this PR do?
A clear, specific description. Not "fixes bug" — what was broken, what changed, why this approach.

## Related issue
Closes #

## Component(s) touched
- [ ] `protocol/` — Signal Protocol implementation (X3DH, Double Ratchet)
- [ ] `backend/` — server, auth, database
- [ ] `frontend/` — UI
- [ ] `simulator/` — protocol explainer
- [ ] `tests/`
- [ ] Docs (`README.md`, `specification_docs/`, etc.)
- [ ] CI / build

## Is this security-relevant?
- [ ] Yes — touches key handling, session state, auth, or anything affecting forward secrecy / post-compromise security
- [ ] No

If yes: does this address a known threat from [`datathreat.md`](../specification_docs/security_docs/datathreat.md)? Which one (e.g. `T-07`)? If it's a new issue not yet documented there, say so explicitly — don't let a security-relevant change land without the threat model catching up.

## How was this tested?
- [ ] `npm test` passes locally
- [ ] `npm run test:x25519` passes locally
- [ ] Added or updated a test for this change
- [ ] Manually tested (describe how below)

Describe manual testing if applicable:

## Checklist
- [ ] Code uses tabs, not spaces (matches existing style)
- [ ] No secrets, `.db` files, or key material committed (check `git status` against `.gitignore`)
- [ ] Updated the relevant API/WebSocket table in `README.md` if an endpoint or message type changed
- [ ] Commit messages follow `type(scope): description` convention

## Anything else reviewers should know?
Tradeoffs made, things you're unsure about, follow-up work you're deliberately leaving out of scope.
