# Contributing to Halonyx

Halonyx is a final-year academic project — a from-scratch Signal Protocol implementation, not a production messenger. Contributions are welcome, but keep that context in mind: correctness of the crypto and clarity of the code matter more than feature breadth.

## Before you start

Read [`protocol/README.md`](protocol/README.md) and [`protocol/SECURITY_ANALYSIS.md`](protocol/SECURITY_ANALYSIS.md) if you're touching anything under `protocol/`. Read [`specification_docs/security_docs/datathreat.md`](specification_docs/security_docs/datathreat.md) before touching auth, key storage, or the mailbox — it documents 18 known threats and their status, and you don't want to reintroduce one that's already been analyzed.

## Development setup

### Prerequisites

Needed on every OS:

| Tool | Version | Notes |
| --- | --- | --- |
| [Node.js](https://nodejs.org/en/download) | 20, 22, or 24 | Matches the CI matrix. Other versions aren't tested and may not work. |
| npm | Comes with Node.js | The repo doesn't pin an npm version. |
| [Git](https://git-scm.com/downloads) | Any recent version | Needed to clone the repo. |

**Native build tools (only if needed).** Halonyx depends on `sqlite3`, which is a native module. During `npm install`, npm first tries to download a prebuilt binary. The [`sqlite3` README](https://github.com/TryGhost/node-sqlite3#prebuilt-binaries) lists prebuilt binaries for Windows x64, macOS (Intel and Apple Silicon) and Linux (x64 and arm64, including musl/Alpine). On those platforms you usually don't need anything extra.

If no prebuilt binary matches your platform (for example Windows on ARM) or the download fails (offline, proxy, firewall), npm falls back to compiling `sqlite3` with [node-gyp](https://github.com/nodejs/node-gyp#installation), which needs:

| OS | Needed only for a source build |
| --- | --- |
| Windows | Python 3, plus Visual Studio or Build Tools with the **Desktop development with C++** workload. See node-gyp's [Windows instructions](https://github.com/nodejs/node-gyp#on-windows). |
| macOS | Xcode Command Line Tools (`xcode-select --install`) and Python 3. |
| Linux | Python 3, `make`, and a C/C++ compiler. On Debian/Ubuntu: `sudo apt install build-essential python3`. On Alpine: `apk add python3 make g++`. Other distros have equivalent packages. |

Open a new terminal after installing these so the updated `PATH` is picked up.

### Install and run

```bash
git clone https://github.com/ABHIRAM-CREATOR06/Halonyx.git
cd Halonyx
npm install
npm run dev
```

`npm install` finishes with a `postinstall` step (`npm rebuild sqlite3`); that's expected. To check the native binding on its own:

```bash
node tests/verify-sqlite.js    # prints "sqlite3 native binding OK"
```

When the server is up, the console shows `[UDP] Server listening 127.0.0.1:9000` and `Server running on port 3000`. Open **http://localhost:3000** in your browser. The same server serves the frontend and the WebSocket endpoint. On first start it creates its SQLite files (`app.db`, `identity.db`, `keys.db`) and a `.jwt_secret` under `backend/db/`; these are git-ignored.

`npm run dev` uses nodemon and restarts the server when `.js`, `.mjs`, `.cjs` or `.json` files change. `npm start` runs `node backend/server.js` once, without auto-reload.

| Port | Protocol | Used for | Configurable? |
| --- | --- | --- | --- |
| 3000 | TCP | HTTP and WebSocket | Yes, via the `PORT` environment variable |
| 9000 | **UDP** | Broadcast bridge, bound to `127.0.0.1` only | No, it's fixed in `backend/server.js` |

### Run the tests

```bash
npm test                 # node --test tests/*.test.js: the whole suite
npm run test:x25519      # x25519_protocol, x3dh and double_ratchet tests only (crypto core)
```

The tests don't start the server or open ports 3000/9000, so it doesn't matter whether the dev server is running. Check the summary at the end, not just the exit code: `pass` should be above zero and `skipped` should be zero (see [Testing](#testing) for why CI treats skipped X25519 tests as a failure).

### Standalone simulator

Open `simulator/index.html` directly in a browser (double-click it, or use your browser's *Open File*). It needs no backend, no `npm install` and no simulator-specific dependencies.

### Troubleshooting

#### `sqlite3` fails to install or load

First find the real error. `npm install` prints a lot of warnings; scroll up to the first `npm error` lines that mention `sqlite3`, `prebuild-install` or `gyp ERR!`, and note the path of the full log that npm prints at the end.

- **Install-time errors mentioning `prebuild-install`** usually mean the prebuilt download failed (network, proxy or firewall). Fix the connection and retry.
- **Errors with `gyp ERR!`** mean it fell back to compiling. Look for what it couldn't find (`Python`, `make`, `g++`, or Visual Studio on Windows) and install the tools from [Prerequisites](#prerequisites).
- **Errors when starting the server or tests** (for example *Could not locate the bindings file*, *invalid ELF header*, *not a valid Win32 application*) usually mean `node_modules` was installed for a different OS or CPU, such as one copied from another machine or shared between Windows and WSL.

Then try these in order, checking after each with `node tests/verify-sqlite.js`:

1. **Confirm your versions** with `node -v` (20, 22 or 24) and `npm -v`.
2. **Re-run the native install step**, which is safe to repeat:
   ```bash
   npm rebuild sqlite3
   ```
3. **Force a compile from source** once the build tools above are installed. This also downloads Node's headers, so it needs network access to nodejs.org:
   ```bash
   npm rebuild sqlite3 --build-from-source
   ```
   node-gyp's docs note that Python 3.12 or newer needs node-gyp 10 or newer, while this project installs node-gyp 8.x for `sqlite3`. If a source build stops with a Python-related error (for example a missing `distutils`), install Python 3.11 and point node-gyp at it with `npm_config_python` ([how](https://github.com/nodejs/node-gyp#configuring-python-dependency)).
4. **Reinstall cleanly from the lockfile** if `node_modules` came from another OS or is half-installed:
   ```bash
   npm ci
   ```
   `npm ci` deletes `node_modules` and reinstalls exactly what `package-lock.json` specifies (CI does the same). It doesn't touch your source files or `backend/db/`.

Please don't delete `package-lock.json`, run `npm audit fix --force`, or change the `sqlite3` version to work around a local build problem. If none of the above helps, open an issue with your OS and CPU architecture, `node -v`, `npm -v`, and the first `npm error` / `gyp ERR!` lines.

#### Port 3000 is already in use

The server exits with `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000`. Find what is listening on TCP port 3000:

```bash
# Linux
ss -ltnp 'sport = :3000'
# or: lsof -nP -iTCP:3000 -sTCP:LISTEN

# macOS
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

```powershell
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <PID>
```

```bat
:: Windows (cmd.exe): look for LISTENING; the PID is the last column
netstat -ano -p TCP | findstr :3000
tasklist /FI "PID eq <PID>"
```

On Linux and macOS, add `sudo` to see processes owned by other users.

Then pick one:

- **It's your own earlier dev server** (often in another terminal tab or left in the background): switch to that terminal and press `Ctrl+C`. If you can't find it, stop it by PID once you've confirmed it's yours: `kill <PID>` on Linux/macOS, `Stop-Process -Id <PID>` in PowerShell, or `taskkill /PID <PID>` in cmd. Use the forceful variants (`kill -9`, `taskkill /F`) only if the normal one is ignored.
- **It's something else you want to keep running:** start Halonyx on another port. The server reads `PORT` from the environment only (it doesn't load `.env` files):
  ```bash
  PORT=3001 npm run dev          # Linux / macOS
  ```
  ```powershell
  $env:PORT = 3001; npm run dev  # Windows PowerShell
  ```
  ```bat
  :: Windows cmd.exe (no space before &&, or the port value gets a trailing space)
  set PORT=3001&& npm run dev
  ```
  Then open http://localhost:3001.

If the process holding port 3000 is another Halonyx server, changing `PORT` won't help, because that server also holds UDP port 9000 (see below). Stop the old one instead.

#### Port 9000 is already in use

Port 9000 is **UDP**, not TCP: the server opens a `udp4` socket on `127.0.0.1:9000` for its broadcast bridge. The fixed port isn't affected by `PORT`. When it's taken, the server exits with `Error: bind EADDRINUSE 127.0.0.1:9000`. This is also the first error you'll see if an old Halonyx server is still running, since it holds both 9000 and 3000.

Look for a **UDP** listener. TCP-only checks (`netstat -p TCP`, `Get-NetTCPConnection`, `lsof -iTCP`, `Test-NetConnection`) won't show it:

```bash
# Linux
ss -lunp 'sport = :9000'
# or: lsof -nP -iUDP:9000

# macOS
lsof -nP -iUDP:9000
```

```powershell
# Windows (PowerShell)
Get-NetUDPEndpoint -LocalPort 9000 | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <PID>
```

```bat
:: Windows (cmd.exe): UDP rows have no state column; the PID is the last column
netstat -ano -p UDP | findstr :9000
tasklist /FI "PID eq <PID>"
```

If it's a leftover Halonyx server of yours, stop it as described under port 3000. If another program legitimately needs UDP 9000, there is no environment variable to move it; changing it means editing `UDP_PORT` in `backend/server.js`, which is a code change rather than a setup step.

> **Note:** `scripts/start_server.sh` and `scripts/start_server.bat` terminate whatever they find on ports 3000, 8081 and 9000 without asking. Prefer the manual steps above unless you're sure nothing else on your machine uses those ports.

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
