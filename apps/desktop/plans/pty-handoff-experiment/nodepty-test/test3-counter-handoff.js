// Test 3: counter-workload handoff — verifies the inheriting child not only
// keeps shells alive but actually receives bytes from them after parent exit.
// Each session emits SEQ:N continuously; child reports total bytes received
// and verifies sequence continuity.

const pty = require("node-pty");
const fs = require("fs");
const cp = require("child_process");
const path = require("path");

const N = parseInt(process.env.N || "5", 10);
const OUT = process.env.OUT || "./run-counter.json";
const HOLD_SECONDS = parseInt(process.env.HOLD_SECONDS || "5", 10);

const records = [];
for (let i = 0; i < N; i++) {
  const term = pty.spawn(
    "/bin/sh",
    ["-c", "echo PID:$$; i=0; while :; do echo SEQ:$i; i=$((i+1)); done"],
    { cols: 80, rows: 24 }
  );
  const rec = { idx: i, helperPid: term.pid, shellPid: null, output: "", masterFd: term._fd };
  records.push(rec);
  term.onData((d) => {
    rec.output += d;
    const m = rec.output.match(/PID:(\d+)/);
    if (m && rec.shellPid === null) rec.shellPid = parseInt(m[1], 10);
  });
}

const start = Date.now();
const tick = setInterval(() => {
  if (records.every((r) => r.shellPid !== null) || Date.now() - start > 3000) {
    clearInterval(tick);

    const stdio = ["ignore", "inherit", "inherit"];
    for (const r of records) stdio.push(r.masterFd);

    const child = cp.spawn(
      process.execPath,
      [
        path.join(__dirname, "counter-handoff-child.js"),
        String(records.length),
        String(HOLD_SECONDS),
        OUT.replace(/\.json$/, ".child.json"),
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
          handoffStartedAt: new Date().toISOString(),
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
      `[parent pid=${process.pid}] handed off ${N} sessions to child pid=${child.pid}; exiting`
    );
    setTimeout(() => process.exit(0), 100);
  }
}, 50);
