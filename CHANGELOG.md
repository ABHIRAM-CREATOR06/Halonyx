# Changelog

## Unreleased

- Configure the app, identity, and key SQLite connections for WAL mode, `synchronous=FULL`, and a 5-second busy timeout.
- Keep the existing mailbox delivery/ordering path; benchmark the `DELETE ... RETURNING` candidate without shipping it, and keep `synchronous=NORMAL` restricted to warned synthetic benchmarks.
