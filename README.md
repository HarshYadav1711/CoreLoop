# CoreLoop

Write Python in the browser. Run it on a real server. Get the output back.

CoreLoop is a single-page web app built around one tight loop: edit, run,
inspect. The editor is Monaco (the engine behind VS Code). The runtime is
plain CPython, invoked from a Next.js API route, with a hard wall-clock
timeout and bounded output capture. Nothing is mocked.

> Live demo: _to be filled in once deployed_ — see [Deployment](#deployment).

---

## What it does

- Submits the editor buffer to `POST /api/run`.
- The server writes the code to a private temporary file, spawns CPython with
  isolated flags (`python -I -B`), and streams `stdout` / `stderr`.
- A 2,000 ms timer kills the process group with `SIGKILL` if it overruns.
- The response always includes `status`, `stdout`, `stderr`, `durationMs`,
  `exitCode`, `signal`, and a `truncated` flag (output capped at 256 KB).
- The temp directory is removed on every request, even on failure.

That is the whole product surface. There is no auth, no database, no account
system, and no third-party paid API.

## Required demo cases

| Input                       | Expected status | Expected output                  |
| --------------------------- | --------------- | -------------------------------- |
| `print("Hello Empower")`    | `success`       | `Hello Empower` in `stdout`      |
| `while True: pass`          | `timeout`       | Killed at 2 s, server stays up   |

Both ship as one-click examples in the editor toolbar (`Hello`, `Timeout`).

---

## Local run

Requirements:

- Node.js **20+** (tested on 22)
- Python **3.10+** on `PATH`
  - The server uses `python3` on Linux/macOS and `python` on Windows. Override
    with the `PYTHON_BIN` environment variable if needed.

```bash
git clone <this-repo-url> coreloop
cd coreloop
npm install
npm run dev
# open http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

### Manual API check

```bash
curl -s http://localhost:3000/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"print(\"Hello Empower\")"}'
```

```bash
curl -s http://localhost:3000/api/run \
  -H 'content-type: application/json' \
  -d '{"code":"while True: pass"}'
```

The second request returns within ~2 s with `"status":"timeout"` and the
server keeps serving subsequent requests.

---

## Run with Docker (optional)

A multi-stage `Dockerfile` ships with the project. The runtime image is
`node:22-bookworm-slim` plus `python3` and `tini`, running as a non-root
user. It is the smallest setup that keeps signal handling and zombie reaping
correct when CoreLoop kills runaway Python processes.

```bash
docker build -t coreloop .
docker run --rm -p 3000:3000 \
  --read-only \
  --tmpfs /tmp:rw,size=64m,mode=1777 \
  --memory=512m --cpus=1 \
  --pids-limit=128 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  coreloop
```

The flags above are deliberate — they harden the container without changing
how the app behaves:

- `--read-only` + `--tmpfs /tmp` — the only writable surface is the temp
  directory where user code lives, bounded to 64 MB.
- `--memory`, `--cpus`, `--pids-limit` — first line of defence against fork
  bombs and memory exhaustion.
- `--cap-drop=ALL`, `--security-opt=no-new-privileges` — strip Linux
  capabilities that user code has no business touching.

Network egress is **not** blocked here; see [Security](#security-risks-still-present).

---

## Deployment

The repo is deploy-ready, but no live URL is published yet.

- **Vercel** is _not_ recommended for this app. Serverless functions on Vercel
  do not include a Python runtime alongside the Node runtime, and they have
  stricter execution-time and process-spawn limits than this design assumes.
- **Recommended targets** for a working live demo:
  - Fly.io / Railway / Render — point them at the included `Dockerfile`.
  - A small VM (any cloud) running `docker run` with the hardening flags
    above.

Once deployed, replace the placeholder under the title with the live URL.

---

## Architecture (today)

```
Browser (Next.js page, Monaco editor)
        │
        │  POST /api/run  { code }
        ▼
Next.js API route (Node runtime)
        │
        │  spawn("python3", ["-I", "-B", main.py])
        │  + 2 s SIGKILL timer
        │  + output capture (cap 256 KB)
        ▼
CPython subprocess on the same host
```

Key files:

- `src/app/page.tsx` — single-page UI, Monaco editor, output pane, status pill.
- `src/app/api/run/route.ts` — Python invocation, timeout, output capture.
- `Dockerfile` — production image (Node + Python + tini, non-root).
- `next.config.ts` — `output: "standalone"` so the Docker image stays small.

---

## Security risks still present

CoreLoop is a prototype. Treat the input as **trusted code** — do not expose
this instance to the open internet without the mitigations described in the
next section. The current implementation has the following live risks:

1. **No sandbox isolation.** Submitted Python runs as the server process user
   with full filesystem read access to whatever the Node process can see and
   full outbound network access. A user can read source files, hit internal
   services, exfiltrate data, or call cloud-metadata endpoints.
2. **Resource exhaustion beyond wall-clock.** The 2-second timer bounds time
   but not memory, file descriptors, threads, or child processes. A program
   like `x = " " * 10**10` or a fork bomb can degrade or OOM the host before
   the timer fires. The Docker flags above contain this, but the bare
   `npm run start` path does not.
3. **Disk pressure.** Each request writes a small file to the OS temp dir.
   Cleanup is best-effort; if the Node process is killed mid-request, the
   temp directory leaks until the OS reaps it.
4. **No rate limiting or authentication.** Anyone who can reach the page can
   submit arbitrary jobs. A trivial loop of `fetch('/api/run', …)` will pin
   the server.
5. **Subprocess-spawn DoS.** Each request spawns a fresh `python` interpreter.
   That is ~50–150 ms of cold start and a non-trivial RSS footprint per
   request. Concurrency is bounded only by the host.
6. **Stdin and import surface.** `python -I -B` disables site-packages and the
   user's environment, but the standard library is fully available — that
   includes `socket`, `subprocess`, `os`, and `ctypes`. None of these are
   blocked at the language level.
7. **Output capture is in-memory.** The 256 KB cap prevents unbounded growth,
   but a program that produces output _just_ under the cap on every request
   still costs memory under load.

A production deployment must add: an OS-level sandbox (gVisor, nsjail,
Firecracker microVM, or a per-request throwaway container), egress network
policy (default deny), cgroup-enforced CPU/RAM/PID limits, per-IP rate
limiting, and authenticated access if appropriate.

## How the architecture would change for 500 simultaneous users

The current design is a single Node process spawning one CPython per request
on the same host. That works for a demo and falls over somewhere around a few
dozen concurrent runs. A 500-concurrent-user target — meaning ~500 execution
requests in flight at any moment, not just 500 page views — would change
shape on five axes:

1. **Separate the web tier from the execution tier.**
   The Next.js app becomes a stateless front end behind a CDN. The static
   page, Monaco assets, and React bundle are cached at the edge — no server
   work for renders. The API route stops spawning Python directly; it pushes
   a job onto a queue (Redis Streams, NATS JetStream, or SQS) and waits on
   the result. This decouples surge-tolerance from execution capacity.

2. **A dedicated execution worker pool.**
   Python no longer runs on the web host. A horizontally scaled set of
   execution workers (Kubernetes Deployment, ECS service, Fly Machines,
   Nomad job — the orchestrator is not the point) pulls jobs and runs each
   one in an isolated sandbox. With a 2 s wall-clock cap and assuming ~3 s
   wall budget per request including queue + spawn, 500 concurrent users is
   ~500 in-flight sandboxes. Sized at ~10–20 sandboxes per worker node
   (limited by RAM and PID count rather than CPU), that's ~25–50 worker
   nodes at peak, with autoscaling driven by queue depth, not CPU.

3. **Sandbox per request, with warm pools.**
   Each job runs in a throwaway gVisor or Firecracker sandbox — not a fresh
   Docker container per request (too slow). Pre-warmed sandboxes are taken
   from a pool, the user code is fed in, the sandbox is reset or discarded.
   Cold start drops from hundreds of milliseconds to single-digit
   milliseconds. The sandbox enforces: no network egress except an allowlist,
   read-only root filesystem, tmpfs-only writable scratch, strict
   memory/CPU/PID cgroups, dropped capabilities, seccomp filter.

4. **Backpressure and fairness, not just scale.**
   Bounded queue depth with a published SLO ("if we can't run your job in N
   seconds we reject it") beats letting the queue grow unbounded. Per-IP
   and per-session token buckets stop a single client from starving everyone
   else. The API returns `429` with a `Retry-After` instead of silently
   queueing for 30 s.

5. **Observability built into the contract.**
   Every job gets a trace ID returned to the client and propagated through
   queue → worker → sandbox. Structured logs (one line per job: id, bytes,
   duration, exit, status), per-route latency histograms (p50/p95/p99), and
   queue-depth / worker-saturation metrics are the inputs to the autoscaler.
   Without these, "it's slow" is unactionable at 500 concurrent users.

The data plane stays simple — the request body is still `{ code }` and the
response is still `{ status, stdout, stderr, durationMs }`. What changes is
where the Python actually runs and how the system absorbs load without the
single Node process being the bottleneck.

---

## Tech

- Next.js 16 (App Router, standalone output)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Monaco Editor (`@monaco-editor/react`)
- Node.js 22 runtime, CPython 3.10+ for execution
- No third-party services, no paid APIs

## License

MIT.
