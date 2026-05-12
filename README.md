# CoreLoop

Write Python in the browser. Run it on a real server. Get the output back.

CoreLoop is a single-page web app built around one tight feedback loop: edit, run, inspect. The editor is Monaco. The runtime is CPython, invoked from a dedicated Express execution API with a hard wall-clock cap and bounded output capture. Nothing is mocked; every Run is a real subprocess on the server.

> Live demo: _to be added once deployed_

## Status

CoreLoop is a focused execution prototype. It is built to validate one workflow — submit code, run it server-side, return structured output — and nothing else. The execution path is production-shaped (real subprocess, real timeout, real cleanup), but stronger sandboxing is required before exposing an instance to untrusted users on the public internet. See [Security considerations](#security-considerations).

## Product overview

A user lands on a single page with a Python editor and a console. They press Run (or `Cmd/Ctrl + Enter`). The browser POSTs the code to `/api/run`. The server writes it to a unique temporary file, spawns CPython, and returns a JSON result containing stdout, stderr, a success flag, a timeout flag, and timing data. The console renders the result with distinct states for success, runtime error, timeout, and request failure.

There is no account, no database, no third-party service. The entire product surface is the editor, the Run button, and the console.

## Key features

- Browser-based Python editor powered by Monaco.
- Real server-side execution via CPython, no in-browser interpreter.
- Hard 2-second wall-clock timeout enforced with SIGKILL.
- Single response shape covers success, runtime error, timeout, and request failure; the UI distinguishes all four.
- Output capped at 256 KB per stream so a hostile program cannot exhaust server memory.
- Unique per-request temp directory, removed in `finally`, even on crash.
- Cross-platform: works with `python3` on Linux/macOS and `python` on Windows; binary is overridable via `PYTHON_BIN`.
- Concurrent requests are independent; one user's timeout does not affect another's run.
- Stateless API; the server is free to be replaced or scaled horizontally.

## Tech stack

- Next.js 16 (App Router, standalone output)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Monaco Editor (`@monaco-editor/react`)
- Node.js 22 server runtime
- CPython 3.10+ for execution

No third-party services, no paid APIs, no telemetry SDKs.

## Architecture summary

Three layers, no shared state:

1. **Client.** `/frontend` is a single Next.js app for Vercel. It renders the Monaco editor, a small control row (Run, Reset, two presets), and an output console. State is local React; nothing is persisted. The API base URL comes from `NEXT_PUBLIC_API_BASE_URL`.
2. **Execution API.** `/backend` is a small Express server for Render. `POST /api/run` validates the body (string `code`, 100 KB byte cap), creates a unique temp directory with `mkdtemp`, writes the code to `main.py`, and hands the path to the executor.
3. **Executor.** By default, CoreLoop uses `child_process.spawn("python", ["-I", "-B", main.py], { shell: false })` on the host. An optional Docker executor is available through `CORELOOP_EXECUTOR=docker`; it runs the same temp file in a short-lived `python:3.13-slim` container with no network, a read-only root filesystem, tmpfs scratch space, and basic CPU, memory, and PID limits. In both modes, a 2,000 ms timer kills the run on overrun. stdout and stderr are captured up to 256 KB per stream. The temp directory is removed in `finally`.

The response shape is the same on success and failure:

```json
{
  "success":    boolean,
  "output":     "stdout as a string",
  "error":      "stderr or executor message",
  "timeout":    boolean,
  "durationMs": 118,
  "exitCode":   0
}
```

Validation failures (malformed JSON, missing `code`, oversized payload) return the same shape with `success: false` and the appropriate HTTP status (400 or 413). This means clients can decode one schema and never branch on whether the failure was server-side or input-side.

Notable execution-path choices:

- `spawn` with `shell: false`. No shell process is involved; the code path is never composed into a shell command, so shell-injection is structurally impossible.
- `python -I -B`. Isolated mode skips `site` and ignores `PYTHON*` environment variables; `-B` disables `.pyc` writes so the working directory stays clean.
- `CORELOOP_EXECUTOR=docker` is opt-in. It improves local isolation without changing the API contract, but it is still a basic container boundary rather than a full public sandbox.
- The `timeout: true` flag is the canonical signal for a 2-second termination. The `error` field carries Python's own stderr (usually empty for an infinite loop), not an injected executor marker.

## Local setup

Requirements:

- Node.js 20 or newer (tested on 22).
- Python 3.10 or newer on `PATH` for the backend. The server uses `python3` on Linux/macOS and `python` on Windows. Override with `PYTHON_BIN` if needed.

```bash
git clone <repo-url> coreloop
cd coreloop
npm install --prefix backend
npm install --prefix frontend
```

Run the backend:

```bash
npm run dev --prefix backend
# http://localhost:3001
```

Run the frontend in a second terminal:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 npm run dev --prefix frontend
# http://localhost:3000
```

PowerShell:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:3001"
npm run dev --prefix frontend
```

Optional Docker execution mode:

```bash
docker pull python:3.13-slim
CORELOOP_EXECUTOR=docker npm run dev --prefix backend
```

PowerShell:

```powershell
docker pull python:3.13-slim
$env:CORELOOP_EXECUTOR = "docker"
npm run dev --prefix backend
```

This keeps the main app unchanged and only swaps the execution backend. Each run starts a disposable container with `--network none`, `--read-only`, tmpfs `/tmp`, dropped capabilities, and small CPU, memory, and PID limits. The image is never pulled during a request (`--pull=never`), so local behavior stays predictable; pull it once before enabling the mode.

Docker execution requires a running Docker daemon. If Docker is not installed or Docker Desktop is stopped, leave `CORELOOP_EXECUTOR` unset and CoreLoop will use the default host Python executor.

## Deployment

### Frontend on Vercel

Create a Vercel project pointed at `/frontend`.

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: `.next`
- Environment variable: `NEXT_PUBLIC_API_BASE_URL=<your Render backend URL>`

The frontend contains no server execution logic. It only calls `POST /api/run` on the configured backend URL.

### Backend on Render

Create a Render Web Service pointed at `/backend`. Use the included backend Dockerfile so Python is available in production.

- Runtime: Docker
- Dockerfile path: `backend/Dockerfile` if the repo root is selected, or `Dockerfile` if `/backend` is selected as the root directory.
- Health check path: `/`
- Environment variables:
  - `CORS_ORIGIN=<your Vercel frontend URL>`
  - `PYTHON_BIN=python3` (optional; this is already the default on Linux)

Do not set `CORELOOP_EXECUTOR=docker` on Render. The backend container already includes Python; launching Docker from inside the Render container would require Docker-in-Docker and is intentionally not part of this deployment path.

Backend Docker image:

```bash
docker build -t coreloop-backend ./backend
docker run --rm -p 3001:3001 \
  --read-only --tmpfs /tmp:rw,size=64m,mode=1777 \
  --memory=512m --cpus=1 --pids-limit=128 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  coreloop-backend
```

The backend image packages Express and Python into one container. It does not enable the optional Docker executor by default, because running Docker from inside Docker requires mounting the host Docker socket and complicates the deployment model.

## Example runs

**Hello Empower.** Normal stdout, success in well under the timeout.

```bash
curl -s http://localhost:3001/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"print(\"Hello Empower\")"}'
```

```json
{
  "success": true,
  "output": "Hello Empower\n",
  "error": "",
  "timeout": false,
  "durationMs": 118,
  "exitCode": 0
}
```

**Infinite loop.** SIGKILL fires at the 2-second mark. The server stays available for the next request.

```bash
curl -s http://localhost:3001/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"while True: pass"}'
```

```json
{
  "success": false,
  "output": "",
  "error": "",
  "timeout": true,
  "durationMs": 2026,
  "exitCode": null
}
```

**Python runtime error.** Non-zero exit with stderr captured.

```bash
curl -s http://localhost:3001/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"raise RuntimeError(\"boom\")"}'
```

```json
{
  "success": false,
  "output": "",
  "error": "Traceback (most recent call last):\n  File \"/tmp/coreloop-xxxx/main.py\", line 1, in <module>\n    raise RuntimeError(\"boom\")\nRuntimeError: boom\n",
  "timeout": false,
  "durationMs": 102,
  "exitCode": 1
}
```

## Security considerations

CoreLoop is not a public sandbox. Treat any deployment as a trust-required surface until the mitigations below are in place.

Live risks in the current implementation:

1. **No process isolation.** Submitted code runs as the server process user with read access to whatever the Node process can read and unrestricted outbound network access. A user can read source on disk, hit internal services, or call cloud-metadata endpoints.
2. **Bounded time, unbounded everything else.** The 2-second timer caps wall clock. It does not cap memory, file descriptors, threads, or child processes. Allocations like `" " * 10**10` can OOM the host before the timer fires.
3. **Standard library is fully available.** `python -I -B` skips site-packages and ignores user env vars, but `socket`, `subprocess`, `os`, and `ctypes` are all importable. The language is not restricted; nothing in CoreLoop pretends otherwise.
4. **No authentication or rate limiting.** Anyone who can reach the page can submit jobs. A trivial fetch loop will saturate the host.
5. **One CPython interpreter per request.** Each request pays 50-150 ms of interpreter cold start. Concurrency is bounded only by host capacity, not by the application.
6. **Output capture is in-memory.** The 256 KB cap protects against unbounded output, but a program that produces output just below the cap on every request still costs memory under load.

The optional Docker executor (`CORELOOP_EXECUTOR=docker`) is enough to make local exploration safer: it removes network access, uses a read-only root filesystem, limits memory/CPU/PIDs, and runs code as an unprivileged user inside a short-lived container. It is still not enough for public exposure.

To make CoreLoop safe to expose to the open internet, the execution path needs:

- An OS-level sandbox per request: gVisor, nsjail, or a Firecracker microVM. Docker alone is not sufficient.
- Default-deny network egress with a tight allowlist, enforced at the sandbox boundary, not in user code.
- Cgroup-enforced limits on memory, file descriptors, and PIDs.
- Per-IP and per-session rate limiting at the edge, returning `429` with `Retry-After`.
- Authenticated access if the audience is not fully trusted.

## Production scaling considerations

The current backend design is a single Express process spawning one CPython per request on the same host. That shape is correct for a focused prototype and falls over somewhere around a few dozen concurrent runs. For 500 simultaneous users — meaning 500 in-flight execution requests, not 500 page views — the system needs to be reshaped across five axes.

1. **Split the web tier from the execution tier.** The Next.js app becomes a stateless front end behind a CDN. Monaco, the React bundle, and the page itself cache at the edge. The API stops running Python in-process; it pushes a job onto a queue (Redis Streams, NATS JetStream, or SQS) and waits on the result. Surge tolerance and execution capacity scale independently.

2. **A dedicated execution worker pool.** Python runs on a horizontally scaled set of execution workers, not on the web host. With a 2-second cap and roughly a 3-second wall budget per request including queue and spawn, 500 concurrent users translates to about 500 in-flight sandboxes. At 10 to 20 sandboxes per worker (limited by RAM and PID count rather than CPU), peak capacity is 25 to 50 worker nodes, autoscaled on queue depth rather than CPU.

3. **Sandbox per request, with warm pools.** Each job runs in a throwaway gVisor or Firecracker sandbox, not a fresh Docker container per request. Pre-warmed sandboxes are taken from a pool, the user code is fed in, the sandbox is reset or discarded. Cold start drops from hundreds of milliseconds to single-digit milliseconds. The sandbox enforces no network egress (or a tight allowlist), a read-only root filesystem, tmpfs-only writable scratch, cgroup limits on memory and PIDs, dropped capabilities, and a seccomp filter.

4. **Backpressure and fairness, not just scale.** Bounded queue depth with a published SLO beats unbounded queueing. Per-IP and per-session token buckets prevent a single client from starving the others. The API returns `429` with a `Retry-After` rather than silently queueing for tens of seconds.

5. **Observability built into the contract.** Every job carries a trace ID through queue, worker, and sandbox. Structured logs (one line per job: id, bytes, duration, exit, status), per-route latency histograms (p50/p95/p99), and queue-depth and worker-saturation metrics drive the autoscaler. Without these, "it is slow" is unactionable at this concurrency.

The request and response contract does not change. `POST /api/run` still takes `{ code }` and returns the same JSON shape. Only the runtime topology beneath it changes.

## Future improvements

Roughly in priority order.

- Replace the host subprocess with a per-request gVisor or Firecracker sandbox, default-deny egress, and cgroup-enforced resource limits.
- Per-IP rate limiting and request-size accounting at the edge.
- Stream stdout and stderr to the client over Server-Sent Events so long-running programs show output before they finish.
- Warm interpreter pool with a reset protocol to cut cold-start cost to single-digit milliseconds.
- Cancel-in-flight from the UI; today the only way to stop a slow run is to wait for the timeout.
- Snippet sharing via signed URLs, with the code carried in the URL fragment so the server stays stateless.
- Structured server logs and OpenTelemetry traces, exported to whatever the host environment uses.
- Optional language packs (Node, Ruby, Go) once the sandboxing primitive is in place; the contract is already language-agnostic.

## License

MIT.
