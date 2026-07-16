#!/usr/bin/env node
// @ts-nocheck -- frozen executable bundle, intentionally not current source.

// Frozen @superset/pty-daemon 0.2.5 compatibility fixture.
// Source commit: 808863600273e28aedb7bdbf8ddafea481820923.
// This intentionally remains old code; legacy-handoff.test.ts replaces its
// on-disk runtime path with the current bundle only after the live predecessor
// has started, exercising the real cross-version self-spawn boundary.

// ../superset-pty-0.2.5/packages/pty-daemon/src/main.ts
import * as os2 from "node:os";
import * as path2 from "node:path";
// ../superset-pty-0.2.5/packages/pty-daemon/package.json
var package_default = {
  name: "@superset/pty-daemon",
  version: "0.2.5",
  private: true,
  type: "module",
  exports: {
    ".": {
      types: "./dist-types/index.d.ts",
      default: "./src/index.ts"
    },
    "./protocol": {
      types: "./dist-types/protocol/index.d.ts",
      default: "./src/protocol/index.ts"
    },
    "./process-tree": {
      types: "./dist-types/process-tree.d.ts",
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
    test: "bun test src/protocol src/SessionStore src/handlers src/Pty test/no-encoding-hops.test.ts test/server-handoff-transaction.test.ts",
    "test:integration": "node --experimental-strip-types --test test/integration.test.ts test/control-plane.test.ts test/signal-recovery.test.ts test/byte-fidelity.test.ts test/handoff.test.ts test/handoff-backpressure.test.ts test/legacy-handoff.test.ts test/foreground-process.test.ts",
    "build:types": "tsc -p tsconfig.types.json"
  },
  dependencies: {
    "node-pty": "1.1.0"
  },
  devDependencies: {
    "@superset/typescript": "workspace:*",
    "@types/node": "24.12.0",
    "bun-types": "1.3.14",
    typescript: "6.0.3"
  }
};

// ../superset-pty-0.2.5/packages/pty-daemon/src/Server/Server.ts
import * as childProcess2 from "node:child_process";
import * as fs3 from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

// ../superset-pty-0.2.5/packages/pty-daemon/src/Pty/Pty.ts
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as tty from "node:tty";
import * as nodePty from "node-pty";

// ../superset-pty-0.2.5/packages/pty-daemon/src/process-tree.ts
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

// ../superset-pty-0.2.5/packages/pty-daemon/src/Pty/AsyncFdWriteQueue.ts
import { write as fsWrite } from "node:fs";
var DEFAULT_MAX_QUEUED_BYTES = 8 * 1024 * 1024;
var DEFAULT_MIN_BACKOFF_MS = 2;
var DEFAULT_MAX_BACKOFF_MS = 50;

class AsyncFdWriteQueue {
  fd;
  maxQueuedBytes;
  minBackoffMs;
  maxBackoffMs;
  writeFd;
  closeFd;
  onFatalError;
  queue = [];
  drainWaiters = [];
  queuedBytes = 0;
  inFlight = false;
  flushImmediate = null;
  retryTimer = null;
  backoffMs = 0;
  frozen = false;
  disposed = false;
  failure = null;
  generation = 0;
  fdClosed = false;
  constructor(options) {
    this.fd = options.fd;
    this.maxQueuedBytes = options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
    this.minBackoffMs = options.minBackoffMs ?? DEFAULT_MIN_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.writeFd = options.write ?? fsWrite;
    this.closeFd = options.closeFd;
    this.onFatalError = options.onFatalError;
    if (!Number.isInteger(this.maxQueuedBytes) || this.maxQueuedBytes <= 0) {
      throw new Error(`invalid max queued bytes: ${this.maxQueuedBytes}`);
    }
    if (!Number.isInteger(this.minBackoffMs) || this.minBackoffMs <= 0) {
      throw new Error(`invalid minimum write backoff: ${this.minBackoffMs}`);
    }
    if (!Number.isInteger(this.maxBackoffMs) || this.maxBackoffMs < this.minBackoffMs) {
      throw new Error(`invalid maximum write backoff: ${this.maxBackoffMs}`);
    }
  }
  enqueue(data) {
    this.assertWritable();
    if (data.byteLength === 0)
      return;
    if (this.queuedBytes + data.byteLength > this.maxQueuedBytes) {
      throw new Error(`pty input backlog exceeded hard limit (${this.queuedBytes} queued + ${data.byteLength} new > ${this.maxQueuedBytes} bytes)`);
    }
    const copy = Buffer.from(data);
    this.queue.push({ buffer: copy, offset: 0 });
    this.queuedBytes += copy.byteLength;
    this.scheduleFlush();
  }
  async freezeAndDrain(timeoutMs) {
    this.assertOperational();
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`invalid write drain timeout: ${timeoutMs}`);
    }
    this.frozen = true;
    if (this.isDrained())
      return;
    await new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.drainWaiters.indexOf(waiter);
          if (index >= 0)
            this.drainWaiters.splice(index, 1);
          reject(new Error(`pty input queue did not drain within ${timeoutMs}ms (${this.queuedBytes} bytes pending)`));
        }, timeoutMs)
      };
      waiter.timer.unref();
      this.drainWaiters.push(waiter);
    });
  }
  unfreeze() {
    if (this.disposed)
      return;
    this.frozen = false;
  }
  dispose(reason = new Error("pty write queue disposed")) {
    if (this.disposed)
      return;
    this.disposed = true;
    this.generation += 1;
    this.clearScheduledWork();
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.rejectDrainWaiters(reason);
    this.closeOwnedFdIfIdle();
  }
  get pendingBytes() {
    return this.queuedBytes;
  }
  assertOperational() {
    if (this.failure)
      throw this.failure;
    if (this.disposed)
      throw new Error("pty write queue disposed");
  }
  assertWritable() {
    this.assertOperational();
    if (this.frozen)
      throw new Error("pty input is frozen for daemon handoff");
  }
  scheduleFlush() {
    if (this.disposed || this.failure || this.inFlight || this.flushImmediate || this.retryTimer || this.queue.length === 0) {
      return;
    }
    this.flushImmediate = setImmediate(() => {
      this.flushImmediate = null;
      this.flushOne();
    });
  }
  flushOne() {
    if (this.disposed || this.failure || this.inFlight)
      return;
    const pending = this.queue[0];
    if (!pending) {
      this.resolveDrainWaitersIfDrained();
      return;
    }
    const length = pending.buffer.byteLength - pending.offset;
    const generation = this.generation;
    this.inFlight = true;
    try {
      this.writeFd(this.fd, pending.buffer, pending.offset, length, null, (err, bytesWritten) => {
        this.inFlight = false;
        if (generation !== this.generation || this.disposed) {
          this.closeOwnedFdIfIdle();
          return;
        }
        if (err) {
          if (isRetryableWriteError(err)) {
            this.scheduleRetry();
            return;
          }
          this.fail(err);
          return;
        }
        if (bytesWritten === 0) {
          this.scheduleRetry();
          return;
        }
        if (!Number.isInteger(bytesWritten) || bytesWritten < 0) {
          this.fail(new Error(`pty write returned ${bytesWritten} bytes`));
          return;
        }
        if (bytesWritten > length) {
          this.fail(new Error(`pty write returned ${bytesWritten} bytes for a ${length}-byte buffer`));
          return;
        }
        this.backoffMs = 0;
        pending.offset += bytesWritten;
        this.queuedBytes -= bytesWritten;
        if (pending.offset === pending.buffer.byteLength)
          this.queue.shift();
        this.scheduleFlush();
        this.resolveDrainWaitersIfDrained();
      });
    } catch (err) {
      this.inFlight = false;
      this.fail(asError(err));
    }
  }
  scheduleRetry() {
    if (this.disposed || this.failure || this.retryTimer)
      return;
    this.backoffMs = this.backoffMs === 0 ? this.minBackoffMs : Math.min(this.backoffMs * 2, this.maxBackoffMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleFlush();
    }, this.backoffMs);
    this.retryTimer.unref();
  }
  fail(error) {
    if (this.failure || this.disposed)
      return;
    this.failure = error;
    this.generation += 1;
    this.clearScheduledWork();
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.inFlight = false;
    this.rejectDrainWaiters(error);
    this.closeOwnedFdIfIdle();
    this.onFatalError?.(error);
  }
  isDrained() {
    return this.queue.length === 0 && !this.inFlight && !this.flushImmediate && !this.retryTimer;
  }
  resolveDrainWaitersIfDrained() {
    if (!this.isDrained())
      return;
    for (const waiter of this.drainWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }
  rejectDrainWaiters(error) {
    for (const waiter of this.drainWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
  clearScheduledWork() {
    if (this.flushImmediate)
      clearImmediate(this.flushImmediate);
    if (this.retryTimer)
      clearTimeout(this.retryTimer);
    this.flushImmediate = null;
    this.retryTimer = null;
  }
  closeOwnedFdIfIdle() {
    if (!this.closeFd || this.fdClosed || this.inFlight)
      return;
    this.fdClosed = true;
    try {
      this.closeFd(this.fd);
    } catch (error) {
      this.onFatalError?.(asError(error));
    }
  }
}
function isRetryableWriteError(error) {
  return error.code === "EAGAIN" || error.code === "EWOULDBLOCK" || error.code === "EINTR";
}
function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

// ../superset-pty-0.2.5/packages/pty-daemon/src/Pty/Pty.ts
var KILL_ESCALATION_TIMEOUT_MS = 1000;
var HANDOFF_WRITE_DRAIN_TIMEOUT_MS = 2000;

class NodePtyAdapter {
  pid;
  meta;
  term;
  exited = false;
  killEscalationTimer = null;
  exitInfo = null;
  exitCallbacks = [];
  handoffWriteStream;
  handoffFrozen = false;
  outputPausedForHandoff = false;
  dataCallbacks = [];
  pausedOutput = [];
  constructor(term, meta) {
    this.term = term;
    this.pid = term.pid;
    this.meta = meta;
    this.handoffWriteStream = requireNodePtyWriteStream(term);
    this.term.onData((data) => {
      const chunk = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
      if (this.outputPausedForHandoff) {
        this.pausedOutput.push(chunk);
        return;
      }
      for (const callback of this.dataCallbacks)
        callback(chunk);
    });
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
    if (this.handoffFrozen) {
      throw new Error("pty input is frozen for daemon handoff");
    }
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
    this.dataCallbacks.push(cb);
  }
  onExit(cb) {
    if (this.exitInfo) {
      cb(this.exitInfo);
      return;
    }
    this.exitCallbacks.push(cb);
  }
  async prepareForHandoff() {
    this.handoffFrozen = true;
    await drainNodePtyWriteStream(this.handoffWriteStream, HANDOFF_WRITE_DRAIN_TIMEOUT_MS);
  }
  pauseOutputForHandoff() {
    if (this.outputPausedForHandoff)
      return;
    const terminal = this.term;
    if (typeof terminal.pause !== "function") {
      throw new Error("daemon handoff requires node-pty pause() output control");
    }
    terminal.pause();
    this.outputPausedForHandoff = true;
  }
  async drainOutputForHandoff() {
    if (!this.outputPausedForHandoff) {
      throw new Error("PTY output must be paused before handoff drain");
    }
    const terminal = this.term;
    if (typeof terminal.pause !== "function" || typeof terminal.resume !== "function") {
      throw new Error("daemon handoff requires node-pty output flow control");
    }
    terminal.resume();
    await new Promise((resolve) => setImmediate(resolve));
    terminal.pause();
    await new Promise((resolve) => setImmediate(resolve));
    return this.pausedOutput.splice(0);
  }
  async sealOutputForHandoff() {
    const chunks = await this.drainOutputForHandoff();
    const socket = this.term._socket;
    if (!socket || typeof socket.destroy !== "function") {
      throw new Error("daemon handoff requires detachable node-pty reader");
    }
    socket.destroy();
    await new Promise((resolve) => setImmediate(resolve));
    chunks.push(...this.pausedOutput.splice(0));
    return chunks;
  }
  cancelHandoff() {
    if (this.outputPausedForHandoff) {
      const terminal = this.term;
      if (typeof terminal.resume !== "function") {
        throw new Error("daemon handoff requires node-pty resume() output control");
      }
      this.outputPausedForHandoff = false;
      for (const chunk of this.pausedOutput.splice(0)) {
        for (const callback of this.dataCallbacks)
          callback(chunk);
      }
      terminal.resume();
    }
    this.handoffFrozen = false;
  }
  restoreAfterFailedHandoff() {
    const readStream = this.term._socket;
    try {
      setAdoptedPtyNonBlocking(readStream);
    } catch (error) {
      try {
        this.term.kill("SIGKILL");
      } catch {}
      throw error;
    }
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
function requireNodePtyWriteStream(term) {
  const candidate = term._writeStream;
  const masterFd = term._fd;
  if (typeof masterFd !== "number" || !Number.isInteger(masterFd) || masterFd < 0 || !candidate || candidate._fd !== masterFd || !Array.isArray(candidate._writeQueue) || candidate._writeImmediate !== undefined && typeof candidate._writeImmediate !== "object" || typeof candidate.write !== "function") {
    throw new Error("node-pty 1.1.0 private CustomWriteStream contract unavailable; " + "daemon handoff requires matching _fd, _writeStream._fd, _writeQueue, _writeImmediate, and write()");
  }
  assertNodePtyWriteTasks(candidate._writeQueue);
  return candidate;
}
async function drainNodePtyWriteStream(stream, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    assertNodePtyWriteTasks(stream._writeQueue);
    if (stream._writeQueue.length === 0 && stream._writeImmediate === undefined) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`node-pty input queue did not drain within ${timeoutMs}ms (${nodePtyPendingBytes(stream._writeQueue)} bytes pending)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
function assertNodePtyWriteTasks(tasks) {
  for (const task of tasks) {
    const candidate = task;
    if (!candidate || !Buffer.isBuffer(candidate.buffer) || !Number.isInteger(candidate.offset) || candidate.offset < 0 || candidate.offset > candidate.buffer.byteLength) {
      throw new Error("node-pty 1.1.0 private CustomWriteStream queue task contract changed");
    }
  }
}
function nodePtyPendingBytes(tasks) {
  return tasks.reduce((total, task) => total + task.buffer.byteLength - task.offset, 0);
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
  try {
    const adapter = new NodePtyAdapter(term, meta);
    adapter.getMasterFd();
    return adapter;
  } catch (error) {
    try {
      term.kill("SIGKILL");
    } catch {}
    throw error;
  }
}
function setAdoptedPtyNonBlocking(stream) {
  const handle = stream?._handle;
  if (!handle || typeof handle.setBlocking !== "function") {
    throw new Error("adopted PTY TTY handle cannot set nonblocking mode");
  }
  const result = handle.setBlocking(false);
  if (result !== 0) {
    throw new Error(`adopted PTY failed to enter nonblocking mode (uv error ${result})`);
  }
}

class AdoptedPtyReadStream extends tty.ReadStream {
  fdCloseAllowed = false;
  deferredDestroy = null;
  onDestroyRequested = null;
  setDestroyRequestedCallback(callback) {
    this.onDestroyRequested = callback;
  }
  _destroy(error, callback) {
    if (this.fdCloseAllowed) {
      super._destroy(error, callback);
      return;
    }
    this.deferredDestroy = { error, callback };
    this.onDestroyRequested?.();
  }
  closeFdWhenWritesComplete() {
    if (this.fdCloseAllowed)
      return;
    this.fdCloseAllowed = true;
    const deferred = this.deferredDestroy;
    this.deferredDestroy = null;
    if (deferred) {
      super._destroy(deferred.error, deferred.callback);
      return;
    }
    this.destroy();
  }
  detachForHandoff() {
    this.onDestroyRequested = null;
    this.fdCloseAllowed = true;
    this.removeAllListeners("data");
    this.removeAllListeners("end");
    this.removeAllListeners("error");
    this.destroy();
  }
}

class AdoptedPty {
  pid;
  meta;
  fd;
  reader;
  writeQueue;
  exitFired = false;
  exitInfo = null;
  livenessTimer = null;
  killEscalationTimer = null;
  exitCallbacks = [];
  outputPausedForHandoff = false;
  dataCallbacks = [];
  pausedOutput = [];
  dataListenerAttached = false;
  constructor(fd, pid, meta) {
    this.fd = fd;
    this.pid = pid;
    this.meta = meta;
    this.reader = new AdoptedPtyReadStream(fd);
    try {
      setAdoptedPtyNonBlocking(this.reader);
    } catch (error) {
      this.reader.closeFdWhenWritesComplete();
      throw error;
    }
    this.writeQueue = new AsyncFdWriteQueue({
      fd,
      closeFd: () => this.reader.closeFdWhenWritesComplete(),
      onFatalError: (error) => this.handleFatalWrite(error)
    });
    this.reader.setDestroyRequestedCallback(() => this.finishExit({ code: null, signal: null }));
    this.reader.on("end", () => this.finishExit({ code: null, signal: null }));
    this.reader.on("error", () => this.finishExit({ code: null, signal: null }));
    this.livenessTimer = setInterval(() => {
      if (!isPidAlive(this.pid)) {
        this.finishExit({ code: null, signal: null });
      }
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
    this.writeQueue.enqueue(data);
  }
  async prepareForHandoff() {
    await this.writeQueue.freezeAndDrain(HANDOFF_WRITE_DRAIN_TIMEOUT_MS);
  }
  pauseOutputForHandoff() {
    if (this.outputPausedForHandoff)
      return;
    this.reader.pause();
    this.outputPausedForHandoff = true;
  }
  async drainOutputForHandoff() {
    if (!this.outputPausedForHandoff) {
      throw new Error("adopted PTY output must be paused before handoff drain");
    }
    this.reader.resume();
    await new Promise((resolve) => setImmediate(resolve));
    this.reader.pause();
    await new Promise((resolve) => setImmediate(resolve));
    return this.pausedOutput.splice(0);
  }
  async sealOutputForHandoff() {
    const chunks = await this.drainOutputForHandoff();
    if (this.livenessTimer)
      clearInterval(this.livenessTimer);
    this.livenessTimer = null;
    this.reader.detachForHandoff();
    await new Promise((resolve) => setImmediate(resolve));
    chunks.push(...this.pausedOutput.splice(0));
    return chunks;
  }
  cancelHandoff() {
    if (this.outputPausedForHandoff) {
      this.outputPausedForHandoff = false;
      for (const chunk of this.pausedOutput.splice(0)) {
        for (const callback of this.dataCallbacks)
          callback(chunk);
      }
      this.reader.resume();
    }
    this.writeQueue.unfreeze();
  }
  restoreAfterFailedHandoff() {
    try {
      setAdoptedPtyNonBlocking(this.reader);
    } catch (error) {
      const fatal = asError2(error);
      this.handleFatalWrite(fatal);
      throw fatal;
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
    try {
      setAdoptedPtyNonBlocking(this.reader);
    } catch (error) {
      const fatal = asError2(error);
      this.handleFatalWrite(fatal);
      throw fatal;
    }
  }
  kill(signal) {
    const killSignal = signal ?? "SIGHUP";
    const escalationTargets = signalProcessTreeAndGroups(this.pid, killSignal, {
      onSignalError: logProcessSignalError
    });
    this.scheduleKillEscalation(killSignal, escalationTargets);
  }
  onData(cb) {
    this.dataCallbacks.push(cb);
    if (this.dataListenerAttached)
      return;
    this.dataListenerAttached = true;
    this.reader.on("data", (data) => {
      const chunk = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
      if (this.outputPausedForHandoff) {
        this.pausedOutput.push(chunk);
        return;
      }
      for (const callback of this.dataCallbacks)
        callback(chunk);
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
    if (signal === "SIGKILL" || this.exitFired || this.killEscalationTimer)
      return;
    this.killEscalationTimer = setTimeout(() => {
      this.killEscalationTimer = null;
      signalProcessTargets(targets, "SIGKILL", logProcessSignalError);
    }, KILL_ESCALATION_TIMEOUT_MS);
    this.killEscalationTimer.unref();
  }
  handleFatalWrite(error) {
    process.stderr.write(`[pty-daemon] adopted PTY ${this.pid} write failed: ${error.message}
`);
    this.finishExit({ code: null, signal: null });
  }
  finishExit(info) {
    if (this.exitFired)
      return;
    this.exitFired = true;
    this.exitInfo = info;
    if (this.livenessTimer)
      clearInterval(this.livenessTimer);
    this.livenessTimer = null;
    this.reader.pause();
    this.reader.removeAllListeners("data");
    this.reader.unref();
    this.writeQueue.dispose(new Error(`session exited: ${this.pid}`));
    for (const cb of this.exitCallbacks)
      cb(info);
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
function asError2(error) {
  return error instanceof Error ? error : new Error(String(error));
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
// ../superset-pty-0.2.5/packages/pty-daemon/src/handlers/handlers.ts
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
// ../superset-pty-0.2.5/packages/pty-daemon/src/protocol/framing.ts
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
// ../superset-pty-0.2.5/packages/pty-daemon/src/protocol/version.ts
var SUPPORTED_PROTOCOL_VERSIONS = [2];
// ../superset-pty-0.2.5/packages/pty-daemon/src/SessionStore/SessionStore.ts
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
// ../superset-pty-0.2.5/packages/pty-daemon/src/SessionStore/snapshot.ts
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
// ../superset-pty-0.2.5/packages/pty-daemon/src/Server/Server.ts
var DEFAULT_OUTBOUND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;
var HANDOFF_CHILD_EXIT_TIMEOUT_MS = 2000;
var HANDOFF_STAGED_ACTIVATION_TIMEOUT_MS = 5000;

class Server {
  server;
  store;
  conns = new Set;
  opts;
  handoffRuntime;
  stagedSessions = new Set;
  stagedActivationTimer = null;
  boundSocketPath = null;
  listenerClosePromise = null;
  upgradePhase = "idle";
  mutationEpoch = 0;
  upgradeDirty = false;
  constructor(opts) {
    this.opts = opts;
    this.store = new SessionStore({ bufferCap: opts.bufferCap });
    this.server = net.createServer((socket) => this.onConnection(socket));
    this.handoffRuntime = {
      spawnSuccessor: (command, args, options) => childProcess2.spawn(command, args, options),
      waitForReady: waitForHandoffReady,
      commitAndWaitForListening,
      terminateAndConfirm: (child) => terminateAndConfirmHandoffChild(child, HANDOFF_CHILD_EXIT_TIMEOUT_MS),
      ...opts.handoffRuntime
    };
  }
  async listen() {
    await this.listenAt(this.opts.socketPath);
  }
  async listenForHandoff(stagingSocketPath) {
    if (stagingSocketPath === this.opts.socketPath) {
      throw new Error("handoff staging socket must differ from canonical socket");
    }
    await this.listenAt(stagingSocketPath);
  }
  publishHandoffSocket(stagingSocketPath) {
    if (this.boundSocketPath !== stagingSocketPath) {
      throw new Error(`handoff successor is not listening on ${stagingSocketPath}`);
    }
    unlinkBestEffort(this.opts.socketPath);
    fs3.renameSync(stagingSocketPath, this.opts.socketPath);
    this.boundSocketPath = this.opts.socketPath;
  }
  stopListeningForHandoff() {
    if (!this.server.listening || this.listenerClosePromise) {
      throw new Error("predecessor listener is not available for handoff");
    }
    this.listenerClosePromise = new Promise((resolve) => {
      this.server.close(() => resolve());
    });
    this.boundSocketPath = null;
  }
  async listenAt(socketPath) {
    const dir = path.dirname(this.opts.socketPath);
    fs3.mkdirSync(dir, { recursive: true });
    try {
      fs3.unlinkSync(socketPath);
    } catch (err) {
      if (err.code !== "ENOENT")
        throw err;
    }
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(socketPath, () => {
        this.server.off("error", reject);
        this.boundSocketPath = socketPath;
        resolve();
      });
    });
    fs3.chmodSync(socketPath, 384);
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
      const pty = (this.opts.adoptPty ?? adoptFromFd)({
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
      this.stagedSessions.add(session);
    }
  }
  refreshAdoptedSnapshot(snapshot) {
    if (snapshot.sessions.length !== this.stagedSessions.size) {
      throw new Error(`final handoff snapshot session count changed (${snapshot.sessions.length} != ${this.stagedSessions.size})`);
    }
    for (const serialized of snapshot.sessions) {
      const session = this.store.get(serialized.id);
      if (!session || !this.stagedSessions.has(session) || session.pty.pid !== serialized.pid) {
        throw new Error(`final handoff snapshot does not match staged session ${serialized.id}`);
      }
      const buffer = Buffer.from(serialized.buffer.buffer, serialized.buffer.byteOffset, serialized.buffer.byteLength);
      session.buffer = buffer.byteLength > 0 ? [buffer] : [];
      session.bufferBytes = buffer.byteLength;
    }
  }
  activateAdoptedSessions() {
    for (const session of [...this.stagedSessions]) {
      this.activateStagedSession(session.id);
    }
  }
  scheduleAdoptedSessionActivation(timeoutMs = HANDOFF_STAGED_ACTIVATION_TIMEOUT_MS) {
    if (this.stagedSessions.size === 0 || this.stagedActivationTimer)
      return;
    this.stagedActivationTimer = setTimeout(() => {
      this.stagedActivationTimer = null;
      this.activateAdoptedSessions();
    }, timeoutMs);
    this.stagedActivationTimer.unref();
  }
  async prepareUpgrade() {
    if (this.upgradePhase !== "idle") {
      return {
        ok: false,
        reason: `upgrade already ${this.upgradePhase}`,
        ownership: "unresolved"
      };
    }
    this.upgradePhase = "preparing";
    this.upgradeDirty = false;
    const startEpoch = this.mutationEpoch;
    const liveSessions = [...this.store.all()].filter((s) => !s.exited);
    const preparedPtys = [];
    let handoffCommitted = false;
    let predecessorMayResume = true;
    let child = null;
    let snapshotPath = null;
    let stagingSocketPath = null;
    let commitSent = false;
    try {
      try {
        for (const session of liveSessions) {
          preparedPtys.push(session.pty);
        }
        await Promise.all(preparedPtys.map((pty) => pty.prepareForHandoff()));
      } catch (err) {
        return {
          ok: false,
          reason: `PTY input drain failed before handoff: ${err.message}`,
          ownership: "predecessor"
        };
      }
      if (this.upgradeWasMutated(startEpoch)) {
        return {
          ok: false,
          reason: "upgrade aborted: terminal mutation arrived while input was draining",
          ownership: "predecessor"
        };
      }
      try {
        for (const pty of preparedPtys)
          pty.pauseOutputForHandoff();
      } catch (err) {
        return {
          ok: false,
          reason: `PTY output quiescence failed before handoff: ${err.message}`,
          ownership: "predecessor"
        };
      }
      await new Promise((resolve) => setImmediate(resolve));
      try {
        for (const session of liveSessions) {
          for (const chunk of await session.pty.drainOutputForHandoff()) {
            this.recordSessionOutput(session, chunk);
          }
        }
      } catch (err) {
        return {
          ok: false,
          reason: `PTY buffered-output drain failed before handoff: ${err.message}`,
          ownership: "predecessor"
        };
      }
      if (this.upgradeWasMutated(startEpoch)) {
        return {
          ok: false,
          reason: "upgrade aborted: terminal mutation arrived while output was quiescing",
          ownership: "predecessor"
        };
      }
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
      snapshotPath = path.join(os.tmpdir(), `pty-daemon-handoff-${process.pid}-${Date.now()}.snap`);
      try {
        writeSnapshot(snapshotPath, serializeSessions({
          sessions: liveSessions,
          fdIndexBySessionId
        }));
      } catch (err) {
        return {
          ok: false,
          reason: `snapshot write failed: ${err.message}`,
          ownership: "predecessor"
        };
      }
      if (this.upgradeWasMutated(startEpoch)) {
        return {
          ok: false,
          reason: "upgrade aborted: terminal mutation arrived before successor spawn",
          ownership: "predecessor"
        };
      }
      const scriptPath = process.argv[1];
      if (!scriptPath) {
        return {
          ok: false,
          reason: "process.argv[1] empty — can't self-spawn",
          ownership: "predecessor"
        };
      }
      stagingSocketPath = path.join(path.dirname(this.opts.socketPath), `.ptyd-h-${process.pid}-${Date.now().toString(36)}.sock`);
      process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] spawning successor: ${process.execPath} ${[...process.execArgv, scriptPath].join(" ")} (sessions=${liveSessions.length}, ptyFds=${liveSessions.map((s) => s.pty.getMasterFd()).join(",")})
`);
      const successorEnv = { ...process.env };
      delete successorEnv.SUPERSET_PTY_DAEMON_VERSION;
      try {
        child = this.handoffRuntime.spawnSuccessor(process.execPath, [
          ...process.execArgv,
          scriptPath,
          "--handoff",
          `--snapshot=${snapshotPath}`,
          `--socket=${this.opts.socketPath}`,
          `--handoff-socket=${stagingSocketPath}`
        ], {
          stdio,
          env: successorEnv,
          detached: false
        });
      } catch (err) {
        return {
          ok: false,
          reason: `successor spawn failed: ${err.message}`,
          ownership: "predecessor"
        };
      }
      predecessorMayResume = false;
      child.on("exit", (code, signal) => {
        process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] successor exited code=${code} signal=${signal}
`);
      });
      const ready = await this.handoffRuntime.waitForReady(child);
      if (!ready.ok) {
        predecessorMayResume = await this.handoffRuntime.terminateAndConfirm(child);
        return {
          ok: false,
          reason: predecessorMayResume ? ready.reason : `${ready.reason}; successor exit could not be confirmed — predecessor remains frozen`,
          ownership: predecessorMayResume ? "predecessor" : "unresolved"
        };
      }
      await new Promise((resolve) => setImmediate(resolve));
      try {
        for (const session of liveSessions) {
          for (const chunk of await session.pty.drainOutputForHandoff()) {
            this.recordSessionOutput(session, chunk);
          }
        }
      } catch (error) {
        predecessorMayResume = await this.handoffRuntime.terminateAndConfirm(child);
        return {
          ok: false,
          reason: `final PTY output drain failed: ${error.message}`,
          ownership: predecessorMayResume ? "predecessor" : "unresolved"
        };
      }
      if (this.upgradeWasMutated(startEpoch)) {
        predecessorMayResume = await this.handoffRuntime.terminateAndConfirm(child);
        return {
          ok: false,
          reason: predecessorMayResume ? "upgrade aborted: terminal mutation arrived before commit" : "upgrade aborted after mutation, but successor exit could not be confirmed — predecessor remains frozen",
          ownership: predecessorMayResume ? "predecessor" : "unresolved"
        };
      }
      this.upgradePhase = "committing";
      commitSent = true;
      predecessorMayResume = false;
      for (const session of liveSessions) {
        for (const chunk of await session.pty.sealOutputForHandoff()) {
          this.recordSessionOutput(session, chunk);
        }
      }
      writeSnapshot(snapshotPath, serializeSessions({ sessions: liveSessions, fdIndexBySessionId }));
      this.stopListeningForHandoff();
      const listening = await this.handoffRuntime.commitAndWaitForListening(child, ready.successorPid);
      if (!listening.ok) {
        predecessorMayResume = false;
        await this.handoffRuntime.terminateAndConfirm(child).catch(() => false);
        return {
          ok: false,
          reason: `${listening.reason}; successor ownership after commit is unresolved — predecessor remains frozen`,
          ownership: "unresolved"
        };
      }
      handoffCommitted = true;
      setImmediate(() => {
        this.finalizeHandoff();
      });
      return { ok: true, successorPid: listening.successorPid };
    } catch (error) {
      if (child && !handoffCommitted) {
        if (commitSent) {
          predecessorMayResume = false;
          await this.handoffRuntime.terminateAndConfirm(child).catch(() => false);
        } else {
          try {
            predecessorMayResume = await this.handoffRuntime.terminateAndConfirm(child);
          } catch {
            predecessorMayResume = false;
          }
        }
      }
      return {
        ok: false,
        reason: `prepareUpgrade failed: ${error.message}${predecessorMayResume ? "" : "; successor exit could not be confirmed — predecessor remains frozen"}`,
        ownership: predecessorMayResume ? "predecessor" : "unresolved"
      };
    } finally {
      if (!handoffCommitted) {
        if (snapshotPath)
          unlinkBestEffort(snapshotPath);
        if (stagingSocketPath && predecessorMayResume) {
          unlinkBestEffort(stagingSocketPath);
        }
        if (predecessorMayResume) {
          const restored = new Set;
          for (const session of liveSessions) {
            try {
              session.pty.restoreAfterFailedHandoff();
              restored.add(session.pty);
            } catch (error) {
              process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] failed to restore PTY ${session.id} nonblocking mode: ${error.message}
`);
            }
          }
          for (const pty of preparedPtys) {
            if (restored.has(pty))
              pty.cancelHandoff();
          }
          this.upgradePhase = "idle";
        } else {
          process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] successor ownership unresolved; keeping predecessor PTY input/output frozen
`);
        }
      }
    }
  }
  async finalizeHandoff() {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await this.close({ killSessions: false, unlinkSocket: false });
    setTimeout(() => process.exit(0), 50).unref();
  }
  async close(opts = {}) {
    const killSessions = opts.killSessions ?? true;
    const unlinkSocket = opts.unlinkSocket ?? true;
    if (this.stagedActivationTimer) {
      clearTimeout(this.stagedActivationTimer);
      this.stagedActivationTimer = null;
    }
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
    if (this.listenerClosePromise) {
      await this.listenerClosePromise;
    } else if (this.server.listening) {
      await new Promise((resolve) => this.server.close(() => resolve()));
    }
    if (unlinkSocket && this.boundSocketPath) {
      try {
        fs3.unlinkSync(this.boundSocketPath);
      } catch {}
    }
    this.boundSocketPath = null;
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
        if (this.rejectMutationDuringUpgrade(conn, msg.id))
          return;
        conn.send(handleOpen(ctx, msg));
        return;
      }
      case "input": {
        if (this.rejectMutationDuringUpgrade(conn, msg.id))
          return;
        this.activateStagedSession(msg.id);
        const reply = handleInput(ctx, msg, payload);
        if (reply)
          conn.send(reply);
        return;
      }
      case "resize": {
        if (this.rejectMutationDuringUpgrade(conn, msg.id))
          return;
        this.activateStagedSession(msg.id);
        const reply = handleResize(ctx, msg);
        if (reply)
          conn.send(reply);
        return;
      }
      case "close": {
        if (this.rejectMutationDuringUpgrade(conn, msg.id))
          return;
        this.activateStagedSession(msg.id);
        conn.send(handleClose(ctx, msg));
        return;
      }
      case "list": {
        conn.send(handleList(ctx));
        return;
      }
      case "subscribe": {
        handleSubscribe(ctx, conn, msg);
        this.activateStagedSession(msg.id);
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
              reason: `prepareUpgrade threw: ${err.message}`,
              ownership: "unresolved"
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
  rejectMutationDuringUpgrade(conn, id) {
    if (this.upgradePhase === "idle")
      return false;
    if (this.upgradePhase === "preparing") {
      this.mutationEpoch += 1;
      this.upgradeDirty = true;
    }
    conn.send({
      type: "error",
      id,
      code: "EUPGRADING",
      message: `terminal mutation rejected while daemon upgrade is ${this.upgradePhase}; retry on the active daemon`
    });
    return true;
  }
  upgradeWasMutated(startEpoch) {
    return this.upgradeDirty || this.mutationEpoch !== startEpoch;
  }
  activateStagedSession(id) {
    const session = this.store.get(id);
    if (!session || !this.stagedSessions.delete(session))
      return;
    this.wireSession(session);
    if (this.stagedSessions.size === 0 && this.stagedActivationTimer) {
      clearTimeout(this.stagedActivationTimer);
      this.stagedActivationTimer = null;
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
    session.pty.onData((chunk) => this.recordSessionOutput(session, chunk));
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
  recordSessionOutput(session, chunk) {
    this.store.appendOutput(session, chunk);
    const out = { type: "output", id: session.id };
    for (const c of this.conns) {
      if (!c.subscriptions.has(session.id))
        continue;
      c.send(out, chunk);
    }
  }
  dropConn(conn) {
    this.conns.delete(conn);
  }
}
function unlinkBestEffort(filePath) {
  try {
    fs3.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      process.stderr.write(`[pty-daemon prep-upgrade pid=${process.pid}] snapshot cleanup failed: ${error.message}
`);
    }
  }
}
async function terminateAndConfirmHandoffChild(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null)
    return true;
  return await new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const settle = (confirmed) => {
      if (settled)
        return;
      settled = true;
      if (timer)
        clearTimeout(timer);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
      resolve(confirmed);
    };
    const onExit = () => settle(true);
    const onError = () => {
      if (child.pid === undefined)
        settle(true);
    };
    child.once("exit", onExit);
    child.once("error", onError);
    timer = setTimeout(() => settle(child.exitCode !== null || child.signalCode !== null), timeoutMs);
    try {
      child.kill("SIGKILL");
    } catch {}
  });
}
var HANDOFF_READY_TIMEOUT_MS = 5000;
function waitForHandoffReady(child) {
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
      if (msg && typeof msg === "object" && msg.type === "upgrade-ready") {
        if (typeof msg.successorPid !== "number" || !Number.isInteger(msg.successorPid) || msg.successorPid <= 0 || child.pid !== undefined && msg.successorPid !== child.pid) {
          settle({
            ok: false,
            reason: `successor sent invalid ready pid: ${String(msg.successorPid)}`
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
        reason: `successor exited before ready (code=${code} signal=${signal})`
      });
    };
    const onError = (err) => {
      settle({
        ok: false,
        reason: `successor spawn error before ready: ${err.message}`
      });
    };
    const onDisconnect = () => {
      settle({
        ok: false,
        reason: "successor IPC disconnected before ready"
      });
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
    child.on("error", onError);
    child.on("disconnect", onDisconnect);
    const timer = setTimeout(() => {
      settle({
        ok: false,
        reason: `successor ready timed out after ${HANDOFF_READY_TIMEOUT_MS}ms`
      });
    }, HANDOFF_READY_TIMEOUT_MS);
  });
}
var HANDOFF_LISTENING_TIMEOUT_MS = 5000;
function commitAndWaitForListening(child, successorPid) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled)
        return;
      settled = true;
      child.removeListener("message", onMessage);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
      child.removeListener("disconnect", onDisconnect);
      clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (raw) => {
      const msg = raw;
      if (msg && typeof msg === "object" && msg.type === "upgrade-listening") {
        if (msg.successorPid !== successorPid) {
          settle({
            ok: false,
            reason: `successor listening pid mismatch: expected ${successorPid}, got ${String(msg.successorPid)}`
          });
          return;
        }
        settle({ ok: true, successorPid });
      } else if (msg && typeof msg === "object" && msg.type === "upgrade-nak") {
        settle({ ok: false, reason: msg.reason ?? "successor sent nak" });
      }
    };
    const onExit = (code, signal) => {
      settle({
        ok: false,
        reason: `successor exited after commit before listening (code=${code} signal=${signal})`
      });
    };
    const onError = (error) => {
      settle({
        ok: false,
        reason: `successor error after commit: ${error.message}`
      });
    };
    const onDisconnect = () => {
      settle({
        ok: false,
        reason: "successor IPC disconnected after commit before listening"
      });
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
    child.on("error", onError);
    child.on("disconnect", onDisconnect);
    const timer = setTimeout(() => settle({
      ok: false,
      reason: `successor listening proof timed out after ${HANDOFF_LISTENING_TIMEOUT_MS}ms`
    }), HANDOFF_LISTENING_TIMEOUT_MS);
    try {
      const commit = { type: "upgrade-commit" };
      child.send(commit, (error) => {
        if (error) {
          settle({
            ok: false,
            reason: `failed to send successor commit: ${error.message}`
          });
        }
      });
    } catch (error) {
      settle({
        ok: false,
        reason: `failed to send successor commit: ${error.message}`
      });
    }
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
// ../superset-pty-0.2.5/packages/pty-daemon/src/main.ts
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
  let handoffSocketPath;
  for (const arg of process.argv) {
    if (arg.startsWith("--snapshot=")) {
      snapshotPath = arg.slice("--snapshot=".length);
    } else if (arg.startsWith("--socket=")) {
      socketPath = arg.slice("--socket=".length);
    } else if (arg.startsWith("--handoff-socket=")) {
      handoffSocketPath = arg.slice("--handoff-socket=".length);
    }
  }
  if (!snapshotPath)
    throw new Error("--snapshot=PATH not set in argv");
  if (!socketPath)
    throw new Error("--socket=PATH not set in argv");
  const legacyPredecessor = handoffSocketPath === undefined;
  handoffSocketPath ??= path2.join(path2.dirname(socketPath), `.ptyd-h-${process.pid}-${Date.now().toString(36)}.sock`);
  if (typeof process.send !== "function") {
    throw new Error("handoff receiver requires an IPC channel (process.send)");
  }
  log(`snapshotPath=${snapshotPath} socketPath=${socketPath} handoffSocketPath=${handoffSocketPath}`);
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
    sendHandoffMessage(nak, log);
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
    sendHandoffMessage(nak, log);
    setTimeout(() => process.exit(1), 50).unref();
    return;
  }
  try {
    await server.listenForHandoff(handoffSocketPath);
  } catch (err) {
    const reason = `staging socket bind failed: ${err.message}`;
    log(reason);
    const nak = { type: "upgrade-nak", reason };
    sendHandoffMessage(nak, log);
    setTimeout(() => process.exit(1), 50).unref();
    return;
  }
  const commitPromise = waitForUpgradeCommit({ legacyPredecessor });
  log(`sending upgrade-ready`);
  const ready = {
    type: "upgrade-ready",
    successorPid: process.pid
  };
  const readySent = sendHandoffMessage(ready, log);
  const legacyAck = {
    type: "upgrade-ack",
    successorPid: process.pid
  };
  const legacyAckSent = sendHandoffMessage(legacyAck, log);
  if (!readySent && !legacyAckSent) {
    log("handoff IPC channel unavailable before READY");
    await server.close({ killSessions: false });
    process.exit(1);
    return;
  }
  let commitMode;
  try {
    commitMode = await commitPromise;
  } catch (err) {
    log(`handoff aborted before commit: ${err.message}`);
    await server.close({ killSessions: false });
    process.exit(1);
    return;
  }
  log(`${commitMode} commit received, publishing staged successor`);
  try {
    server.refreshAdoptedSnapshot(readSnapshot(snapshotPath));
    server.publishHandoffSocket(handoffSocketPath);
    server.scheduleAdoptedSessionActivation();
  } catch (err) {
    const reason = `commit refresh/publish failed: ${err.message}`;
    log(reason);
    const nak = { type: "upgrade-nak", reason };
    sendHandoffMessage(nak, log);
    setTimeout(() => process.exit(1), 50).unref();
    return;
  }
  log(`canonical socket published and listening`);
  const listening = {
    type: "upgrade-listening",
    successorPid: process.pid
  };
  sendHandoffMessage(listening, log);
  process.stderr.write(`[pty-daemon] (handoff successor) listening on ${socketPath} (v${daemonVersion}, host=${os2.hostname()}, sessions=${snapshot.sessions.length})
`);
  try {
    clearSnapshot(snapshotPath);
  } catch (error) {
    log(`snapshot cleanup failed after publish: ${error.message}`);
  }
  wireShutdown(server);
}
var HANDOFF_COMMIT_TIMEOUT_MS = 1e4;
function waitForUpgradeCommit(opts) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const settle = (result, error) => {
      if (settled)
        return;
      settled = true;
      process.off("message", onMessage);
      process.off("disconnect", onDisconnect);
      if (timer)
        clearTimeout(timer);
      if (error)
        reject(error);
      else
        resolve(result ?? "explicit");
    };
    const onMessage = (raw) => {
      const message = raw;
      if (message?.type === "upgrade-commit")
        settle("explicit");
    };
    const onDisconnect = () => {
      if (opts.legacyPredecessor)
        settle("legacy-disconnect");
      else
        settle(undefined, new Error("predecessor IPC disconnected before COMMIT"));
    };
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
    if (process.connected !== true) {
      onDisconnect();
      return;
    }
    timer = setTimeout(() => settle(undefined, new Error(`predecessor commit timed out after ${HANDOFF_COMMIT_TIMEOUT_MS}ms`)), HANDOFF_COMMIT_TIMEOUT_MS);
  });
}
function sendHandoffMessage(message, log) {
  if (typeof process.send !== "function" || process.connected !== true) {
    log(`IPC send skipped for ${message.type}: channel is disconnected`);
    return false;
  }
  try {
    process.send(message, (error) => {
      if (error)
        log(`IPC send failed for ${message.type}: ${error.message}`);
    });
    return true;
  } catch (error) {
    log(`IPC send threw for ${message.type}: ${error.message}`);
    return false;
  }
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
