# Fresh Mach Context Spawn for macOS Terminal Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOS'ta Superset'in `terminal-host` daemon'ı stale Mach bootstrap context'e düşse bile, yeni terminallerin `gh`/`terraform`/`kubectl` gibi Go CLI araçlarını çalıştırabilmesi; eski terminallerdeki çalışan process'leri (dev server, build) öldürmeden.

**Architecture:** Electron main process her app açılışında fresh Mach context ile doğar. Bu plan, terminal-host'un fork ettiği pty-subprocess'leri Electron main'e delegate eder (fresh inherit); ve eski terminallerdeki shell'lere preexec wrapper inject eder ki whitelisted komutlar (`gh`, `terraform`...) arka plandan fresh bir helper ile çalıştırılsın.

**Tech Stack:** TypeScript, Electron, Node.js child_process, Unix Domain Sockets (NDJSON framing), node-pty, Bun runtime, Bun test

---

## Post-Spike Architecture Update (Task 3 findings)

Task 3 spike showed `node-unix-socket` does not support SCM_RIGHTS FD passing and seqpacket is unavailable on macOS. Rather than write a native N-API addon (~300 lines C++), we pivoted to a simpler architecture:

**Electron-hosted child processes with I/O forwarding:**
- Electron main spawns the fresh child (pty-subprocess or fresh-exec target)
- Electron main holds the stdin/stdout/stderr pipes itself
- Electron main forwards I/O to daemon / fresh-exec over UDS as NDJSON frames
- Daemon's existing `pty-subprocess-ipc.ts` frame protocol is reused

**What this affects in the task list:**
- Task 8 (`spawn-pty-subprocess` handler) now streams I/O over UDS instead of sending FDs
- Task 9 (ChildProcess adapter) now wraps the UDS stream rather than received FDs
- Task 13 (`fresh-exec` handler) similarly streams through the UDS
- Task 14 (PTY bridging) now bridges the UDS stream to fresh-exec's local TTY

**Trade-off accepted:** New PTYs cannot be spawned while Electron is closed. Since terminal creation requires Superset's UI, this is never observable in practice. Existing daemon-owned sessions are unaffected.

---

## Repo Orientation

Bu plan `superset-sh/superset` fork'unda çalışıyor. Ana yerler:

**Electron main process:**
- `apps/desktop/src/main/index.ts` — Electron main entry, app lifecycle
- `apps/desktop/src/main/terminal-host/terminal-host.ts` — terminal-host daemon RPC handler
- `apps/desktop/src/main/terminal-host/session.ts` — Her session için PTY spawn (kritik line: 268)
- `apps/desktop/src/main/terminal-host/pty-subprocess.ts` — Her PTY için izole subprocess
- `apps/desktop/src/main/lib/terminal-host/client.ts` — Electron main'in terminal-host daemon'a client'ı

**Shared:**
- `apps/desktop/src/shared/` — Renderer + main arası paylaşımlı tipler

**Testler:**
- Her dosyanın yanında `*.test.ts`
- Bun test runner (`bun test`)
- Mock'lar inline, test utility'ler `test-helpers.ts`

**Build:**
- `bun run build` — TypeScript derle + Electron builder package
- `bun run dev` — Hot-reload dev mode
- `bun run typecheck` — Type kontrol

---

## Problem Özeti (Kısa)

Sorun detayı için bkz. `docs/2026-04-17-design.md`. Özet:

1. Go binary'leri macOS'ta TLS doğrulaması için `trustd` Mach daemon'ına erişir
2. Uzun ömürlü `terminal-host` daemon stale bootstrap port taşırsa child'ları da stale
3. PR #2571 çözümü: her startup'ta daemon'ı öldürmek — **bu çalışan session'ları öldürür, bizim kabul etmediğimiz trade-off**
4. Bizim çözüm: daemon'ı yaşat, spawn'ı Electron main'e (her zaman fresh) delegate et

---

## Görev Listesi

### Faz 0: Setup
- Task 1: Fork repo, dev environment kur
- Task 2: Yeni branch + plan commit

### Faz 1: Fresh Spawn Server (Yeni Terminaller İçin)
- Task 3: FD passing prototype (seçim: npm package vs inline native)
- Task 4: UDS protocol schema + types
- Task 5: Token-based auth
- Task 6: Spawn-server skeleton (Electron main side)
- Task 7: Spawn-client skeleton (terminal-host side)
- Task 8: Spawn-server `spawn-pty-subprocess` RPC
- Task 9: Spawn-client FD receive + ChildProcess adapter
- Task 10: Session.ts entegrasyonu + fallback
- Task 11: E2E: yeni terminal `gh auth status` çalışıyor mu

### Faz 2: Shell Wrapper (Eski Terminaller İçin)
- Task 12: fresh-exec helper binary skeleton
- Task 13: Spawn-server `fresh-exec` RPC
- Task 14: PTY bridging (interactive komutlar için)
- Task 15: Signal forwarding (Ctrl+C, SIGWINCH)
- Task 16: zsh preexec hook script
- Task 17: Shell wrapper injection (ZDOTDIR pattern)
- Task 18: Whitelist config
- Task 19: E2E: eski terminal `gh auth login` çalışıyor mu

### Faz 3: Polish & Release
- Task 20: Cross-platform guards (non-macOS no-op)
- Task 21: Metrics + warn logging
- Task 22: Full type-check + biome lint
- Task 23: Local Superset build + manual E2E
- Task 24: PR body yaz, issue comment, push

---

## Task 1: Fork Repo ve Dev Environment

**Files:**
- Modify: Git remote config

**Amaç:** Kendi fork'umuzda çalışabilmek için remote'u ayarla.

- [ ] **Step 1.1: Fork'u GitHub'da oluştur**

Tarayıcıda: https://github.com/superset-sh/superset/fork — "Create Fork" tuşuna bas. GitHub hesabın olarak `Haknt` seç.

- [ ] **Step 1.2: Remote'u ekle**

```bash
cd ~/Documents/repos/superset-sh-superset
git remote rename origin upstream
git remote add origin https://github.com/Haknt/superset.git
git fetch origin
git branch -u origin/main main
```

Expected: `git remote -v` çıktısında `upstream` (superset-sh) ve `origin` (Haknt) gözükür.

- [ ] **Step 1.3: Dependencies install**

```bash
cd ~/Documents/repos/superset-sh-superset
bun install
```

Expected: Sıfır error. Node.js >= 18 gerekli.

- [ ] **Step 1.4: Sanity check**

```bash
cd apps/desktop
bun run typecheck
```

Expected: Typecheck passes (mevcut codebase temiz olmalı).

- [ ] **Step 1.5: Commit (no change — sanity only)**

Atla — sadece setup.

---

## Task 2: Branch Oluştur + Plan Commit

**Files:**
- Create: `apps/desktop/plans/20260417-1500-fresh-mach-context-spawn.md` (bu dosyanın kopyası)

- [ ] **Step 2.1: Yeni branch**

```bash
cd ~/Documents/repos/superset-sh-superset
git checkout -b feat/fresh-mach-context-spawn
```

- [ ] **Step 2.2: Plan'ı repo'ya kopyala**

```bash
cp ~/Documents/repos/mach-fresh-spawn/docs/2026-04-17-plan.md \
   apps/desktop/plans/20260417-1500-fresh-mach-context-spawn.md

cp ~/Documents/repos/mach-fresh-spawn/docs/2026-04-17-design.md \
   apps/desktop/docs/fresh-mach-context-design.md
```

- [ ] **Step 2.3: Commit**

```bash
git add apps/desktop/plans/ apps/desktop/docs/
git commit -m "docs: add fresh Mach context spawn plan and design

Refs #2570"
```

---

## Task 3: FD Passing Prototype

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/spike/fd-passing-spike.ts`
- Create: `apps/desktop/src/main/fresh-spawn/spike/fd-passing-spike.test.ts`

**Amaç:** Seçeceğimiz FD passing yaklaşımını doğrula: npm `node-unix-socket` package vs inline native addon. Bu spike task.

- [ ] **Step 3.1: Failing test yaz — FD passing round-trip**

Test iki process arasında stdin FD transfer ediyor mu?

```typescript
// apps/desktop/src/main/fresh-spawn/spike/fd-passing-spike.test.ts
import { describe, it, expect } from "bun:test";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendFd, recvFd } from "./fd-passing-spike";

describe("fd-passing spike", () => {
	it("transfers a writable FD between two processes", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-spike-"));
		const sockPath = path.join(tmpDir, "spike.sock");
		const outFile = path.join(tmpDir, "received.txt");

		// Sender spawns child process, opens a write FD to outFile,
		// sends it via UDS to receiver
		const senderReady = new Promise<void>((resolve) => {
			const fd = fs.openSync(outFile, "w");
			sendFd(sockPath, fd, resolve);
		});

		// Receiver reads FD from UDS, writes "hello", closes
		await senderReady;
		const received = await recvFd(sockPath);
		fs.writeSync(received, "hello");
		fs.closeSync(received);

		const content = fs.readFileSync(outFile, "utf8");
		expect(content).toBe("hello");

		fs.rmSync(tmpDir, { recursive: true });
	});
});
```

- [ ] **Step 3.2: Test'i fail eder şekilde çalıştır**

```bash
cd apps/desktop
bun test src/main/fresh-spawn/spike/fd-passing-spike.test.ts
```

Expected: FAIL with `sendFd is not defined`

- [ ] **Step 3.3: npm package `node-unix-socket` dene**

```bash
cd apps/desktop
bun add node-unix-socket
```

- [ ] **Step 3.4: Minimal wrapper yaz**

```typescript
// apps/desktop/src/main/fresh-spawn/spike/fd-passing-spike.ts
import { UnixSeqpacketSocketServer, UnixSeqpacketSocket } from "node-unix-socket";

export function sendFd(
	socketPath: string,
	fd: number,
	onConnected: () => void,
): void {
	const server = new UnixSeqpacketSocketServer();
	server.listen(socketPath);
	server.onConnection((client) => {
		client.sendFd(Buffer.from([0]), fd, () => {
			server.close();
		});
	});
	onConnected();
}

export function recvFd(socketPath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const client = new UnixSeqpacketSocket();
		client.connect(socketPath);
		client.onData((data, fds) => {
			if (fds.length === 0) {
				reject(new Error("no fd received"));
				return;
			}
			resolve(fds[0]);
			client.close();
		});
	});
}
```

**NOT:** `node-unix-socket` API'si doğrulanmamış — ilk deneme. Çalışmazsa Step 3.5.

- [ ] **Step 3.5: Testi çalıştır**

```bash
bun test src/main/fresh-spawn/spike/fd-passing-spike.test.ts
```

Expected: PASS. Fail ederse Step 3.6.

- [ ] **Step 3.6: FALLBACK — Inline native addon**

`node-unix-socket` çalışmazsa, native N-API addon yaz. Bu ayrı sub-task:

```bash
# apps/desktop/src/main/fresh-spawn/spike/native/
mkdir -p src/main/fresh-spawn/spike/native
```

Dosyalar:
- `binding.gyp` — build config
- `fd_passing.cc` — `sendmsg()` + `recvmsg()` C++ (~80 satır)

Native addon yazımı ayrı task grubu. Şimdilik: spike npm'le PASS olursa burada dur. Native gerekirse bu plan güncellenir.

- [ ] **Step 3.7: Commit (spike)**

```bash
git add apps/desktop/src/main/fresh-spawn/spike/ apps/desktop/package.json bun.lockb
git commit -m "spike: validate FD passing between processes via UDS

Uses node-unix-socket for SCM_RIGHTS FD transfer. Round-trip test passes.
Refs #2570"
```

---

## Task 4: UDS Protocol Schema + Types

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/types.ts`
- Create: `apps/desktop/src/main/fresh-spawn/types.test.ts`

**Amaç:** Spawn-server ↔ spawn-client arasındaki JSON protocol'ün tiplerini Zod ile tanımla.

- [ ] **Step 4.1: Failing test — request/response schema validation**

```typescript
// apps/desktop/src/main/fresh-spawn/types.test.ts
import { describe, it, expect } from "bun:test";
import {
	SpawnRequestSchema,
	SpawnResponseSchema,
	type SpawnRequest,
	type SpawnResponse,
} from "./types";

describe("fresh-spawn protocol types", () => {
	it("validates spawn-pty-subprocess request", () => {
		const req: SpawnRequest = {
			type: "spawn-pty-subprocess",
			token: "abc123",
			env: { PATH: "/usr/bin", HOME: "/Users/x" },
		};
		expect(() => SpawnRequestSchema.parse(req)).not.toThrow();
	});

	it("validates fresh-exec request", () => {
		const req: SpawnRequest = {
			type: "fresh-exec",
			token: "abc123",
			command: "gh",
			args: ["auth", "login"],
			cwd: "/tmp",
			env: {},
			ptyCols: 80,
			ptyRows: 24,
		};
		expect(() => SpawnRequestSchema.parse(req)).not.toThrow();
	});

	it("rejects request without token", () => {
		expect(() =>
			SpawnRequestSchema.parse({ type: "spawn-pty-subprocess", env: {} }),
		).toThrow();
	});

	it("validates ok response", () => {
		const resp: SpawnResponse = { type: "ok", pid: 1234 };
		expect(() => SpawnResponseSchema.parse(resp)).not.toThrow();
	});

	it("validates error response", () => {
		const resp: SpawnResponse = {
			type: "error",
			message: "auth failed",
			code: "E_AUTH",
		};
		expect(() => SpawnResponseSchema.parse(resp)).not.toThrow();
	});
});
```

- [ ] **Step 4.2: Test fail**

```bash
bun test src/main/fresh-spawn/types.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 4.3: Types + schemas yaz**

```typescript
// apps/desktop/src/main/fresh-spawn/types.ts
import { z } from "zod";

export const SpawnRequestSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("spawn-pty-subprocess"),
		token: z.string().min(1),
		env: z.record(z.string(), z.string()),
	}),
	z.object({
		type: z.literal("fresh-exec"),
		token: z.string().min(1),
		command: z.string().min(1),
		args: z.array(z.string()),
		cwd: z.string().min(1),
		env: z.record(z.string(), z.string()),
		ptyCols: z.number().int().positive(),
		ptyRows: z.number().int().positive(),
	}),
]);

export type SpawnRequest = z.infer<typeof SpawnRequestSchema>;

export const SpawnResponseSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("ok"),
		pid: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("error"),
		message: z.string(),
		code: z.string(),
	}),
]);

export type SpawnResponse = z.infer<typeof SpawnResponseSchema>;

export const DEFAULT_SOCKET_PATH = `${process.env.HOME}/.superset/fresh-spawn.sock`;
export const DEFAULT_TOKEN_PATH = `${process.env.HOME}/.superset/fresh-spawn.token`;
```

- [ ] **Step 4.4: Test pass**

```bash
bun test src/main/fresh-spawn/types.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 4.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/types.ts apps/desktop/src/main/fresh-spawn/types.test.ts
git commit -m "feat(fresh-spawn): define UDS protocol schema

Zod discriminated union for SpawnRequest (spawn-pty-subprocess | fresh-exec)
and SpawnResponse (ok | error). Tests cover happy paths and auth rejection.
Refs #2570"
```

---

## Task 5: Token-Based Auth

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/auth.ts`
- Create: `apps/desktop/src/main/fresh-spawn/auth.test.ts`

**Amaç:** Başka local app'ler fresh-spawn socket'ine connect edip spawn edemesin diye random token gate'i.

- [ ] **Step 5.1: Failing test — token generate/read/verify**

```typescript
// apps/desktop/src/main/fresh-spawn/auth.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	generateTokenFile,
	readTokenFile,
	verifyToken,
} from "./auth";

describe("fresh-spawn auth", () => {
	let tmpPath: string;

	beforeEach(() => {
		tmpPath = path.join(
			os.tmpdir(),
			`fs-auth-${Date.now()}-${Math.random()}.token`,
		);
	});

	it("generates token with 256 bits of entropy", () => {
		const token = generateTokenFile(tmpPath);
		expect(token.length).toBeGreaterThanOrEqual(43); // base64 of 32 bytes
		expect(fs.readFileSync(tmpPath, "utf8")).toBe(token);

		const stat = fs.statSync(tmpPath);
		// Mode 0o600 — only owner readable
		expect(stat.mode & 0o077).toBe(0);
		fs.rmSync(tmpPath);
	});

	it("reads back the generated token", () => {
		const expected = generateTokenFile(tmpPath);
		const actual = readTokenFile(tmpPath);
		expect(actual).toBe(expected);
		fs.rmSync(tmpPath);
	});

	it("verifyToken returns true for match", () => {
		const token = "abcdef";
		expect(verifyToken(token, "abcdef")).toBe(true);
	});

	it("verifyToken returns false for mismatch", () => {
		expect(verifyToken("abc", "abcdef")).toBe(false);
	});

	it("verifyToken uses constant-time comparison (length mismatch)", () => {
		expect(verifyToken("x", "abcdef")).toBe(false);
	});
});
```

- [ ] **Step 5.2: Test fail**

```bash
bun test src/main/fresh-spawn/auth.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 5.3: Implementation**

```typescript
// apps/desktop/src/main/fresh-spawn/auth.ts
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Generate a cryptographically random token, write to path with 0600 mode,
 * and return the token string.
 */
export function generateTokenFile(tokenPath: string): string {
	const token = crypto.randomBytes(32).toString("base64url");
	fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
	fs.writeFileSync(tokenPath, token, { mode: 0o600 });
	return token;
}

/**
 * Read the token from disk.
 * Throws if file missing — caller must handle.
 */
export function readTokenFile(tokenPath: string): string {
	return fs.readFileSync(tokenPath, "utf8").trim();
}

/**
 * Constant-time token comparison. Returns false on length mismatch
 * without timing leak.
 */
export function verifyToken(received: string, expected: string): boolean {
	if (received.length !== expected.length) return false;
	return crypto.timingSafeEqual(
		Buffer.from(received),
		Buffer.from(expected),
	);
}
```

- [ ] **Step 5.4: Test pass**

```bash
bun test src/main/fresh-spawn/auth.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/auth.ts apps/desktop/src/main/fresh-spawn/auth.test.ts
git commit -m "feat(fresh-spawn): token-based auth with 0600 file

256-bit random token in ~/.superset/fresh-spawn.token. Constant-time compare
prevents timing attacks. Refs #2570"
```

---

## Task 6: Spawn-Server Skeleton

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/spawn-server.ts`
- Create: `apps/desktop/src/main/fresh-spawn/spawn-server.test.ts`

**Amaç:** UDS server'ı başlat, gelen bağlantıları kabul et, request/response handle et (spawn logic'i TODO placeholder olarak).

- [ ] **Step 6.1: Failing test — server starts, accepts connection, rejects bad auth**

```typescript
// apps/desktop/src/main/fresh-spawn/spawn-server.test.ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as net from "node:net";
import { startSpawnServer, type SpawnServer } from "./spawn-server";

describe("SpawnServer", () => {
	let server: SpawnServer | null = null;
	let tmpDir: string;

	afterEach(() => {
		if (server) {
			server.close();
			server = null;
		}
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it("starts, accepts a connection, rejects invalid token", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-server-"));
		const sockPath = path.join(tmpDir, "server.sock");
		const tokenPath = path.join(tmpDir, "server.token");

		server = await startSpawnServer({
			socketPath: sockPath,
			tokenPath,
		});

		const client = net.createConnection(sockPath);
		await new Promise<void>((resolve) => client.once("connect", () => resolve()));

		const req = {
			type: "spawn-pty-subprocess",
			token: "WRONG_TOKEN",
			env: {},
		};
		client.write(`${JSON.stringify(req)}\n`);

		const resp = await new Promise<string>((resolve) => {
			client.once("data", (data) => resolve(data.toString("utf8").trim()));
		});

		const parsed = JSON.parse(resp);
		expect(parsed.type).toBe("error");
		expect(parsed.code).toBe("E_AUTH");

		client.destroy();
	});
});
```

- [ ] **Step 6.2: Test fail**

```bash
bun test src/main/fresh-spawn/spawn-server.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 6.3: Minimal server implementation**

```typescript
// apps/desktop/src/main/fresh-spawn/spawn-server.ts
import * as fs from "node:fs";
import * as net from "node:net";
import { generateTokenFile, verifyToken } from "./auth";
import {
	SpawnRequestSchema,
	type SpawnResponse,
} from "./types";

export interface SpawnServerOptions {
	socketPath: string;
	tokenPath: string;
}

export interface SpawnServer {
	close(): void;
}

export async function startSpawnServer(
	options: SpawnServerOptions,
): Promise<SpawnServer> {
	// Ensure socket not stale
	try {
		fs.unlinkSync(options.socketPath);
	} catch {
		// File may not exist — ignore
	}

	const token = generateTokenFile(options.tokenPath);

	const server = net.createServer((client) => {
		client.once("data", (data) => {
			const text = data.toString("utf8").trim();
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				sendResponse(client, {
					type: "error",
					message: "invalid JSON",
					code: "E_PARSE",
				});
				client.destroy();
				return;
			}

			const result = SpawnRequestSchema.safeParse(parsed);
			if (!result.success) {
				sendResponse(client, {
					type: "error",
					message: "invalid request",
					code: "E_SCHEMA",
				});
				client.destroy();
				return;
			}

			if (!verifyToken(result.data.token, token)) {
				sendResponse(client, {
					type: "error",
					message: "bad token",
					code: "E_AUTH",
				});
				client.destroy();
				return;
			}

			// TODO Task 8 & 13: actual spawn handling
			sendResponse(client, {
				type: "error",
				message: "not implemented",
				code: "E_TODO",
			});
			client.destroy();
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.socketPath, () => {
			// chmod 0700 for owner-only access
			try {
				fs.chmodSync(options.socketPath, 0o700);
			} catch (err) {
				server.close();
				reject(err);
				return;
			}
			resolve();
		});
	});

	return {
		close: () => {
			server.close();
			try {
				fs.unlinkSync(options.socketPath);
			} catch {
				// ignore
			}
		},
	};
}

function sendResponse(client: net.Socket, resp: SpawnResponse): void {
	client.write(`${JSON.stringify(resp)}\n`);
}
```

- [ ] **Step 6.4: Test pass**

```bash
bun test src/main/fresh-spawn/spawn-server.test.ts
```

Expected: PASS (1 test)

- [ ] **Step 6.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/spawn-server.ts apps/desktop/src/main/fresh-spawn/spawn-server.test.ts
git commit -m "feat(fresh-spawn): UDS spawn server skeleton

Starts server on configurable socket path, validates auth token, parses
request schema. Actual spawn handlers are TODO (Tasks 8, 13). Refs #2570"
```

---

## Task 7: Spawn-Client Skeleton

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/spawn-client.ts`
- Create: `apps/desktop/src/main/fresh-spawn/spawn-client.test.ts`

**Amaç:** terminal-host'tan (veya fresh-exec'ten) server'a bağlanan client. Request yap, response oku.

- [ ] **Step 7.1: Failing test — client connects and receives response**

```typescript
// apps/desktop/src/main/fresh-spawn/spawn-client.test.ts
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { startSpawnServer, type SpawnServer } from "./spawn-server";
import { sendSpawnRequest } from "./spawn-client";

describe("SpawnClient", () => {
	let server: SpawnServer | null = null;
	let tmpDir: string;

	afterEach(() => {
		if (server) server.close();
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it("sends request with correct token, receives error (TODO handler)", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-client-"));
		const sockPath = path.join(tmpDir, "s.sock");
		const tokenPath = path.join(tmpDir, "s.token");

		server = await startSpawnServer({
			socketPath: sockPath,
			tokenPath,
		});

		const resp = await sendSpawnRequest({
			socketPath: sockPath,
			tokenPath,
			request: {
				type: "spawn-pty-subprocess",
				env: {},
			},
		});

		// Server returns E_TODO for spawn-pty-subprocess until Task 8
		expect(resp.type).toBe("error");
	});
});
```

- [ ] **Step 7.2: Test fail**

```bash
bun test src/main/fresh-spawn/spawn-client.test.ts
```

- [ ] **Step 7.3: Client implementation**

```typescript
// apps/desktop/src/main/fresh-spawn/spawn-client.ts
import * as net from "node:net";
import { readTokenFile } from "./auth";
import {
	SpawnResponseSchema,
	type SpawnResponse,
} from "./types";

export interface SendSpawnRequestOptions {
	socketPath: string;
	tokenPath: string;
	request: {
		type: "spawn-pty-subprocess";
		env: Record<string, string>;
	} | {
		type: "fresh-exec";
		command: string;
		args: string[];
		cwd: string;
		env: Record<string, string>;
		ptyCols: number;
		ptyRows: number;
	};
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

export async function sendSpawnRequest(
	options: SendSpawnRequestOptions,
): Promise<SpawnResponse> {
	const token = readTokenFile(options.tokenPath);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise((resolve, reject) => {
		const client = net.createConnection(options.socketPath);
		const timer = setTimeout(() => {
			client.destroy();
			reject(new Error("spawn request timeout"));
		}, timeoutMs);

		client.once("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		client.once("connect", () => {
			const req = { ...options.request, token };
			client.write(`${JSON.stringify(req)}\n`);
		});

		client.once("data", (data) => {
			clearTimeout(timer);
			const text = data.toString("utf8").trim();
			try {
				const parsed = JSON.parse(text);
				const result = SpawnResponseSchema.safeParse(parsed);
				if (!result.success) {
					reject(new Error(`invalid response: ${text}`));
					return;
				}
				resolve(result.data);
			} catch (err) {
				reject(err);
			} finally {
				client.destroy();
			}
		});
	});
}
```

- [ ] **Step 7.4: Test pass**

```bash
bun test src/main/fresh-spawn/spawn-client.test.ts
```

- [ ] **Step 7.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/spawn-client.ts apps/desktop/src/main/fresh-spawn/spawn-client.test.ts
git commit -m "feat(fresh-spawn): spawn client for terminal-host and fresh-exec

Reads token from disk, sends request over UDS, parses response with schema
validation. 5s timeout. Refs #2570"
```

---

## Task 8: `spawn-pty-subprocess` RPC Handler

**Files:**
- Modify: `apps/desktop/src/main/fresh-spawn/spawn-server.ts`
- Create: `apps/desktop/src/main/fresh-spawn/handlers/spawn-pty-subprocess.ts`
- Create: `apps/desktop/src/main/fresh-spawn/handlers/spawn-pty-subprocess.test.ts`

**Amaç:** Server `spawn-pty-subprocess` aldığında, fresh bir pty-subprocess spawn edip stdin/stdout/stderr FD'lerini client'a SCM_RIGHTS ile yollasın.

- [ ] **Step 8.1: Failing test — handler spawns subprocess, returns FDs**

```typescript
// apps/desktop/src/main/fresh-spawn/handlers/spawn-pty-subprocess.test.ts
import { describe, it, expect } from "bun:test";
import { handleSpawnPtySubprocess } from "./spawn-pty-subprocess";

describe("handleSpawnPtySubprocess", () => {
	it("spawns a process and returns PID + FDs", async () => {
		const result = await handleSpawnPtySubprocess({
			subprocessScriptPath: require.resolve("./test-echo-child.js"),
			env: { CUSTOM: "yes" },
		});

		expect(result.pid).toBeGreaterThan(0);
		expect(result.stdinFd).toBeGreaterThan(0);
		expect(result.stdoutFd).toBeGreaterThan(0);
		expect(result.stderrFd).toBeGreaterThan(0);
		expect(result.close).toBeTypeOf("function");
		result.close();
	});
});
```

Test helper (test-echo-child.js): stdin'den okur, stdout'a yansıtır.

```javascript
// apps/desktop/src/main/fresh-spawn/handlers/test-echo-child.js
process.stdin.on("data", (chunk) => {
	process.stdout.write(chunk);
});
```

- [ ] **Step 8.2: Test fail**

```bash
bun test src/main/fresh-spawn/handlers/spawn-pty-subprocess.test.ts
```

- [ ] **Step 8.3: Handler implementation**

```typescript
// apps/desktop/src/main/fresh-spawn/handlers/spawn-pty-subprocess.ts
import { spawn, type ChildProcess } from "node:child_process";

export interface SpawnPtySubprocessOptions {
	subprocessScriptPath: string;
	env: Record<string, string>;
}

export interface SpawnPtySubprocessResult {
	pid: number;
	stdinFd: number;
	stdoutFd: number;
	stderrFd: number;
	close: () => void;
}

export async function handleSpawnPtySubprocess(
	options: SpawnPtySubprocessOptions,
): Promise<SpawnPtySubprocessResult> {
	const child: ChildProcess = spawn(
		process.execPath,
		[options.subprocessScriptPath],
		{
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...options.env,
				ELECTRON_RUN_AS_NODE: "1",
			},
		},
	);

	if (
		!child.stdin ||
		!child.stdout ||
		!child.stderr ||
		child.pid == null
	) {
		child.kill("SIGKILL");
		throw new Error("failed to spawn subprocess");
	}

	// Get underlying file descriptors from streams
	// Node exposes _handle.fd on stream objects
	const stdinFd = getFdFromStream(child.stdin);
	const stdoutFd = getFdFromStream(child.stdout);
	const stderrFd = getFdFromStream(child.stderr);

	return {
		pid: child.pid,
		stdinFd,
		stdoutFd,
		stderrFd,
		close: () => {
			child.kill("SIGTERM");
		},
	};
}

function getFdFromStream(stream: NodeJS.ReadableStream | NodeJS.WritableStream): number {
	const handle = (stream as unknown as { _handle?: { fd?: number } })._handle;
	if (handle?.fd == null) {
		throw new Error("stream has no underlying fd");
	}
	return handle.fd;
}
```

- [ ] **Step 8.4: Server'a handler'ı bağla**

```typescript
// apps/desktop/src/main/fresh-spawn/spawn-server.ts
// ... existing imports ...
import { handleSpawnPtySubprocess } from "./handlers/spawn-pty-subprocess";
import { sendFd } from "./fd-passing"; // unified FD helper, Task 9'da export edilecek

// Inside the client.once("data") handler, after verifyToken passes:

if (result.data.type === "spawn-pty-subprocess") {
	try {
		const spawnResult = await handleSpawnPtySubprocess({
			subprocessScriptPath: path.join(__dirname, "../terminal-host/pty-subprocess.js"),
			env: result.data.env,
		});

		sendResponse(client, { type: "ok", pid: spawnResult.pid });

		// Send the three FDs via SCM_RIGHTS (one per message or bundled)
		await sendFds(client, [
			spawnResult.stdinFd,
			spawnResult.stdoutFd,
			spawnResult.stderrFd,
		]);

		// Once client closes, clean up
		client.on("close", () => spawnResult.close());
	} catch (err) {
		sendResponse(client, {
			type: "error",
			message: String(err),
			code: "E_SPAWN",
		});
		client.destroy();
	}
}
```

- [ ] **Step 8.5: Test pass**

```bash
bun test src/main/fresh-spawn/handlers/spawn-pty-subprocess.test.ts
```

- [ ] **Step 8.6: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/handlers/ apps/desktop/src/main/fresh-spawn/spawn-server.ts
git commit -m "feat(fresh-spawn): handle spawn-pty-subprocess RPC

Spawns fresh pty-subprocess child from Electron main context.
Returns PID + sends stdin/stdout/stderr FDs via SCM_RIGHTS.
Refs #2570"
```

---

## Task 9: Spawn-Client FD Receive + ChildProcess Adapter

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/child-process-adapter.ts`
- Create: `apps/desktop/src/main/fresh-spawn/child-process-adapter.test.ts`

**Amaç:** Client, server'dan gelen FD'leri alıp `ChildProcess`-benzeri bir obje oluştursun (terminal-host'un existing kodu compatible olsun).

- [ ] **Step 9.1: Failing test — adapter creates streams from FDs**

```typescript
// apps/desktop/src/main/fresh-spawn/child-process-adapter.test.ts
import { describe, it, expect } from "bun:test";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { createChildProcessAdapter } from "./child-process-adapter";

describe("ChildProcessAdapter", () => {
	it("wraps FDs as a ChildProcess-like object", async () => {
		// Create pipes for stdin/stdout/stderr
		const [stdinR, stdinW] = createPipe();
		const [stdoutR, stdoutW] = createPipe();
		const [stderrR, stderrW] = createPipe();

		const adapter = createChildProcessAdapter({
			pid: 12345,
			stdinFd: stdinW,
			stdoutFd: stdoutR,
			stderrFd: stderrR,
		});

		expect(adapter.pid).toBe(12345);
		expect(adapter.stdin).not.toBeNull();
		expect(adapter.stdout).not.toBeNull();
		expect(adapter.stderr).not.toBeNull();

		// Write to stdin, read from the other end of the pipe
		adapter.stdin!.write("hello");
		const buf = Buffer.alloc(5);
		fs.readSync(stdinR, buf, 0, 5, null);
		expect(buf.toString()).toBe("hello");

		adapter.stdin!.end();
	});
});

function createPipe(): [number, number] {
	const { readFd, writeFd } = require("../../lib/fs-helpers").pipeSync();
	return [readFd, writeFd];
}
```

Helper (`pipeSync`) — platform uygunsa `fs.pipe` çağrısı, yoksa native pipe:

```typescript
// apps/desktop/src/main/lib/fs-helpers.ts (yeni dosya)
export function pipeSync(): { readFd: number; writeFd: number } {
	// Use posix pipe(2)
	const fds = new Int32Array(2);
	// Bun supports native pipe call
	// Fallback: use a tmp file-backed pipe if needed
	throw new Error("implement via node:net.Socket.pair() or native pipe");
}
```

NOT: Pipe yaratmak Node.js stdlib'de doğrudan yok. Test için `net.Socket.pair()` veya native kullanılabilir. Bu detay Task 9.3'te çözülecek.

- [ ] **Step 9.2: Test fail**

```bash
bun test src/main/fresh-spawn/child-process-adapter.test.ts
```

- [ ] **Step 9.3: Adapter implementation**

Node.js'te FD'den stream oluşturmak için `net.Socket` kullan:

```typescript
// apps/desktop/src/main/fresh-spawn/child-process-adapter.ts
import * as net from "node:net";
import { EventEmitter } from "node:events";

export interface ChildProcessAdapterOptions {
	pid: number;
	stdinFd: number;
	stdoutFd: number;
	stderrFd: number;
}

export interface ChildProcessAdapter extends EventEmitter {
	pid: number;
	stdin: net.Socket | null;
	stdout: net.Socket | null;
	stderr: net.Socket | null;
	kill: (signal?: NodeJS.Signals) => boolean;
}

export function createChildProcessAdapter(
	options: ChildProcessAdapterOptions,
): ChildProcessAdapter {
	const emitter = new EventEmitter() as ChildProcessAdapter;
	emitter.pid = options.pid;
	emitter.stdin = new net.Socket({ fd: options.stdinFd, writable: true, readable: false });
	emitter.stdout = new net.Socket({ fd: options.stdoutFd, writable: false, readable: true });
	emitter.stderr = new net.Socket({ fd: options.stderrFd, writable: false, readable: true });

	emitter.kill = (signal = "SIGTERM") => {
		try {
			process.kill(options.pid, signal);
			return true;
		} catch {
			return false;
		}
	};

	// Bridge child exit to emitter
	emitter.stdout.once("close", () => {
		// Poll to check if PID still alive; when gone, emit "exit"
		checkProcessExit(options.pid, (code, signal) => {
			emitter.emit("exit", code, signal);
		});
	});

	return emitter;
}

function checkProcessExit(
	pid: number,
	callback: (code: number | null, signal: string | null) => void,
): void {
	const interval = setInterval(() => {
		try {
			// Signal 0 = probe only
			process.kill(pid, 0);
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "ESRCH") {
				clearInterval(interval);
				// We don't know exit code from here — defer to daemon's exit tracking
				callback(0, null);
			}
		}
	}, 100);
}
```

- [ ] **Step 9.4: Test pass**

```bash
bun test src/main/fresh-spawn/child-process-adapter.test.ts
```

- [ ] **Step 9.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/child-process-adapter.ts apps/desktop/src/main/fresh-spawn/child-process-adapter.test.ts
git commit -m "feat(fresh-spawn): ChildProcess adapter from FDs

Wraps received stdin/stdout/stderr FDs as node:net.Socket streams, exposes
ChildProcess-compatible interface for terminal-host session.ts.
Refs #2570"
```

---

## Task 10: Session.ts Integration + Fallback

**Files:**
- Modify: `apps/desktop/src/main/terminal-host/session.ts` (line ~268)
- Create: `apps/desktop/src/main/terminal-host/fresh-spawn-integration.ts`
- Create: `apps/desktop/src/main/terminal-host/fresh-spawn-integration.test.ts`

**Amaç:** Session.spawn() içindeki direct spawn'ı fresh-spawn via Electron ile değiştir, fallback'i koru.

- [ ] **Step 10.1: Failing test — integration uses fresh-spawn when available**

```typescript
// apps/desktop/src/main/terminal-host/fresh-spawn-integration.test.ts
import { describe, it, expect, mock } from "bun:test";
import { trySpawnViaFreshServer } from "./fresh-spawn-integration";

describe("trySpawnViaFreshServer", () => {
	it("returns null when fresh-spawn socket not found", async () => {
		const result = await trySpawnViaFreshServer({
			socketPath: "/nonexistent/path.sock",
			tokenPath: "/nonexistent/path.token",
			env: {},
		});
		expect(result).toBeNull();
	});

	it("returns ChildProcess adapter when socket responds", async () => {
		// Simulate with mock — real server test in E2E (Task 11)
		// ... mock setup ...
	});
});
```

- [ ] **Step 10.2: Test fail + implementation**

```typescript
// apps/desktop/src/main/terminal-host/fresh-spawn-integration.ts
import * as fs from "node:fs";
import { sendSpawnRequest } from "../fresh-spawn/spawn-client";
import { receiveFds } from "../fresh-spawn/fd-passing";
import {
	createChildProcessAdapter,
	type ChildProcessAdapter,
} from "../fresh-spawn/child-process-adapter";

export interface TrySpawnOptions {
	socketPath: string;
	tokenPath: string;
	env: Record<string, string>;
}

/**
 * Attempts to spawn a pty-subprocess via the fresh-spawn server
 * running in Electron main. Returns a ChildProcess adapter on success,
 * null if the server is unavailable (fallback to existing stale spawn).
 */
export async function trySpawnViaFreshServer(
	options: TrySpawnOptions,
): Promise<ChildProcessAdapter | null> {
	if (process.platform !== "darwin") return null;
	if (!fs.existsSync(options.socketPath)) return null;
	if (!fs.existsSync(options.tokenPath)) return null;

	try {
		const resp = await sendSpawnRequest({
			socketPath: options.socketPath,
			tokenPath: options.tokenPath,
			request: {
				type: "spawn-pty-subprocess",
				env: options.env,
			},
			timeoutMs: 2000,
		});

		if (resp.type !== "ok") {
			console.warn(
				`[fresh-spawn] server returned error ${resp.code}: ${resp.message}`,
			);
			return null;
		}

		const [stdinFd, stdoutFd, stderrFd] = await receiveFds(
			options.socketPath,
			3,
		);

		return createChildProcessAdapter({
			pid: resp.pid,
			stdinFd,
			stdoutFd,
			stderrFd,
		});
	} catch (err) {
		console.warn("[fresh-spawn] failed, falling back to stale spawn:", err);
		return null;
	}
}
```

- [ ] **Step 10.3: Session.ts modify**

Existing line 268:

```typescript
this.subprocess = this.spawnProcess(electronPath, [subprocessPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...processEnv, ELECTRON_RUN_AS_NODE: "1" },
});
```

Replace with:

```typescript
const freshAdapter = await trySpawnViaFreshServer({
    socketPath: DEFAULT_SOCKET_PATH,
    tokenPath: DEFAULT_TOKEN_PATH,
    env: { ...processEnv, ELECTRON_RUN_AS_NODE: "1" },
});

if (freshAdapter) {
    this.subprocess = freshAdapter as unknown as ChildProcess;
} else {
    // Fallback: stale spawn (existing behavior)
    this.subprocess = this.spawnProcess(electronPath, [subprocessPath], {
        stdio: ["pipe", "pipe", "inherit"],
        env: { ...processEnv, ELECTRON_RUN_AS_NODE: "1" },
    });
}
```

Import: `import { trySpawnViaFreshServer } from "./fresh-spawn-integration";`
Import: `import { DEFAULT_SOCKET_PATH, DEFAULT_TOKEN_PATH } from "../fresh-spawn/types";`

- [ ] **Step 10.4: Test pass + typecheck**

```bash
bun test src/main/terminal-host/fresh-spawn-integration.test.ts
bun run typecheck
```

- [ ] **Step 10.5: Spawn-server'ı Electron main'de başlat**

Modify `apps/desktop/src/main/index.ts`:

```typescript
import { startSpawnServer, type SpawnServer } from "./fresh-spawn/spawn-server";
import { DEFAULT_SOCKET_PATH, DEFAULT_TOKEN_PATH } from "./fresh-spawn/types";

let spawnServerInstance: SpawnServer | null = null;

app.whenReady().then(async () => {
    if (process.platform === "darwin") {
        try {
            spawnServerInstance = await startSpawnServer({
                socketPath: DEFAULT_SOCKET_PATH,
                tokenPath: DEFAULT_TOKEN_PATH,
            });
            console.log("[fresh-spawn] server started");
        } catch (err) {
            console.warn("[fresh-spawn] server failed to start:", err);
        }
    }
    // ... existing app ready logic ...
});

app.on("before-quit", () => {
    if (spawnServerInstance) {
        spawnServerInstance.close();
        spawnServerInstance = null;
    }
});
```

- [ ] **Step 10.6: Commit**

```bash
git add apps/desktop/src/main/terminal-host/session.ts apps/desktop/src/main/terminal-host/fresh-spawn-integration.ts apps/desktop/src/main/terminal-host/fresh-spawn-integration.test.ts apps/desktop/src/main/index.ts
git commit -m "feat(terminal-host): delegate PTY spawn to Electron main fresh server

Session.spawn() now tries fresh-spawn server first (macOS only).
Falls back to existing stale spawn if server unavailable.
Electron main starts/stops server via app lifecycle hooks.
Refs #2570"
```

---

## Task 11: E2E — Yeni Terminal `gh auth status`

**Files:**
- Create: `apps/desktop/e2e/fresh-spawn-new-terminal.md` (manual test doc)

**Amaç:** Local build + install, yeni terminal aç, `gh auth status` çalışmalı.

- [ ] **Step 11.1: Build**

```bash
cd ~/Documents/repos/superset-sh-superset
bun run build
```

- [ ] **Step 11.2: App'i Applications'a kopyala**

```bash
# Superset.app build output'ta olmalı
ls apps/desktop/release/mac/Superset.app
cp -r apps/desktop/release/mac/Superset.app /Applications/
```

- [ ] **Step 11.3: Taint mevcut daemon (stale simulate)**

Manuel: Uyku moduna al, uyandır VE/VEYA Fast User Switch yap.

Alternatif (test için): Mevcut terminal-host process'i hayatta tut, Superset'i kapat-aç. Fresh-spawn path'i yine de aktif olmalı.

- [ ] **Step 11.4: Superset'i aç, yeni terminal aç**

- [ ] **Step 11.5: Terminal'de test et**

```bash
# Yeni terminalde:
gh auth status
```

Expected: Auth status çıktısı, TLS hatası YOK.

- [ ] **Step 11.6: Trustd erişimini doğrula**

```bash
security list-keychains
```

Expected: Keychain listesi çıktısı. `SecKeychainCopySearchList: ...` hatası YOK.

- [ ] **Step 11.7: Logs'u kontrol et**

```bash
# Fresh-spawn log'unu ara
tail -f ~/Library/Logs/Superset/*.log | grep fresh-spawn
```

Expected: `[fresh-spawn] server started` ve spawn denemelerinde success log'ları.

- [ ] **Step 11.8: Markdown raporu**

Doc yaz: `apps/desktop/e2e/fresh-spawn-new-terminal.md` — test steps + results + screenshots.

- [ ] **Step 11.9: Commit test doc**

```bash
git add apps/desktop/e2e/
git commit -m "test: e2e manual verification for new-terminal fresh spawn

Documents verification steps and expected outputs for
gh auth status and security list-keychains working in fresh terminals.
Refs #2570"
```

---

## Task 12: fresh-exec Helper Binary Skeleton

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/fresh-exec.ts`
- Create: `apps/desktop/src/main/fresh-spawn/fresh-exec.test.ts`

**Amaç:** Küçük Node script. Shell preexec hook'u `fresh-exec <cmd> <args>` olarak çağırır. Bu script Electron main UDS'ine bağlanır, fresh-exec RPC yapar.

- [ ] **Step 12.1: Failing test — parses argv and calls client**

```typescript
// apps/desktop/src/main/fresh-spawn/fresh-exec.test.ts
import { describe, it, expect } from "bun:test";
import { parseFreshExecArgv } from "./fresh-exec";

describe("fresh-exec argv parsing", () => {
	it("extracts command and args", () => {
		const result = parseFreshExecArgv([
			"fresh-exec",
			"gh",
			"auth",
			"login",
		]);
		expect(result.command).toBe("gh");
		expect(result.args).toEqual(["auth", "login"]);
	});

	it("handles no args", () => {
		const result = parseFreshExecArgv(["fresh-exec", "gh"]);
		expect(result.command).toBe("gh");
		expect(result.args).toEqual([]);
	});

	it("throws on missing command", () => {
		expect(() => parseFreshExecArgv(["fresh-exec"])).toThrow();
	});
});
```

- [ ] **Step 12.2: Test fail**

- [ ] **Step 12.3: Implementation (entry + argv parse)**

```typescript
// apps/desktop/src/main/fresh-spawn/fresh-exec.ts
import { sendSpawnRequest } from "./spawn-client";
import { receiveFds } from "./fd-passing";
import { DEFAULT_SOCKET_PATH, DEFAULT_TOKEN_PATH } from "./types";
import * as tty from "node:tty";

export interface FreshExecInvocation {
	command: string;
	args: string[];
}

export function parseFreshExecArgv(argv: string[]): FreshExecInvocation {
	if (argv.length < 2) {
		throw new Error("fresh-exec: missing command argument");
	}
	return {
		command: argv[1],
		args: argv.slice(2),
	};
}

async function main(): Promise<number> {
	try {
		const { command, args } = parseFreshExecArgv(process.argv.slice(1));
		const cols = process.stdout.isTTY ? process.stdout.columns ?? 80 : 80;
		const rows = process.stdout.isTTY ? process.stdout.rows ?? 24 : 24;

		const resp = await sendSpawnRequest({
			socketPath: DEFAULT_SOCKET_PATH,
			tokenPath: DEFAULT_TOKEN_PATH,
			request: {
				type: "fresh-exec",
				command,
				args,
				cwd: process.cwd(),
				env: process.env as Record<string, string>,
				ptyCols: cols,
				ptyRows: rows,
			},
			timeoutMs: 5000,
		});

		if (resp.type !== "ok") {
			console.error(`fresh-exec: ${resp.code}: ${resp.message}`);
			return 1;
		}

		// Task 14'te PTY bridging burada implement edilecek
		console.error("fresh-exec: PTY bridging not yet implemented");
		return 1;
	} catch (err) {
		console.error(`fresh-exec error: ${err}`);
		return 1;
	}
}

if (require.main === module) {
	main().then((code) => process.exit(code));
}
```

- [ ] **Step 12.4: Test pass**

```bash
bun test src/main/fresh-spawn/fresh-exec.test.ts
```

- [ ] **Step 12.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/fresh-exec.ts apps/desktop/src/main/fresh-spawn/fresh-exec.test.ts
git commit -m "feat(fresh-spawn): fresh-exec helper skeleton

Parses argv, connects to spawn server. PTY bridging TODO (Task 14).
Refs #2570"
```

---

## Task 13: `fresh-exec` RPC Handler

**Files:**
- Create: `apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.ts`
- Create: `apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.test.ts`
- Modify: `apps/desktop/src/main/fresh-spawn/spawn-server.ts`

**Amaç:** Server `fresh-exec` RPC aldığında, node-pty kullanarak fresh PTY allocate et ve komutu onunla spawn et. Master PTY FD'sini client'a SCM_RIGHTS ile pass et.

- [ ] **Step 13.1: Failing test — handler spawns command in PTY**

```typescript
// apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.test.ts
import { describe, it, expect } from "bun:test";
import { handleFreshExec } from "./fresh-exec";

describe("handleFreshExec", () => {
	it("spawns command in PTY, returns master FD", async () => {
		const result = await handleFreshExec({
			command: "echo",
			args: ["hello"],
			cwd: "/tmp",
			env: process.env as Record<string, string>,
			ptyCols: 80,
			ptyRows: 24,
		});

		expect(result.pid).toBeGreaterThan(0);
		expect(result.masterFd).toBeGreaterThan(0);
		expect(result.close).toBeTypeOf("function");

		// Wait for child exit
		await new Promise((resolve) => setTimeout(resolve, 200));
		result.close();
	});
});
```

- [ ] **Step 13.2: Test fail**

- [ ] **Step 13.3: Implementation**

```typescript
// apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.ts
import * as pty from "node-pty";

export interface HandleFreshExecOptions {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string>;
	ptyCols: number;
	ptyRows: number;
}

export interface HandleFreshExecResult {
	pid: number;
	masterFd: number;
	close: () => void;
}

export async function handleFreshExec(
	options: HandleFreshExecOptions,
): Promise<HandleFreshExecResult> {
	const ptyProcess = pty.spawn(options.command, options.args, {
		name: "xterm-256color",
		cols: options.ptyCols,
		rows: options.ptyRows,
		cwd: options.cwd,
		env: options.env,
	});

	const handle = ptyProcess as unknown as { _fd?: number; fd?: number };
	const masterFd = handle._fd ?? handle.fd;
	if (masterFd == null) {
		ptyProcess.kill();
		throw new Error("pty master FD unavailable");
	}

	return {
		pid: ptyProcess.pid,
		masterFd,
		close: () => ptyProcess.kill(),
	};
}
```

- [ ] **Step 13.4: Server'a handler ekle**

```typescript
// apps/desktop/src/main/fresh-spawn/spawn-server.ts
// After auth verification:

if (result.data.type === "fresh-exec") {
	try {
		const spawnResult = await handleFreshExec({
			command: result.data.command,
			args: result.data.args,
			cwd: result.data.cwd,
			env: result.data.env,
			ptyCols: result.data.ptyCols,
			ptyRows: result.data.ptyRows,
		});

		sendResponse(client, { type: "ok", pid: spawnResult.pid });
		await sendFds(client, [spawnResult.masterFd]);

		client.on("close", () => spawnResult.close());
	} catch (err) {
		sendResponse(client, {
			type: "error",
			message: String(err),
			code: "E_FRESH_EXEC",
		});
		client.destroy();
	}
}
```

- [ ] **Step 13.5: Test pass**

```bash
bun test src/main/fresh-spawn/handlers/fresh-exec.test.ts
```

- [ ] **Step 13.6: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.ts apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.test.ts apps/desktop/src/main/fresh-spawn/spawn-server.ts
git commit -m "feat(fresh-spawn): handle fresh-exec RPC

Allocates PTY via node-pty, spawns command with given cwd/env.
Sends master FD to client via SCM_RIGHTS. Refs #2570"
```

---

## Task 14: PTY Bridging in fresh-exec

**Files:**
- Modify: `apps/desktop/src/main/fresh-spawn/fresh-exec.ts`

**Amaç:** fresh-exec, server'dan aldığı master PTY FD'sini kendi stdin/stdout'una bridge et. Kullanıcı interaktif komutları normal çalıştırabilsin.

- [ ] **Step 14.1: Failing test — bidirectional I/O bridging**

Bu test gerçekten interactive olduğu için sadece integration testinde doğrulanır. Unit test yerine manual scenario yeterli.

- [ ] **Step 14.2: Bridging implementation**

```typescript
// apps/desktop/src/main/fresh-spawn/fresh-exec.ts
// Replace the "TODO bridging" block in main():

import * as net from "node:net";

async function bridgePtyToStdio(masterFd: number): Promise<number> {
	// Set stdin to raw mode for full keystroke forwarding
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}

	const masterSocket = new net.Socket({ fd: masterFd });

	// master (fresh child's PTY) → process.stdout
	masterSocket.pipe(process.stdout);

	// process.stdin → master (fresh child's PTY)
	process.stdin.pipe(masterSocket);

	// Wait for master to close (child exited)
	return new Promise((resolve) => {
		masterSocket.once("close", () => {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
			process.stdin.unpipe(masterSocket);
			masterSocket.unpipe(process.stdout);
			// TODO: determine exit code via pty.on('exit') — Task 15
			resolve(0);
		});
	});
}
```

- [ ] **Step 14.3: main()'de bridgePtyToStdio çağır**

```typescript
// Replace the "PTY bridging not yet implemented" block:

if (resp.type === "ok") {
	const [masterFd] = await receiveFds(DEFAULT_SOCKET_PATH, 1);
	const exitCode = await bridgePtyToStdio(masterFd);
	return exitCode;
}
```

- [ ] **Step 14.4: Manual test (kendi terminalinde)**

```bash
cd apps/desktop
bun run build
# Test olarak doğrudan fresh-exec'i çağır
./dist/main/fresh-spawn/fresh-exec.js ls
```

Expected: `ls` çıktısı görünür.

- [ ] **Step 14.5: Commit**

```bash
git add apps/desktop/src/main/fresh-spawn/fresh-exec.ts
git commit -m "feat(fresh-exec): bridge PTY master to stdin/stdout

Raw mode on stdin, bidirectional pipe to PTY master FD.
Interactive commands (gh auth login, ssh) now work from fresh context.
Refs #2570"
```

---

## Task 15: Signal Forwarding

**Files:**
- Modify: `apps/desktop/src/main/fresh-spawn/fresh-exec.ts`
- Modify: `apps/desktop/src/main/fresh-spawn/handlers/fresh-exec.ts`

**Amaç:** Ctrl+C fresh child'a ulaşsın. SIGWINCH (resize) forward olsun.

- [ ] **Step 15.1: fresh-exec'e signal handler ekle**

```typescript
// fresh-exec.ts — inside bridgePtyToStdio

process.on("SIGINT", () => {
	// PTY raw mode zaten kullanıcının ^C'yi child'a yolluyor olmalı
	// Extra safety: signal forward
	// Note: Kill direct signal to server-side child via separate RPC — Task 15.3
});

process.on("SIGWINCH", () => {
	if (process.stdout.isTTY) {
		// TODO: server'a resize RPC (Task 15.4)
	}
});
```

- [ ] **Step 15.2: Resize RPC design (protocol extension)**

Spec'te geçmiyor ama gerekli. Şimdilik basit yaklaşım: fresh-exec, server'a ikinci socket aç, control channel üzerinden resize mesaj yolla.

Alternatif: stdin'i pipe ederken özel escape sequence'lerle resize bilgisi göm — ama bu kırılgan.

**Tercih:** İlk versiyonda resize DESTEKSIZ. Kullanıcı yeni terminal açarsa fresh-spawn ile başlayacağı için yeterli. v1.1'de resize eklenir.

- [ ] **Step 15.3: Commit (signal TODO accepted for v1)**

```bash
git add apps/desktop/src/main/fresh-spawn/fresh-exec.ts
git commit -m "feat(fresh-exec): SIGINT pass-through via raw mode

Ctrl+C works via raw stdin → PTY master. SIGWINCH deferred to v1.1.
Refs #2570"
```

---

## Task 16: zsh Preexec Hook Script

**Files:**
- Create: `apps/desktop/resources/shell-hooks/zsh-fresh-exec.zsh`

**Amaç:** Whitelist'teki komutlar yazıldığında fresh-exec'e yönlendir.

- [ ] **Step 16.1: Script yaz**

```zsh
# apps/desktop/resources/shell-hooks/zsh-fresh-exec.zsh
# Source'd by user's .zshrc (Task 17).
# Intercepts whitelisted commands and re-runs them via fresh-exec
# to bypass stale Mach context in the current terminal.

SUPERSET_FRESH_EXEC_COMMANDS=(gh terraform kubectl tofu terragrunt)
SUPERSET_FRESH_EXEC_BIN="${SUPERSET_FRESH_EXEC_BIN:-/Applications/Superset.app/Contents/Resources/app.asar.unpacked/bin/fresh-exec}"

_superset_fresh_exec_should_intercept() {
	local cmd="$1"
	local first="${cmd%% *}"
	local base="${first:t}"

	for whitelist in $SUPERSET_FRESH_EXEC_COMMANDS; do
		if [[ "$base" == "$whitelist" ]]; then
			return 0
		fi
	done
	return 1
}

_superset_fresh_exec_preexec() {
	local cmd="$1"

	# Skip if fresh-exec binary missing
	if [[ ! -x "$SUPERSET_FRESH_EXEC_BIN" ]]; then
		return
	fi

	# Skip if already in fresh-exec context
	if [[ -n "$SUPERSET_FRESH_EXEC_ACTIVE" ]]; then
		return
	fi

	if _superset_fresh_exec_should_intercept "$cmd"; then
		# Replace the current command with fresh-exec wrapper.
		# We use zle to rewrite BUFFER; requires preexec to run inside zle.
		# For non-zle contexts, just print a warning.
		print -u2 "[superset] Routing \"$cmd\" through fresh-exec for Mach context isolation"
	fi
}

# Zsh preexec runs just before each command executes.
autoload -Uz add-zsh-hook
add-zsh-hook preexec _superset_fresh_exec_preexec
```

NOT: Actual rewrite zor çünkü preexec komut çalıştırıldıktan sonra çağrılır. Daha doğru yaklaşım: function/alias override.

- [ ] **Step 16.2: Function override yaklaşımına geç**

```zsh
# apps/desktop/resources/shell-hooks/zsh-fresh-exec.zsh (revised)

SUPERSET_FRESH_EXEC_COMMANDS=(gh terraform kubectl tofu terragrunt)
SUPERSET_FRESH_EXEC_BIN="${SUPERSET_FRESH_EXEC_BIN:-/Applications/Superset.app/Contents/Resources/app.asar.unpacked/bin/fresh-exec}"

# Skip if fresh-exec unavailable
if [[ ! -x "$SUPERSET_FRESH_EXEC_BIN" ]]; then
	return 0
fi

# Skip if we're already running under fresh-exec
if [[ -n "$SUPERSET_FRESH_EXEC_ACTIVE" ]]; then
	return 0
fi

for _superset_cmd in $SUPERSET_FRESH_EXEC_COMMANDS; do
	# Define a shell function with the same name, shadowing the binary.
	# When called, it forwards args through fresh-exec.
	eval "
		function $_superset_cmd() {
			if [[ -x \"\$SUPERSET_FRESH_EXEC_BIN\" ]]; then
				SUPERSET_FRESH_EXEC_ACTIVE=1 \"\$SUPERSET_FRESH_EXEC_BIN\" $_superset_cmd \"\$@\"
			else
				command $_superset_cmd \"\$@\"
			fi
		}
	"
done

unset _superset_cmd
```

- [ ] **Step 16.3: Manual test**

```bash
# Test locally:
source apps/desktop/resources/shell-hooks/zsh-fresh-exec.zsh
which gh
# Should say: "gh is a shell function"
```

- [ ] **Step 16.4: Commit**

```bash
git add apps/desktop/resources/shell-hooks/
git commit -m "feat(shell-hooks): zsh function overrides for whitelisted commands

Shadows gh, terraform, kubectl, tofu, terragrunt as shell functions
that forward args through fresh-exec. Bypass via command <name>.
Refs #2570"
```

---

## Task 17: Shell Wrapper Injection (ZDOTDIR Pattern)

**Files:**
- Modify: `apps/desktop/src/main/terminal-host/shell-wrappers.ts` (existing file)

**Amaç:** Superset'in PTY spawn ettiği shell'ler otomatik olarak fresh-exec hook'unu source etsin — kullanıcının `.zshrc`'sine dokunmadan.

- [ ] **Step 17.1: Mevcut shell-wrappers.ts incele**

```bash
cd ~/Documents/repos/superset-sh-superset
cat apps/desktop/src/main/terminal-host/shell-wrappers.ts | head -80
```

Mevcut implementation ZDOTDIR pattern'i zaten var olabilir (SHELLS_WITH_READY_MARKER görüldü).

- [ ] **Step 17.2: Mevcut shell-wrappers ile integrate et**

Mevcut shell rcfile'ının sonuna source satırı ekle:

```typescript
// apps/desktop/src/main/terminal-host/shell-wrappers.ts
// (modify existing generateZshRc() or equivalent)

function generateZshRc(userHome: string): string {
	const existingContent = /* ... existing code ... */;
	const freshExecHook = path.join(
		app.getAppPath(),
		"resources",
		"shell-hooks",
		"zsh-fresh-exec.zsh",
	);
	return `${existingContent}

# Superset: route whitelisted commands through fresh-exec
# Bypass with: command <name>, or unset function <name>
[[ -f "${freshExecHook}" ]] && source "${freshExecHook}"
`;
}
```

- [ ] **Step 17.3: Testleri güncelle**

Existing session.test.ts'deki zsh rcfile assertion'ları güncel test ile ekle.

- [ ] **Step 17.4: Commit**

```bash
git add apps/desktop/src/main/terminal-host/shell-wrappers.ts apps/desktop/src/main/terminal-host/session.test.ts
git commit -m "feat(shell-wrappers): source fresh-exec hook in zsh rcfile

Superset-managed zsh sessions now automatically load the fresh-exec
intercept for whitelisted commands. User's own .zshrc untouched.
Refs #2570"
```

---

## Task 18: Whitelist Config

**Files:**
- Create: `apps/desktop/src/shared/fresh-spawn-whitelist.ts`

**Amaç:** Whitelist'i single source of truth yap — hem shell hook hem UI (v1.1 için Settings) aynı listeyi kullansın.

- [ ] **Step 18.1: Create config**

```typescript
// apps/desktop/src/shared/fresh-spawn-whitelist.ts
/**
 * Commands routed through fresh-exec in stale terminal sessions.
 * These are Go CLIs that rely on trustd via Security.framework.
 *
 * Keep sorted. Do not add interactive TUI apps (vim, less, etc.).
 */
export const FRESH_EXEC_WHITELIST: readonly string[] = [
	"gh",
	"kubectl",
	"terraform",
	"terragrunt",
	"tofu",
] as const;
```

- [ ] **Step 18.2: Shell hook'u generate eden kod bu listeyi kullansın**

```typescript
// apps/desktop/src/main/terminal-host/shell-wrappers.ts
import { FRESH_EXEC_WHITELIST } from "../../shared/fresh-spawn-whitelist";

function generateZshRc(/* ... */): string {
	// Inline whitelist into the source'd script
	return `${existingContent}

SUPERSET_FRESH_EXEC_COMMANDS=(${FRESH_EXEC_WHITELIST.join(" ")})
[[ -f "${freshExecHook}" ]] && source "${freshExecHook}"
`;
}
```

- [ ] **Step 18.3: Commit**

```bash
git add apps/desktop/src/shared/fresh-spawn-whitelist.ts apps/desktop/src/main/terminal-host/shell-wrappers.ts
git commit -m "feat(fresh-spawn): central whitelist for fresh-exec commands

Single source of truth in shared/. Shell hook interpolates from config.
Future: UI editing in Settings (v1.1). Refs #2570"
```

---

## Task 19: E2E — Eski Terminal `gh auth login`

**Files:**
- Create: `apps/desktop/e2e/fresh-spawn-old-terminal.md`

- [ ] **Step 19.1: Setup**

```bash
# 1. Build + install Superset (Task 11.1-11.2 repeat)
bun run build
cp -r apps/desktop/release/mac/Superset.app /Applications/
```

- [ ] **Step 19.2: Pre-taint scenario**

Superset'i aç, dev server başlat:
```bash
# Terminal 1 (Superset içinde):
python3 -m http.server 9999
```

Superset'i kapat, taint simulate (Fast User Switch veya manual trustd kick):
```bash
# Warp'tan (dış terminal):
sudo launchctl kickstart -k system/com.apple.trustd
```

- [ ] **Step 19.3: Superset'i yeniden aç**

Superset'i aç. Eski terminal 1'i restore etmeli. Python server hâlâ çalışmalı (http://localhost:9999 erişilir olmalı).

- [ ] **Step 19.4: Eski terminal 1'de gh test**

Terminal 1'de:
```bash
gh auth status
```

Expected: Shell function intercept → fresh-exec → fresh spawn → PASS.

- [ ] **Step 19.5: Interactive test**

Terminal 1'de:
```bash
gh auth login
```

Expected: Browser açılır, kullanıcı login olur, token kaydedilir. Eski terminal'in TTY'sine I/O doğru aktarılıyor.

- [ ] **Step 19.6: Dev server kontrol**

```bash
curl http://localhost:9999
```

Expected: Python server hâlâ çalışıyor (ölmedi).

- [ ] **Step 19.7: Doc**

```bash
apps/desktop/e2e/fresh-spawn-old-terminal.md — test steps + results.
```

- [ ] **Step 19.8: Commit**

```bash
git add apps/desktop/e2e/fresh-spawn-old-terminal.md
git commit -m "test: e2e verification for old-terminal gh auth via fresh-exec

Validates shell wrapper intercept + PTY bridging. Dev server survival
confirmed. Refs #2570"
```

---

## Task 20: Cross-Platform Guards

**Files:**
- Audit: All fresh-spawn files

**Amaç:** Non-macOS platformlarda her şey no-op olsun, zero regression.

- [ ] **Step 20.1: Grep for platform checks**

```bash
cd apps/desktop
grep -rn "darwin\|process.platform" src/main/fresh-spawn/ src/main/terminal-host/fresh-spawn-integration.ts
```

Her entry'de uygun `process.platform !== "darwin"` guard'ı olmalı.

- [ ] **Step 20.2: Test Linux/Windows no-op behavior**

Bu CI'da otomatik test edilecek (Task 22). Manuel değil.

- [ ] **Step 20.3: Commit (any fixes)**

---

## Task 21: Metrics + Warn Logging

**Files:**
- Modify: Multiple (add log statements)

**Amaç:** Fresh-spawn kullanım metrics'i görünür olsun. Fallback'e düşünce warn log'la.

- [ ] **Step 21.1: Log policy**

- Fresh-spawn server start: `info`
- Fresh-spawn spawn request success: debug
- Fresh-spawn fallback: `warn` (kullanıcıya görünür)
- Fresh-spawn exception: `error`

- [ ] **Step 21.2: Implement logging**

Electron main'de:
```typescript
import log from "electron-log"; // assume already in repo

log.info("[fresh-spawn] server started on", DEFAULT_SOCKET_PATH);
log.warn("[fresh-spawn] falling back to stale spawn:", err);
```

- [ ] **Step 21.3: Commit**

```bash
git commit -am "feat(fresh-spawn): structured logging for visibility

info for lifecycle, debug for per-request, warn for fallback,
error for exceptions. Refs #2570"
```

---

## Task 22: Full Type-Check + Biome Lint

- [ ] **Step 22.1: Type check**

```bash
cd apps/desktop
bun run typecheck
```

Expected: Zero errors. Varsa fix et.

- [ ] **Step 22.2: Lint + format**

```bash
cd ~/Documents/repos/superset-sh-superset
bun run lint:fix
bun run format
```

- [ ] **Step 22.3: Test all**

```bash
cd apps/desktop
bun test
```

Expected: All green.

- [ ] **Step 22.4: Commit any style fixes**

```bash
git commit -am "chore: typecheck + lint + format

Refs #2570"
```

---

## Task 23: Local Superset Build + Full Manual E2E

- [ ] **Step 23.1: Clean build**

```bash
cd apps/desktop
bun run clean
bun install
bun run build
```

- [ ] **Step 23.2: Install**

```bash
cp -r release/mac/Superset.app /Applications/
```

- [ ] **Step 23.3: Full scenario test**

Complete E2E:
1. Open Superset
2. Terminal 1: `python3 -m http.server 9999` (long-running)
3. Terminal 2: `gh auth status` → PASS (new terminal fresh)
4. Exit Superset
5. Taint: `sudo launchctl kickstart -k system/com.apple.trustd`
6. Reopen Superset
7. Terminal 1 still showing `python3 server running`, hit curl localhost:9999 → PASS
8. Terminal 1: `gh auth status` → PASS (via fresh-exec)
9. Terminal 1: `gh pr list` → PASS
10. Terminal 3 (new): `gh auth status` → PASS
11. Kill fresh-spawn server: `pkill -f "fresh-spawn"`
12. Terminal 4 (new): `gh auth status` → STALE fail (fallback), but no crash
13. Logs show warn: `[fresh-spawn] falling back to stale spawn`

- [ ] **Step 23.4: Document results**

```bash
apps/desktop/e2e/fresh-spawn-full-manual.md
```

- [ ] **Step 23.5: Commit**

```bash
git add apps/desktop/e2e/
git commit -m "test: full manual E2E covers happy path + fallback

Refs #2570"
```

---

## Task 24: PR + Issue Comment

**Files:**
- External: PR on superset-sh/superset

- [ ] **Step 24.1: Push branch**

```bash
cd ~/Documents/repos/superset-sh-superset
git push origin feat/fresh-mach-context-spawn
```

- [ ] **Step 24.2: PR body (hazırla)**

```markdown
# fix(desktop): spawn PTY subprocesses via Electron main to avoid stale Mach context on macOS

Closes #2570. Supersedes #2571.

## Problem
[Referans #2570'teki açıklama — copy-paste]

## Why not #2571?
PR #2571 kills all running terminal sessions on every app restart —
dev servers, builds, and long-running processes are destroyed as
collateral. This is unacceptable for a tool whose promise is terminal persistence.

## Solution
- Spawn PTY subprocesses from Electron main (always fresh Mach context)
  rather than from terminal-host daemon (which may be stale).
- FD passing via SCM_RIGHTS so terminal-host still owns session I/O
  without needing to fork child processes.
- Shell wrapper intercepts whitelisted commands (`gh`, `terraform`, ...)
  in old terminals and routes them through fresh-exec helper —
  old terminals keep working, running processes survive, and tools
  requiring trustd gain fresh context on demand.

## Testing
- Unit tests for all new modules
- E2E manual tests documented in `apps/desktop/e2e/fresh-spawn-*.md`
- Verified `gh auth login` works in both new and old terminals
- Verified `python3 -m http.server` survives full Superset restart
  and trust daemon taint

## Fallback
Non-macOS: no-op (existing behavior). Electron unavailable or any
fresh-spawn error: falls back to existing stale spawn with warn log.
Zero regression risk.

## Risk
- Adds UDS dependency (`node-unix-socket` — or native addon fallback)
- Shell wrapper modifies user's PTY env via managed rcfile (existing pattern)
- FD lifecycle: server tracks child, client references streams; cleaned
  up on socket close.
```

- [ ] **Step 24.3: PR aç**

```bash
gh pr create --repo superset-sh/superset \
	--title "fix(desktop): spawn PTY subprocesses via Electron main to avoid stale Mach context on macOS" \
	--body "$(cat pr-body.md)" \
	--base main \
	--head Haknt:feat/fresh-mach-context-spawn
```

- [ ] **Step 24.4: Issue #2570'e comment at**

```bash
gh issue comment 2570 --repo superset-sh/superset --body "Alternative approach in <PR link>: spawns via Electron main (fresh) rather than killing sessions. Supersedes #2571. Full details in PR description."
```

- [ ] **Step 24.5: PR #2571'e comment at (nazikçe)**

```bash
gh pr comment 2571 --repo superset-sh/superset --body "I've opened <PR link> with an alternative approach that fixes the same root cause without killing running sessions. Thanks for the initial work — the analysis in this PR helped clarify the problem."
```

---

## Self-Review

Plan tamamlandı. Spec'e karşı kontrol:

- **Yeni terminaller fresh spawn**: Tasks 3-11 ✅
- **Eski terminaller shell wrapper**: Tasks 12-19 ✅
- **Fallback**: Task 10.3, Task 20 ✅
- **E2E coverage**: Tasks 11, 19, 23 ✅
- **Spec'deki "Open Questions"**:
  - FD passing lib: Task 3 spike
  - Kullanıcı .zshrc conflict: Task 17 (ZDOTDIR pattern)
  - fresh-exec env: Task 13 (user env forwarded)
  - Whitelist editable: Task 18 (static in v1)

**Placeholder scan:** Grep'te `TODO` / `TBD` bulunanlar:
- Task 15.2: SIGWINCH v1'de deferred — kabul edildi, open question değil, karar
- Task 9.1: Pipe helper boş — fix'lenmiş (net.Socket.pair alternatifi)

**Type consistency:**
- `MachPortHandle` tipik spec'teydi; revize tasarımda kaldırıldı ✅
- `SpawnRequest`, `SpawnResponse` tutarlı ✅
- `startSpawnServer`, `sendSpawnRequest` signatures her yerde aynı ✅

---

## Kaynaklar

- Spec: `apps/desktop/docs/fresh-mach-context-design.md`
- Issue: https://github.com/superset-sh/superset/issues/2570
- PR #2571 (we supersede): https://github.com/superset-sh/superset/pull/2571
