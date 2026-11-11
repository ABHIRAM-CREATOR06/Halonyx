# AGENTS.md

Rules for AI agents and humans working on Halonyx, a Signal Protocol (X3DH + Double Ratchet) end-to-end encrypted messaging app with DLP scanning, pairwise group fan-out, a relay/server and a SQLite mailbox.

Priorities, in order: **security, durability, honest measurement, speed.** Higher wins any conflict. Items marked **TODO(verify)** must be confirmed against the repo.

## Commands

```bash
npm install
npm test                 # TODO(verify)
npm run benchmark        # warm
npm run benchmark:cold   # cold start
```

Run tests and the linter before finishing. If a command doesn't exist, say so.

## Protected files: do NOT modify

If a task seems to need one of these, **stop and ask**. "Nearby" or "cleanup" is not permission.

**Never touch (read, edit, print, move, delete, commit):**
- `backend/db/.jwt_secret`, `.env*`, keys, certificates
- `backend/db/*.db`, `*.db-wal`, `*.db-shm` (real user data and key material)
- `.git/` internals and Git config

**Change only with explicit approval:**
- `backend/db/connection.js` (durability policy)
- Crypto code: X3DH, ratchet, key storage, signing **TODO(verify): list paths**
- Envelope format, schema, migrations (add new ones, never edit old), auth/session code
- Mailbox delivery semantics (ordering, ack, expiry, rollback)
- `package.json`, lockfiles, CI/workflows, `LICENSE`, DLP rules

**Add new, never rewrite:**
- Committed benchmark results in `specification_docs/benchmark/` (add a dated correction instead)
- Benchmark definitions in `scripts/benchmark/` (rename if the measured operation changes)
- Pushed Git history; existing tests (never weaken or skip to pass)

**Local only, never commit:** `node_modules/`, `.work/` (raw benchmark JSON, fixtures), build output.

**Scope:** change only what the task needs. No drive-by refactors, renames or reformatting. Leave unrelated staged work (such as CSS) alone. Before committing, check `git diff --staged --stat` shows only files you were asked to change.

**Mistake recovery:** stop, show `git diff` of the file, revert only that file with approval. Never use `git reset --hard`, `git checkout -- .` or `git clean`.

## Hard rules

- **Never run `git clean` with `-x`.** It deletes real databases, secrets and untracked source. Dry-run only (`git clean -nd`) and show the output.
- Tests and benchmarks use isolated temporary databases, never real ones.
- Never log or commit keys, plaintext messages, ratchet state or tokens.
- Never weaken crypto for speed. Use constant-time comparison and a secure RNG. No protocol changes without a design discussion.
- Use prepared statements. Treat all client input as untrusted.
- No new dependencies without justification.

## SQLite policy

- All three databases (app, identity, keys) use `journal_mode=WAL`, `synchronous=FULL`, `busy_timeout=5000`.
- Open every connection through `backend/db/connection.js` only.
- **Never ship `synchronous=NORMAL`.** It can lose acknowledged commits on power loss. It is a benchmark-only flag.
- No mailbox batching unless tests prove ordering and rollback are preserved.
- `BEGIN IMMEDIATE` + `DELETE ... RETURNING` flush is benchmark/test only (it was slower).
- Backups and copies must include `-wal` and `-shm`, or checkpoint first.

## Benchmarks

- Never fabricate or hand-edit numbers. Every figure comes from a recorded run.
- Label estimates as estimates. If it wasn't run on that hardware, it isn't a measurement.
- Compare before and after on the same machine, Node version and path, at least 5 runs. Report medians and P95.
- Don't benchmark inside OneDrive or other synced folders.
- Record CPU, OS, Node, SQLite, pragmas, fixture path, git commit and clean/dirty state.
- Keep a change only if it improves results consistently and tests pass.
- Loopback WebSocket/pipeline results are not remote relay performance.
- Commit only trimmed summaries; raw output stays in `.work/`.

## Git

- Never assume an author. If none is configured, ask.
- Stage specific paths, never `git add -A`. Check `git diff --staged` first.
- Small, single-purpose commits. Conventional Commits (`type(scope): summary`, under about 72 chars, body explains why).
- Agent commits end with a blank line, then `Co-authored-by: Manus <dev-agent@manus.ai>`.
- No force-push, history rewrites or Git config changes without approval. A secret found in history must be rotated.

## Tests

- Add or update tests for every behavior change; security changes always need one.
- SQLite tests use temporary databases through `connection.js` and clean up `-wal`/`-shm`.
- A test pins all three databases to `wal` / `FULL` / `5000` **TODO(verify)**.

## Ask first

Crypto, key storage or envelope changes; durability settings; deleting or moving any database or secret; destructive Git commands; publishing unmeasured benchmark numbers; anything you're unsure is safe.

## Done means

- [ ] Tests and linter pass (state what you ran)
- [ ] No protected file, real database, secret or `.work/` content staged
- [ ] Docs updated if behavior or commands changed
- [ ] Benchmark claims backed by a same-machine before/after run
- [ ] Correct author and trailer
- [ ] You reported what changed, what you ran, and what you did not verify
