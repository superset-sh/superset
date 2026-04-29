// Test 2: Does a shell spawned via node-pty survive parent exit when ANOTHER
// process holds the master fd?
//
// This is the analog of the Go harness's C2 test, but with node-pty as the
// spawner. Strategy: parent spawns N pty sessions via node-pty, then spawns a
// child node process via child_process.spawn with the master fds passed
// through `stdio` (fd inheritance — kernel-level dup, refcount stays > 0
// across parent exit). Parent writes PIDs to a file and exits. Child holds the
// fds and sleeps. We externally verify the shell PIDs are still alive.
//
// Equivalent in spirit to SCM_RIGHTS handoff for survival purposes; uses fd
// inheritance because it's the simplest cross-process fd transfer in pure Node.

const pty = require("node-pty");
const fs = require("fs");
const cp = require("child_process");
const path = require("path");

const N = parseInt(process.env.N || "5", 10);
const OUT = process.env.OUT || "./run-handoff.json";
const HOLD_SECONDS = parseInt(process.env.HOLD_SECONDS || "30", 10);

const records = [];
for (let i = 0; i < N; i++) {
  const term = pty.spawn(
    "/bin/sh",
    ["-c", "echo PID:$$; sleep 3600"],
    { cols: 80, rows: 24 }
  );
  const rec = { idx: i, helperPid: term.pid, shellPid: null, output: "", masterFd: term._fd };
  records.push(rec);
  term.onData((d) => {
    rec.output += d;
    const m = rec.output.match(/PID:(\d+)/);
    if (m && rec.shellPid === null) {
      rec.shellPid = parseInt(m[1], 10);
    }
  });
}

// Wait until every session has emitted its PID, then start handoff.
const start = Date.now();
const tick = setInterval(() => {
  if (records.every((r) => r.shellPid !== null) || Date.now() - start > 3000) {
    clearInterval(tick);

    // Build stdio array: ignore stdin, inherit stderr+stdout (for child diagnostics),
    // then pass each master fd in order.
    const stdio = ["ignore", "inherit", "inherit"];
    for (const r of records) stdio.push(r.masterFd);

    // Spawn child holder. Detach so it survives parent exit cleanly (own session).
    const child = cp.spawn(
      process.execPath,
      [
        path.join(__dirname, "handoff-child.js"),
        String(records.length),
        String(HOLD_SECONDS),
      ],
      { stdio, detached: true }
    );
    child.unref();

    fs.writeFileSync(
      OUT,
      JSON.stringify(
        {
          parentPid: process.pid,
          childPid: child.pid,
          sessions: records.map((r) => ({
            idx: r.idx,
            helperPid: r.helperPid,
            shellPid: r.shellPid,
          })),
        },
        null,
        2
      )
    );
    console.log(
      `Spawned ${N} sessions, handed off to child pid=${child.pid}, exiting parent`
    );

    // Brief pause to let the child fully start before parent exits (paranoia).
    setTimeout(() => process.exit(0), 100);
  }
}, 50);
