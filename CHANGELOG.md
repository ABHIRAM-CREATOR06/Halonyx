# Changelog

## Unreleased

- Configure the app, identity, and key SQLite connections for WAL mode, `synchronous=FULL`, and a 5-second busy timeout.
- Keep the existing mailbox delivery/ordering path; benchmark the `DELETE ... RETURNING` candidate without shipping it, and keep `synchronous=NORMAL` restricted to warned synthetic benchmarks.
- Scope browser key, OPK, and ratchet records by account; require explicit confirmation to adopt legacy unscoped keys, and fail closed on missing, malformed, or unsupported saved state without silently replacing it.
- Document local-only recovery: IndexedDB data persists through auth expiry, but there is no portable backup or account-deletion cleanup flow.
