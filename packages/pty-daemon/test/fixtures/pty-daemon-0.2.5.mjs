#!/usr/bin/env node

// src/main.ts
import * as os2 from "node:os";
// package.json
var package_default = {
  name: "@superset/pty-daemon",
  version: "0.2.5",
  private: true,
  type: "module",
  exports: {
    ".": {
      types: "./src/index.ts",
      default: "./src/index.ts"
    },
    "./protocol": {
      types: "./src/protocol/index.ts",
      default: "./src/protocol/index.ts"
    },
    "./process-tree": {
      types: "./src/process-tree.ts",
      default: "./src/process-tree.ts"
    },
    "./package.json": "./package.json"
  },
  bin: {
    "pty-daemon": "./src/main.ts"
  },
  engines: {
    node: ">=20"
  },
  scripts: {
    clean: "git clean -xdf .cache .turbo dist node_modules",
    start: "node --experimental-strip-types src/main.ts",
    "build:daemon": "bun run build.ts",
    typecheck: "tsc --noEmit --emitDeclarationOnly false",
    test: "bun test src/protocol src/SessionStore src/handlers src/Pty/Pty.test.ts test/no-encoding-hops.test.ts",
    "test:integration": "node --experimental-strip-types --test test/integration.test.ts test/control-plane.test.ts test/signal-recovery.test.ts test/byte-fidelity.test.ts test/handoff.test.ts"
  },
  dependencies: {
    "node-pty": "1.1.0"
  },
  devDependencies: {
    "@superset/typescript": "workspace:*",
    "@types/node": "24.12.0",
    "bun-types": "1.3.11",
    typescript: "6.0.3"
  }
};

// src/Server/Server.ts
import * as childProcess2 from "node:child_process";
import * as fs3 from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

// src/Pty/Pty.ts
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as tty from "node:tty";
import * as nodePty from "node-pty";

// src/process-tree.ts
import { spawnSync } from "node:child_process";
function signalProcessTreeAndGroups(rootPid, signal, options = {}) {
  const targets = collectProcessSignalTargets(rootPid, options);
  signalProcessTargets(targets, signal, options.onSignalError);
  return targets;
}
function collectProcessSignalTargets(rootPid, options = {}) {
  if (!isPositiveInteger(rootPid))
    return [];
  const includeRoot = options.includeRoot ?? true;
  const signalGroups = options.signalGroups ?? true;
  const signalPids = options.signalPids ?? true;
  const excludeCurrentProcessGroup = options.excludeCurrentProcessGroup ?? true;
  const table = readProcessTable();
  const currentPgid = excludeCurrentProcessGroup ? getProcessGroupId(process.pid, table) : null;
  const rootPgid = getProcessGroupId(rootPid, table);
  const pids = collectProcessTree(rootPid, table);
  const infoByPid = new Map(table.map((row) => [row.pid, row]));
  const pgids = new Set;
  const targets = [];
  for (const pid of pids) {
    if (!includeRoot && pid === rootPid)
      continue;
    const info = infoByPid.get(pid);
    if (!info)
      continue;
    if (info.pgid <= 1)
      continue;
    if (currentPgid !== null && info.pgid === currentPgid)
      continue;
    if (!includeRoot && rootPgid !== null && info.pgid === rootPgid) {
      continue;
    }
    pgids.add(info.pgid);
  }
  if (signalGroups) {
    for (const pgid of pgids) {
      targets.push({ target: "pgid", id: pgid });
    }
  }
  if (signalPids) {
    for (const pid of pids) {
      if (!includeRoot && pid === rootPid)
        continue;
      targets.push({ target: "pid", id: pid });
    }
  }
  return targets;
}
function signalProcessTargets(targets, signal, onSignalError) {
  for (const { target, id } of targets) {
    signalTarget(target, id, signal, onSignalError);
  }
}
function readProcessTable() {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,pgid="], {
    encoding: "utf8"
  });
  if (result.error || result.status !== 0)
    return [];
  return result.stdout.split(`
`).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const [pidText, ppidText, pgidText] = line.split(/\s+/);
    if (pidText === undefined || ppidText === undefined || pgidText === undefined) {
      return [];
    }
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    const pgid = Number(pgidText);
    if (!isPositiveInteger(pid) || !Number.isInteger(ppid) || ppid < 0) {
      return [];
    }
    if (!isPositiveInteger(pgid))
      return [];
    return [{ pid, ppid, pgid }];
  });
}
function collectProcessTree(rootPid, table) {
  const pids = new Set([rootPid]);
  const childrenByParent = new Map;
  for (const row of table) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row);
    childrenByParent.set(row.ppid, children);
  }
  const queue = [rootPid];
  for (const pid of queue) {
    for (const child of childrenByParent.get(pid) ?? []) {
      if (pids.has(child.pid))
        continue;
      pids.add(child.pid);
      queue.push(child.pid);
    }
  }
  return pids;
}
function getProcessGroupId(pid, table) {
  return table.find((row) => row.pid === pid)?.pgid ?? null;
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function signalTarget(target, id, signal, onSignalError) {
  try {
    process.kill(target === "pgid" ? -id : id, signal);
  } catch (error) {
    onSignalError?.({ target, id, signal, error });
  }
}

// src/Pty/Pty.ts
var KILL_ESCALATION_TIMEOUT_MS = 1000;

class NodePtyAdapter {
  pid;
  meta;
  term;
  exited = false;
  killEscalationTimer = null;
  exitInfo = null;
  exitCallbacks = [];
  constructor(term, meta) {
    this.term = term;
    this.pid = term.pid;
    this.meta = meta;
    this.term.onExit(({ exitCode, signal }) => {
      if (this.exited)
        return;
      this.exited = true;
      this.exitInfo = { code: exitCode ?? null, signal: signal ?? null };
      for (const cb of this.exitCallbacks)
        cb(this.exitInfo);
    });
  }
  getMasterFd() {
    const fd = this.term._fd;
    if (typeof fd !== "number" || !Number.isInteger(fd) || fd < 0) {
      throw new Error(`node-pty master fd unavailable (got ${typeof fd}: ${fd}). ` + `Phase 2 fd-handoff depends on node-pty's private _fd property — ` + `pin node-pty to 1.1.x or update Pty.ts to match the new shape.`);
    }
    return fd;
  }
  write(data) {
    this.term.write(data);
  }
  resize(cols, rows) {
    validateDims(cols, rows);
    this.term.resize(cols, rows);
    this.meta = { ...this.meta, cols, rows };
  }
  kill(signal) {
    const killSignal = signal ?? "SIGHUP";
    const escalationTargets = signalProcessTreeAndGroups(this.pid, killSignal, {
      includeRoot: false,
      onSignalError: logProcessSignalError
    });
    this.term.kill(killSignal);
    this.scheduleKillEscalation(killSignal, escalationTargets);
  }
  onData(cb) {
    this.term.onData((d) => {
      cb(typeof d === "string" ? Buffer.from(d, "utf8") : d);
    });
  }
  onExit(cb) {
    if (this.exitInfo) {
      cb(this.exitInfo);
      return;
    }
    this.exitCallbacks.push(cb);
  }
  scheduleKillEscalation(signal, targets) {
    if (signal === "SIGKILL" || this.exited || this.killEscalationTimer)
      return;
    this.killEscalationTimer = setTimeout(() => {
      this.killEscalationTimer = null;
      signalProcessTargets(targets, "SIGKILL", logProcessSignalError);
      try {
        this.term.kill("SIGKILL");
      } catch {}
    }, KILL_ESCALATION_TIMEOUT_MS);
    this.killEscalationTimer.unref();
  }
}
function validateDims(cols, rows) {
  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`invalid cols: ${cols}`);
  }
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error(`invalid rows: ${rows}`);
  }
}
function reprobeErrno(meta) {
  try {
    const probe = childProcess.spawnSync(meta.shell, ["-c", ":"], {
      cwd: meta.cwd,
      timeout: 1000,
      stdio: "ignore"
    });
    if (!probe.error)
      return "ok";
    const e = probe.error;
    return e.code ?? e.message;
  } catch (e) {
    return `reprobe-failed:${e.message}`;
  }
}
function spawn2({ meta }) {
  validateDims(meta.cols, meta.rows);
  if (meta.cwd !== undefined) {
    let stat;
    try {
      stat = fs.statSync(meta.cwd);
    } catch (err) {
      const e = err;
      if (e.code === "ENOENT") {
        throw new Error(`spawn: cwd does not exist: ${meta.cwd} (workspace may have been deleted or moved)`);
      }
      throw new Error(`spawn: cwd not accessible: ${meta.cwd} (${e.code ?? e.message})`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`spawn: cwd is not a directory: ${meta.cwd}`);
    }
  }
  let term;
  try {
    term = nodePty.spawn(meta.shell, meta.argv, {
      name: "xterm-256color",
      cols: meta.cols,
      rows: meta.rows,
      cwd: meta.cwd,
      env: meta.env,
      encoding: null
    });
  } catch (err) {
    throw new Error(`spawn failed (shell=${meta.shell} cwd=${meta.cwd ?? "(none)"} errno=${reprobeErrno(meta)}): ${err.message}`);
  }
  const adapter = new NodePtyAdapter(term, meta);
  adapter.getMasterFd();
  return adapter;
}

class AdoptedPty {
  pid;
  meta;
  fd;
  reader;
  exitFired = false;
  livenessTimer = null;
  killEscalationTimer = null;
  exitCallbacks = [];
  constructor(fd, pid, meta) {
    this.fd = fd;
    this.pid = pid;
    this.meta = meta;
    this.reader = new tty.ReadStream(fd);
    const onExit = (info) => {
      if (this.exitFired)
        return;
      this.exitFired = true;
      if (this.livenessTimer)
        clearInterval(this.livenessTimer);
      try {
        this.reader.destroy();
      } catch {}
      for (const cb of this.exitCallbacks)
        cb(info);
    };
    this.reader.on("end", () => onExit({ code: null, signal: null }));
    this.reader.on("error", () => onExit({ code: null, signal: null }));
    this.livenessTimer = setInterval(() => {
      if (!isPidAlive(this.pid))
        onExit({ code: null, signal: null });
    }, 1000);
    this.livenessTimer.unref();
  }
  getMasterFd() {
    return this.fd;
  }
  write(data) {
    if (this.exitFired) {
      throw new Error(`session exited: ${this.pid}`);
    }
    let offset = 0;
    while (offset < data.byteLength) {
      const written = fs.writeSync(this.fd, data, offset, data.byteLength - offset);
      if (written <= 0) {
        throw new Error(`pty write wrote ${written} bytes`);
      }
      offset += written;
    }
  }
  resize(cols, rows) {
    validateDims(cols, rows);
    this.meta = { ...this.meta, cols, rows };
    try {
      childProcess.spawnSync("stty", ["cols", String(cols), "rows", String(rows)], {
        stdio: [this.fd, "ignore", "ignore"],
        timeout: 1000
      });
    } catch {}
  }
  kill(signal) {
    const killSignal = signal ?? "SIGHUP";
    const escalationTargets = signalProcessTreeAndGroups(this.pid, killSignal, {
      onSignalError: logProcessSignalError
    });
    this.scheduleKillEscalation(killSignal, escalationTargets);
  }
  onData(cb) {
    this.reader.on("data", (chunk) => {
      cb(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
    });
  }
  onExit(cb) {
    this.exitCallbacks.push(cb);
  }
  scheduleKillEscalation(signal, targets) {
    if (signal === "SIGKILL" || this.exitFired || this.killEscalationTimer)
      return;
    this.killEscalationTimer = setTimeout(() => {
      this.killEscalationTimer = null;
      signalProcessTargets(targets, "SIGKILL", logProcessSignalError);
    }, KILL_ESCALATION_TIMEOUT_MS);
    this.killEscalationTimer.unref();
  }
}
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function logProcessSignalError(event) {
  if (event.error.code === "ESRCH")
    return;
  const label = event.target === "pgid" ? "process group" : "pid";
  process.stderr.write(`[pty-daemon] failed to ${event.signal} ${label} ${event.id}: ${event.error.message}
`);
}
function adoptFromFd({ fd, pid, meta }) {
  if (!Number.isInteger(fd) || fd < 0) {
    throw new Error(`invalid fd: ${fd}`);
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid pid: ${pid}`);
  }
  validateDims(meta.cols, meta.rows);
  return new AdoptedPty(fd, pid, meta);
}
// src/handlers/handlers.ts
function handleOpen(ctx, msg) {
  const existing = ctx.store.get(msg.id);
  if (existing) {
    if (existing.exited) {
      ctx.store.delete(msg.id);
    } else {
      return errorFor(msg.id, `session already exists: ${msg.id}`, "EEXIST");
    }
  }
  let session;
  const spawnFn = ctx.spawnPty ?? spawn2;
  try {
    const pty = spawnFn({ meta: msg.meta });
    session = ctx.store.add(msg.id, pty);
  } catch (err) {
    return errorFor(msg.id, err.message, "ESPAWN");
  }
  ctx.wireSession(session);
  const reply = {
    type: "open-ok",
    id: msg.id,
    pid: session.pty.pid
  };
  return reply;
}
function handleInput(ctx, msg, payload) {
  const session = ctx.store.get(msg.id);
  if (!session)
    return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
  if (session.exited)
    return errorFor(msg.id, `session exited: ${msg.id}`, "EEXITED");
  if (!payload || payload.byteLength === 0) {
    return;
  }
  try {
    session.pty.write(Buffer.from(payload));
  } catch (err) {
    return errorFor(msg.id, err.message, "EWRITE");
  }
  return;
}
function handleResize(ctx, msg) {
  const session = ctx.store.get(msg.id);
  if (!session)
    return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
  try {
    session.pty.resize(msg.cols, msg.rows);
  } catch (err) {
    return errorFor(msg.id, err.message, "ERESIZE");
  }
  return;
}
function handleClose(ctx, msg) {
  const session = ctx.store.get(msg.id);
  if (!session)
    return errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT");
  try {
    session.pty.kill(msg.signal ?? "SIGHUP");
  } catch (err) {
    return errorFor(msg.id, err.message, "EKILL");
  }
  return { type: "closed", id: msg.id };
}
function handleList(ctx) {
  return { type: "list-reply", sessions: ctx.store.list() };
}
function handleSubscribe(ctx, conn, msg) {
  const session = ctx.store.get(msg.id);
  if (!session) {
    conn.send(errorFor(msg.id, `unknown session: ${msg.id}`, "ENOENT"));
    return;
  }
  conn.subscriptions.add(msg.id);
  if (msg.replay) {
    const snap = ctx.store.snapshotBuffer(session);
    if (snap.byteLength > 0) {
      const out = { type: "output", id: msg.id };
      conn.send(out, snap);
    }
  }
}
function handleUnsubscribe(conn, msg) {
  conn.subscriptions.delete(msg.id);
}
function errorFor(id, message, code) {
  return { type: "error", id, message, code };
}
// src/protocol/framing.ts
var HEADER_BYTES = 4;
var INNER_JSON_LEN_BYTES = 4;
var MAX_FRAME_BYTES = 8 * 1024 * 1024;
function encodeFrame(message, payload) {
  const json = JSON.stringify(message);
  const jsonBytes = Buffer.from(json, "utf8");
  const payloadLen = payload?.byteLength ?? 0;
  const totalLen = INNER_JSON_LEN_BYTES + jsonBytes.byteLength + payloadLen;
  const out = Buffer.alloc(HEADER_BYTES + totalLen);
  out.writeUInt32BE(totalLen, 0);
  out.writeUInt32BE(jsonBytes.byteLength, HEADER_BYTES);
  jsonBytes.copy(out, HEADER_BYTES + INNER_JSON_LEN_BYTES);
  if (payload && payload.byteLength > 0) {
    out.set(payload, HEADER_BYTES + INNER_JSON_LEN_BYTES + jsonBytes.byteLength);
  }
  return out;
}

class FrameDecoder {
  buf = Buffer.alloc(0);
  push(chunk) {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
  }
  drain() {
    const out = [];
    while (this.buf.length >= HEADER_BYTES) {
      const totalLen = this.buf.readUInt32BE(0);
      if (totalLen > MAX_FRAME_BYTES) {
        throw new Error(`frame too large: ${totalLen} bytes`);
      }
      if (totalLen < INNER_JSON_LEN_BYTES) {
        throw new Error(`frame too small: ${totalLen} bytes (need ≥4)`);
      }
      if (this.buf.length < HEADER_BYTES + totalLen)
        break;
      const jsonLen = this.buf.readUInt32BE(HEADER_BYTES);
      if (jsonLen > totalLen - INNER_JSON_LEN_BYTES) {
        throw new Error(`frame jsonLen ${jsonLen} exceeds frame body ${totalLen - INNER_JSON_LEN_BYTES}`);
      }
      const jsonStart = HEADER_BYTES + INNER_JSON_LEN_BYTES;
      const payloadStart = jsonStart + jsonLen;
      const frameEnd = HEADER_BYTES + totalLen;
      const message = JSON.parse(this.buf.subarray(jsonStart, payloadStart).toString("utf8"));
      let payload = null;
      if (payloadStart < frameEnd) {
        const view = this.buf.subarray(payloadStart, frameEnd);
        payload = new Uint8Array(view.length);
        payload.set(view, 0);
      }
      out.push({ message, payload });
      this.buf = this.buf.subarray(frameEnd);
    }
    return out;
  }
}
// src/protocol/version.ts
var SUPPORTED_PROTOCOL_VERSIONS = [2];
// src/SessionStore/SessionStore.ts
var DEFAULT_BUFFER_BYTES = 64 * 1024;

class SessionStore {
  sessions = new Map;
  bufferCap;
  constructor(opts = {}) {
    this.bufferCap = opts.bufferCap ?? DEFAULT_BUFFER_BYTES;
  }
  add(id, pty) {
    if (this.sessions.has(id)) {
      throw new Error(`session already exists: ${id}`);
    }
    const session = {
      id,
      pty,
      buffer: [],
      bufferBytes: 0,
      bufferCap: this.bufferCap,
      exited: false,
      exitCode: null,
      exitSignal: null
    };
    this.sessions.set(id, session);
    return session;
  }
  get(id) {
    return this.sessions.get(id);
  }
  delete(id) {
    return this.sessions.delete(id);
  }
  list() {
    const out = [];
    for (const s of this.sessions.values()) {
      out.push({
        id: s.id,
        pid: s.pty.pid,
        cols: s.pty.meta.cols,
        rows: s.pty.meta.rows,
        alive: !s.exited
      });
    }
    return out;
  }
  all() {
    return this.sessions.values();
  }
  size() {
    return this.sessions.size;
  }
  appendOutput(session, chunk) {
    session.buffer.push(chunk);
    session.bufferBytes += chunk.byteLength;
    while (session.bufferBytes > session.bufferCap && session.buffer.length > 0) {
      const head = session.buffer.shift();
      if (head)
        session.bufferBytes -= head.byteLength;
    }
  }
  snapshotBuffer(session) {
    return Buffer.concat(session.buffer);
  }
}
// src/SessionStore/snapshot.ts
import * as fs2 from "node:fs";
var SNAPSHOT_VERSION = 1;
function serializeSessions(opts) {
  const out = [];
  for (const s of opts.sessions) {
    if (s.exited)
      continue;
    const fdIndex = opts.fdIndexBySessionId.get(s.id);
    if (fdIndex === undefined) {
      throw new Error(`no fdIndex assigned for session ${s.id}`);
    }
    out.push({
      id: s.id,
      pid: s.pty.pid,
      meta: s.pty.meta,
      fdIndex,
      buffer: Buffer.concat(s.buffer)
    });
  }
  return {
    version: SNAPSHOT_VERSION,
    writtenAt: Date.now(),
    sessions: out
  };
}
function writeSnapshot(path, snapshot) {
  const tmp = `${path}.tmp`;
  const header = {
    type: "handoff-header",
    version: snapshot.version,
    writtenAt: snapshot.writtenAt,
    sessionCount: snapshot.sessions.length
  };
  const parts = [encodeFrame(header)];
  for (const s of snapshot.sessions) {
    const msg = {
      type: "handoff-session",
      id: s.id,
      pid: s.pid,
      meta: s.meta,
      fdIndex: s.fdIndex
    };
    parts.push(encodeFrame(msg, s.buffer.byteLength > 0 ? s.buffer : undefined));
  }
  fs2.writeFileSync(tmp, Buffer.concat(parts), { mode: 384 });
  fs2.renameSync(tmp, path);
}
function readSnapshot(path) {
  const raw = fs2.readFileSync(path);
  const dec = new FrameDecoder;
  dec.push(raw);
  const frames = dec.drain();
  if (frames.length === 0) {
    throw new Error(`malformed handoff snapshot at ${path}: no frames`);
  }
  const headerMsg = frames[0]?.message;
  if (!headerMsg || headerMsg.type !== "handoff-header") {
    throw new Error(`malformed handoff snapshot at ${path}: missing header frame`);
  }
  if (headerMsg.version !== SNAPSHOT_VERSION) {
    throw new Error(`unsupported snapshot version ${headerMsg.version} at ${path} (expected ${SNAPSHOT_VERSION})`);
  }
  if (typeof headerMsg.writtenAt !== "number") {
    throw new Error(`malformed handoff snapshot at ${path}: bad writtenAt`);
  }
  if (typeof headerMsg.sessionCount !== "number" || headerMsg.sessionCount !== frames.length - 1) {
    throw new Error(`malformed handoff snapshot at ${path}: header session count ${headerMsg.sessionCount} ≠ ${frames.length - 1} session frames`);
  }
  const sessions = [];
  for (let i = 1;i < frames.length; i++) {
    const frame = frames[i];
    if (!frame)
      continue;
    const m = frame.message;
    if (m.type !== "handoff-session" || typeof m.id !== "string" || typeof m.pid !== "number" || typeof m.fdIndex !== "number" || typeof m.meta !== "object" || m.meta === null) {
      throw new Error(`malformed handoff snapshot at ${path}: bad session frame at index ${i}`);
    }
    sessions.push({
      id: m.id,
      pid: m.pid,
      meta: m.meta,
      fdIndex: m.fdIndex,
      buffer: frame.payload ?? new Uint8Array(0)
    });
  }
  return {
    version: headerMsg.version,
    writtenAt: headerMsg.writtenAt,
    sessions
  };
}
function clearSnapshot(path) {
  try {
    fs2.unlinkSync(path);
  } catch (err) {
    if (err.code !== "ENOENT")
      throw err;
  }
}
// src/Server/Server.ts
var DEFAULT_OUTBOUND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;

class Server {
  server;
  store;
  conns = new Set;
  opts;
  constructor(opts) {
    this.opts = opts;
    this.store = new SessionStore({ bufferCap: opts.bufferCap });
    this.server = net.createServer((socket) => this.onConnection(socket));
  }
  async listen() {
    const dir = path.dirname(this.opts.socketPath);
    fs3.mkdirSync(dir, { recursive: true });
    try {
      fs3.unlinkSync(this.opts.socketPath);
    } catch (err) {
      if (err.code !== "ENOENT")
        throw err;
    }
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.opts.socketPath, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    fs3.chmodSync(this.opts.socketPath, 384);
  }
  async listenWithRetry(timeoutMs = 5000) {
    const start = Date.now();
    let lastErr = null;
    while (Date.now() - start < timeoutMs) {
      try {
        await this.listen();
        return;
      } catch (err) {
        lastErr = err;
        const code = err.code;
        if (code !== "EADDRINUSE")
          throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw lastErr ?? new Error("listenWithRetry timed out");
  }
  adoptSnapshot(snapshot) {
    for (const s of snapshot.sessions) {
      const pty = adoptFromFd({
        fd: s.fdIndex,
        pid: s.pid,
        meta: s.meta
      });
      const session = this.store.add(s.id, pty);
      if (s.buffer.byteLength > 0) {
        const buf = Buffer.from(s.buffer.buffer, s.buffer.byteOffset, s.buffer.byteLength);
        session.buffer = [buf];
        session.bufferBytes = buf.byteLength;
      }
      this.wireSession(session);
    }
  }
  async prepareUpgrade() {
    const liveSessions = [...this.store.all()].filter((s) => !s.exited);
    const fdIndexBySessionId = new Map;
    const HANDOFF_STDIO_PTY_BASE = 4;
    const stdio = [
      "ignore",
      "inherit",
      "inherit",
      "ipc"
    ];
    for (const [i, session] of liveSessions.entries()) {
      fdIndexBySessionId.set(session.id, HANDOFF_STDIO_PTY_BASE + i);
      stdio.push(session.pty.getMasterFd());
    }
    const snapshotPath = path.join(os.tmpdir(), `pty-daemon-handoff-${process.pid}-${Date.now()}.snap`);
    try {
      writeSnapshot(snapshotPath, serializeSessions({
        sessions: liveSessions,
        fdIndexBySessionId
      }));
    } catch (err) {
      return {
        ok: false,
        reason: `snapshot write failed: ${err.message}`
      };
    }
    const scriptPath = process.argv[1];
    if (!scriptPath) {
      return { ok: false, reason: "process.argv[1] empty — can't self-spawn" };
    }
    process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] spawning successor: ${process.execPath} ${[...process.execArgv, scriptPath].join(" ")} (sessions=${liveSessions.length}, ptyFds=${liveSessions.map((s) => s.pty.getMasterFd()).join(",")})
`);
    const successorEnv = { ...process.env };
    delete successorEnv.SUPERSET_PTY_DAEMON_VERSION;
    let child;
    try {
      child = childProcess2.spawn(process.execPath, [
        ...process.execArgv,
        scriptPath,
        "--handoff",
        `--snapshot=${snapshotPath}`,
        `--socket=${this.opts.socketPath}`
      ], {
        stdio,
        env: successorEnv,
        detached: false
      });
    } catch (err) {
      try {
        fs3.unlinkSync(snapshotPath);
      } catch {}
      return {
        ok: false,
        reason: `successor spawn failed: ${err.message}`
      };
    }
    child.on("exit", (code, signal) => {
      process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] successor exited code=${code} signal=${signal}
`);
    });
    const result = await waitForHandoffAck(child);
    if (!result.ok) {
      try {
        child.kill("SIGKILL");
      } catch {}
      try {
        fs3.unlinkSync(snapshotPath);
      } catch {}
      return result;
    }
    setImmediate(() => {
      this.finalizeHandoff();
    });
    return { ok: true, successorPid: result.successorPid };
  }
  async finalizeHandoff() {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await this.close({ killSessions: false });
    setTimeout(() => process.exit(0), 50).unref();
  }
  async close(opts = {}) {
    const killSessions = opts.killSessions ?? true;
    for (const c of this.conns)
      c.socket.destroy();
    this.conns.clear();
    if (killSessions) {
      for (const session of this.store.all()) {
        try {
          session.pty.kill("SIGKILL");
        } catch {}
      }
    }
    await new Promise((resolve) => this.server.close(() => resolve()));
    try {
      fs3.unlinkSync(this.opts.socketPath);
    } catch {}
  }
  onConnection(socket) {
    const outboundBufferCap = this.opts.outboundBufferCap ?? DEFAULT_OUTBOUND_BUFFER_CAP_BYTES;
    const conn = {
      socket,
      decoder: new FrameDecoder,
      negotiated: null,
      subscriptions: new Set,
      send: (msg, payload) => writeMessage(socket, msg, payload, outboundBufferCap)
    };
    this.conns.add(conn);
    socket.on("data", (chunk) => {
      try {
        conn.decoder.push(chunk);
        for (const frame of conn.decoder.drain()) {
          this.dispatch(conn, frame.message, frame.payload);
        }
      } catch (err) {
        conn.send({
          type: "error",
          message: err.message,
          code: "EPROTO"
        });
        socket.destroy();
      }
    });
    socket.on("close", () => {
      this.dropConn(conn);
    });
    socket.on("error", () => {
      this.dropConn(conn);
    });
  }
  dispatch(conn, msg, payload) {
    if (conn.negotiated === null) {
      if (msg.type !== "hello") {
        conn.send({ type: "error", message: "expected hello", code: "EPROTO" });
        conn.socket.destroy();
        return;
      }
      const negotiated = pickProtocol(msg);
      if (negotiated === null) {
        conn.send({
          type: "error",
          message: `no compatible protocol; daemon supports ${SUPPORTED_PROTOCOL_VERSIONS.join(",")}`,
          code: "EVERSION"
        });
        conn.socket.destroy();
        return;
      }
      conn.negotiated = negotiated;
      conn.send({
        type: "hello-ack",
        protocol: negotiated,
        daemonVersion: this.opts.daemonVersion,
        daemonPid: process.pid
      });
      return;
    }
    const ctx = this.handlerCtx();
    switch (msg.type) {
      case "hello": {
        conn.send({
          type: "error",
          message: "duplicate hello",
          code: "EPROTO"
        });
        return;
      }
      case "open": {
        conn.send(handleOpen(ctx, msg));
        return;
      }
      case "input": {
        const reply = handleInput(ctx, msg, payload);
        if (reply)
          conn.send(reply);
        return;
      }
      case "resize": {
        const reply = handleResize(ctx, msg);
        if (reply)
          conn.send(reply);
        return;
      }
      case "close": {
        conn.send(handleClose(ctx, msg));
        return;
      }
      case "list": {
        conn.send(handleList(ctx));
        return;
      }
      case "subscribe": {
        handleSubscribe(ctx, conn, msg);
        return;
      }
      case "unsubscribe": {
        handleUnsubscribe(conn, msg);
        return;
      }
      case "prepare-upgrade": {
        this.prepareUpgrade().then((result) => {
          conn.send({ type: "upgrade-prepared", result });
        }).catch((err) => {
          conn.send({
            type: "upgrade-prepared",
            result: {
              ok: false,
              reason: `prepareUpgrade threw: ${err.message}`
            }
          });
        });
        return;
      }
      default: {
        const t = msg.type;
        conn.send({
          type: "error",
          message: `unknown op: ${t}`,
          code: "EPROTO"
        });
        return;
      }
    }
  }
  handlerCtx() {
    return {
      store: this.store,
      wireSession: (session) => this.wireSession(session),
      spawnPty: this.opts.spawnPty
    };
  }
  wireSession(session) {
    session.pty.onData((chunk) => {
      this.store.appendOutput(session, chunk);
      const out = { type: "output", id: session.id };
      for (const c of this.conns) {
        if (!c.subscriptions.has(session.id))
          continue;
        c.send(out, chunk);
      }
    });
    session.pty.onExit((info) => {
      session.exited = true;
      session.exitCode = info.code;
      session.exitSignal = info.signal;
      const ev = {
        type: "exit",
        id: session.id,
        code: info.code,
        signal: info.signal
      };
      for (const c of this.conns) {
        if (c.subscriptions.has(session.id)) {
          c.send(ev);
          c.subscriptions.delete(session.id);
        }
      }
      this.store.delete(session.id);
    });
  }
  dropConn(conn) {
    this.conns.delete(conn);
  }
}
var HANDOFF_ACK_TIMEOUT_MS = 5000;
function waitForHandoffAck(child) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (r) => {
      if (settled)
        return;
      settled = true;
      child.removeListener("message", onMessage);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
      child.removeListener("disconnect", onDisconnect);
      clearTimeout(timer);
      resolve(r);
    };
    const onMessage = (raw) => {
      const msg = raw;
      if (msg && typeof msg === "object" && msg.type === "upgrade-ack") {
        if (typeof msg.successorPid !== "number" || !Number.isInteger(msg.successorPid) || msg.successorPid <= 0) {
          settle({
            ok: false,
            reason: `successor sent invalid ack pid: ${String(msg.successorPid)}`
          });
          return;
        }
        settle({ ok: true, successorPid: msg.successorPid });
      } else if (msg && typeof msg === "object" && msg.type === "upgrade-nak") {
        settle({ ok: false, reason: msg.reason ?? "successor sent nak" });
      }
    };
    const onExit = (code, signal) => {
      settle({
        ok: false,
        reason: `successor exited before ack (code=${code} signal=${signal})`
      });
    };
    const onError = (err) => {
      settle({
        ok: false,
        reason: `successor spawn error before ack: ${err.message}`
      });
    };
    const onDisconnect = () => {
      settle({
        ok: false,
        reason: "successor IPC disconnected before ack"
      });
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
    child.on("error", onError);
    child.on("disconnect", onDisconnect);
    const timer = setTimeout(() => {
      settle({
        ok: false,
        reason: `successor ack timed out after ${HANDOFF_ACK_TIMEOUT_MS}ms`
      });
    }, HANDOFF_ACK_TIMEOUT_MS);
  });
}
function pickProtocol(hello) {
  const supported = new Set(SUPPORTED_PROTOCOL_VERSIONS);
  let best = null;
  for (const v of hello.protocols) {
    if (supported.has(v) && (best === null || v > best))
      best = v;
  }
  return best;
}
function writeMessage(socket, msg, payload, outboundBufferCap = DEFAULT_OUTBOUND_BUFFER_CAP_BYTES) {
  if (socket.destroyed)
    return;
  if (socket.writableLength > outboundBufferCap) {
    socket.destroy();
    return;
  }
  socket.write(encodeFrame(msg, payload));
  if (socket.writableLength > outboundBufferCap) {
    socket.destroy();
  }
}
// src/main.ts
var DAEMON_VERSION = package_default.version;
function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith("--socket="))
      args.socket = arg.slice("--socket=".length);
    else if (arg.startsWith("--buffer-bytes=")) {
      const raw = arg.slice("--buffer-bytes=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--buffer-bytes must be a positive integer, got: ${raw}`);
      }
      args.bufferBytes = parsed;
    }
  }
  if (!args.socket) {
    throw new Error("--socket=PATH is required");
  }
  return args;
}
async function main() {
  if (process.argv.includes("--handoff")) {
    await runHandoffReceiver();
    return;
  }
  await runFresh();
}
async function runFresh() {
  const args = parseArgs(process.argv.slice(2));
  const daemonVersion = process.env.SUPERSET_PTY_DAEMON_VERSION ?? DAEMON_VERSION;
  const server = new Server({
    socketPath: args.socket,
    daemonVersion,
    bufferCap: args.bufferBytes
  });
  await server.listen();
  process.stderr.write(`[pty-daemon] listening on ${args.socket} (v${daemonVersion}, host=${os2.hostname()})
`);
  wireShutdown(server);
}
async function runHandoffReceiver() {
  const log = (msg) => process.stderr.write(`[pty-daemon handoff-recv pid=${process.pid}] ${msg}
`);
  log("entered runHandoffReceiver");
  let snapshotPath;
  let socketPath;
  for (const arg of process.argv) {
    if (arg.startsWith("--snapshot=")) {
      snapshotPath = arg.slice("--snapshot=".length);
    } else if (arg.startsWith("--socket=")) {
      socketPath = arg.slice("--socket=".length);
    }
  }
  if (!snapshotPath)
    throw new Error("--snapshot=PATH not set in argv");
  if (!socketPath)
    throw new Error("--socket=PATH not set in argv");
  if (typeof process.send !== "function") {
    throw new Error("handoff receiver requires an IPC channel (process.send)");
  }
  log(`snapshotPath=${snapshotPath} socketPath=${socketPath}`);
  const daemonVersion = DAEMON_VERSION;
  log(`daemonVersion=${daemonVersion}`);
  let snapshot;
  try {
    snapshot = readSnapshot(snapshotPath);
  } catch (err) {
    const reason = err.message;
    log(`SNAPSHOT READ FAILED: ${reason}`);
    const nak = {
      type: "upgrade-nak",
      reason: `snapshot read failed: ${reason}`
    };
    process.send?.(nak);
    setTimeout(() => process.exit(1), 50).unref();
    return;
  }
  log(`read snapshot: sessions=${snapshot.sessions.length}`);
  const server = new Server({ socketPath, daemonVersion });
  try {
    log(`adopting ${snapshot.sessions.length} sessions`);
    server.adoptSnapshot(snapshot);
    log(`adopted successfully`);
  } catch (err) {
    const reason = err.stack ?? err.message;
    log(`ADOPT FAILED: ${reason}`);
    const nak = {
      type: "upgrade-nak",
      reason: `adopt failed: ${err.message}`
    };
    process.send?.(nak);
    setTimeout(() => process.exit(1), 50).unref();
    return;
  }
  log(`sending upgrade-ack`);
  const ack = {
    type: "upgrade-ack",
    successorPid: process.pid
  };
  process.send?.(ack);
  log(`waiting for predecessor disconnect`);
  await new Promise((resolve) => {
    if (process.connected !== true)
      return resolve();
    process.once("disconnect", () => resolve());
    setTimeout(() => resolve(), 1000).unref();
  });
  log(`predecessor disconnected, binding socket`);
  await server.listenWithRetry();
  log(`bound and listening`);
  process.stderr.write(`[pty-daemon] (handoff successor) listening on ${socketPath} (v${daemonVersion}, host=${os2.hostname()}, sessions=${snapshot.sessions.length})
`);
  clearSnapshot(snapshotPath);
  wireShutdown(server);
}
function wireShutdown(server) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown)
      return;
    shuttingDown = true;
    process.stderr.write(`[pty-daemon] received ${signal}, shutting down
`);
    try {
      await server.close();
    } catch (err) {
      process.stderr.write(`[pty-daemon] shutdown error: ${err.stack ?? err}
`);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
main().catch((err) => {
  process.stderr.write(`[pty-daemon] fatal: ${err.stack ?? err}
`);
  process.exit(1);
});
