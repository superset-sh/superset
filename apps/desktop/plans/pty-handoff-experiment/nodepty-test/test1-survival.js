// Test 1: Does a shell spawned via node-pty survive parent process exit on macOS?
//
// Workload: `echo PID:$$; sleep 3600`. We capture each shell's real PID from
// the PTY output, write it to a file, then exit. Externally we verify the
// shells are still alive.
//
// This isolates the C1 finding (spawn-helper kills bash on parent exit) without
// the SCM_RIGHTS handoff layer — purely the question "does node-pty's macOS
// architecture allow shell-survival on parent exit?"

const pty = require("node-pty");
const fs = require("fs");
const path = require("path");

const N = parseInt(process.env.N || "5", 10);
const OUT = process.env.OUT || "./survival-results.json";

const records = [];
for (let i = 0; i < N; i++) {
  const term = pty.spawn(
    "/bin/sh",
    ["-c", "echo PID:$$; sleep 3600"],
    { cols: 80, rows: 24 }
  );
  const rec = { idx: i, helperPid: term.pid, shellPid: null, output: "" };
  records.push(rec);
  term.onData((d) => {
    rec.output += d;
    const m = rec.output.match(/PID:(\d+)/);
    if (m && rec.shellPid === null) {
      rec.shellPid = parseInt(m[1], 10);
    }
  });
}

// Wait for all shells to print their PIDs, then write file and exit.
const start = Date.now();
const tick = setInterval(() => {
  if (records.every((r) => r.shellPid !== null) || Date.now() - start > 3000) {
    clearInterval(tick);
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        records.map((r) => ({
          idx: r.idx,
          helperPid: r.helperPid,
          shellPid: r.shellPid,
        })),
        null,
        2
      )
    );
    console.log(
      "Spawned " + N + " sessions; helperPid==shellPid for all? " +
      records.every((r) => r.helperPid === r.shellPid)
    );
    console.log("Sample:", records[0].helperPid, "->", records[0].shellPid);
    // Exit cleanly so we test the parent-death path under the simplest conditions.
    process.exit(0);
  }
}, 50);
