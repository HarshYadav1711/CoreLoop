# CoreLoop

Write Python in the browser. Run it on a real server. Get the output back.

CoreLoop is a single-page web app built around one tight feedback loop: edit, run, inspect. The editor is Monaco. The runtime is CPython, invoked from a dedicated Express execution API with a hard wall-clock cap and bounded output capture. Nothing is mocked; every Run is a real subprocess on the server.

This is a focused execution prototype. Stronger sandboxing is required before exposing an instance to untrusted users — see [Security considerations](#security-considerations).

## Live demo

- App: https://core-loop.vercel.app
- API: https://coreloop-w36g.onrender.com

The backend may take a few seconds to wake up on the first request because it is hosted on Render's free tier.

## Key features

- Browser-based Python editor (Monaco), real server-side execution via CPython.
- Hard 2-second wall-clock timeout enforced with SIGKILL.
- One JSON response shape for success, runtime error, timeout, and request failure.
- Output capped at 256 KB per stream; code payload capped at 100 KB.
- Unique per-request temp directory, removed in `finally` even on crash.
- Stateless API: no accounts, no database, no third-party services.

## Tech stack

Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, Monaco Editor, Node.js 22, Express 5, CPython 3.10+.

## Architecture

Three layers, no shared state:

1. **Client.** `/frontend` is a single Next.js page on Vercel. It renders Monaco, a control row (Run, Reset, two presets), and an output console. The API base URL comes from `NEXT_PUBLIC_API_URL`.
2. **Execution API.** `/backend` is a small Express server on Render. `POST /api/run` validates the body (string `code`, 100 KB byte cap), creates a unique temp directory with `mkdtemp`, writes the code to `main.py`, and hands the path to the executor.
3. **Executor.** `child_process.spawn("python", ["-I", "-B", main.py], { shell: false })` on the host. A 2,000 ms timer fires `SIGKILL` on overrun. stdout and stderr are captured up to 256 KB each. The temp directory is removed in `finally`. An optional Docker executor is available via `CORELOOP_EXECUTOR=docker` for local isolation.

The response shape is identical on success and failure:

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

Validation failures (malformed JSON, missing `code`, oversized payload) return the same shape with `success: false` and the appropriate HTTP status (400 or 413). Clients decode one schema and never branch on whether the failure was server-side or input-side.

## Local setup

Requirements: Node.js 20+ and Python 3.10+ on `PATH`. The server uses `python3` on Linux/macOS and `python` on Windows; override with `PYTHON_BIN` if needed.

```bash
git clone <repo-url> coreloop
cd coreloop
npm install --prefix backend
npm install --prefix frontend

# Terminal 1
npm run dev --prefix backend
# http://localhost:3001

# Terminal 2
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev --prefix frontend
# http://localhost:3000
```

On PowerShell, set the env var with `$env:NEXT_PUBLIC_API_URL = "http://localhost:3001"` before `npm run dev`, or copy `frontend/.env.local.example` to `frontend/.env.local` to avoid setting it per terminal.

### Optional Docker execution

Run each Python program in a disposable container instead of on the host:

```bash
docker pull python:3.13-slim
CORELOOP_EXECUTOR=docker npm run dev --prefix backend
```

Each run starts a container with `--network none`, `--read-only`, tmpfs `/tmp`, dropped capabilities, and CPU, memory, and PID limits. Requires a running Docker daemon; leave the env var unset to use the host Python executor.

## Deployment

**Frontend on Vercel.** Root directory `frontend`, framework preset Next.js. Set `NEXT_PUBLIC_API_URL` to the Render backend URL.

**Backend on Render.** Root directory `backend`, runtime Docker, Dockerfile path `Dockerfile`, health check `/healthz`. The repo includes a `render.yaml` Blueprint. CORS allow-list is set in `backend/src/server.js` (`https://core-loop.vercel.app` and `http://localhost:3000`); edit that list if you deploy under a different Vercel domain. Do not set `CORELOOP_EXECUTOR=docker` on Render — the backend container already includes Python.

## Example runs

```bash
curl -s http://localhost:3001/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"print(\"Hello Empower\")"}'
```

```json
{"success": true, "output": "Hello Empower\n", "error": "", "timeout": false, "durationMs": 118, "exitCode": 0}
```

```bash
curl -s http://localhost:3001/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"while True: pass"}'
```

```json
{"success": false, "output": "", "error": "", "timeout": true, "durationMs": 2026, "exitCode": null}
```

SIGKILL fires at the 2-second mark. The server stays available for the next request.

## Security considerations

CoreLoop is not a public sandbox. Treat any deployment as a trust-required surface until the mitigations below are in place.

Live risks in the current implementation:

1. **No process isolation.** Submitted code runs as the server process user with read access to whatever Node can read and unrestricted outbound network access. A user can read source on disk, hit internal services, or call cloud-metadata endpoints.
2. **Bounded time, unbounded everything else.** The 2-second timer caps wall clock. It does not cap memory, file descriptors, threads, or child processes. Allocations like `" " * 10**10` can OOM the host before the timer fires.
3. **Standard library is fully available.** `python -I -B` skips site-packages and ignores user env vars, but `socket`, `subprocess`, `os`, and `ctypes` are all importable.
4. **No authentication or rate limiting.** Anyone who can reach the page can submit jobs. A trivial fetch loop saturates the host.

The optional Docker executor (`CORELOOP_EXECUTOR=docker`) removes network access, uses a read-only root filesystem, limits memory/CPU/PIDs, and runs code as an unprivileged user. It is enough for local exploration; not enough for public exposure.

To make CoreLoop safe to expose to the open internet, the execution path needs:

- An OS-level sandbox per request: gVisor, nsjail, or a Firecracker microVM. Docker alone is not sufficient.
- Default-deny network egress with a tight allowlist, enforced at the sandbox boundary, not in user code.
- Cgroup-enforced limits on memory, file descriptors, and PIDs.
- Per-IP and per-session rate limiting at the edge, returning `429` with `Retry-After`.
- Authenticated access if the audience is not fully trusted.

## Production scaling considerations

The current backend is a single Express process spawning one CPython per request on the same host. That shape is correct for a focused prototype and falls over around a few dozen concurrent runs. For 500 simultaneous users — meaning 500 in-flight execution requests, not 500 page views — the system needs to be reshaped across five axes.

1. **Split the web tier from the execution tier.** The Next.js app becomes a stateless front end behind a CDN. The API stops running Python in-process; it pushes a job onto a queue (Redis Streams, NATS JetStream, or SQS) and waits on the result. Surge tolerance and execution capacity scale independently.

2. **A dedicated execution worker pool.** Python runs on a horizontally scaled set of workers, not on the web host. At a 2-second cap and roughly a 3-second wall budget per request including queue and spawn, 500 concurrent users translates to about 500 in-flight sandboxes. At 10 to 20 sandboxes per worker (limited by RAM and PID count, not CPU), that is 25 to 50 worker nodes, autoscaled on queue depth.

3. **Sandbox per request, with warm pools.** Each job runs in a throwaway gVisor or Firecracker sandbox, not a fresh Docker container per request. Pre-warmed sandboxes are taken from a pool, the user code is fed in, the sandbox is reset or discarded. Cold start drops from hundreds of milliseconds to single-digit milliseconds. The sandbox enforces no network egress (or a tight allowlist), a read-only root filesystem, tmpfs-only writable scratch, cgroup limits, dropped capabilities, and a seccomp filter.

4. **Backpressure and fairness, not just scale.** Bounded queue depth with a published SLO beats unbounded queueing. Per-IP and per-session token buckets prevent one client from starving the others. The API returns `429` with `Retry-After` rather than silently queueing for tens of seconds.

5. **Observability built into the contract.** Every job carries a trace ID through queue, worker, and sandbox. Structured logs, per-route latency histograms (p50/p95/p99), and queue-depth and worker-saturation metrics drive the autoscaler.

The request and response contract does not change. `POST /api/run` still takes `{ code }` and returns the same JSON shape. Only the runtime topology beneath it changes.

## Future improvements

- Replace the host subprocess with a per-request gVisor or Firecracker sandbox; default-deny egress; cgroup-enforced limits.
- Per-IP rate limiting at the edge.
- Stream stdout and stderr to the client over Server-Sent Events.
- Cancel-in-flight from the UI; today the only way to stop a slow run is to wait for the timeout.
- Structured server logs and OpenTelemetry traces.

## License

MIT.
