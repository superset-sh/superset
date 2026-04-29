// Receives N inherited master fds at fds 3..3+N-1, reads SEQ:N lines from each,
// verifies sequence continuity, reports per-session results to a JSON file.
//
// argv: [N, holdSeconds, outFile]

const fs = require("fs");
const N = parseInt(process.argv[2] || "0", 10);
const HOLD = parseInt(process.argv[3] || "5", 10);
const OUT = process.argv[4] || "./counter-child.json";

if (N === 0) {
  console.error("usage: counter-handoff-child.js N HOLD_SECONDS OUT");
  process.exit(2);
}

const sessions = new Array(N);
for (let i = 0; i < N; i++) {
  sessions[i] = {
    fd: 3 + i,
    bytes: 0,
    lines: 0,
    lastSeq: -1,
    gaps: [],
    partial: "",
  };
  const rs = fs.createReadStream(null, { fd: 3 + i, autoClose: false });
  const sess = sessions[i];
  rs.on("data", (chunk) => {
    sess.bytes += chunk.length;
    sess.partial += chunk.toString("utf8");
    let idx;
    while ((idx = sess.partial.indexOf("\n")) >= 0) {
      const line = sess.partial.slice(0, idx).replace(/\r$/, "");
      sess.partial = sess.partial.slice(idx + 1);
      const m = /^SEQ:(\d+)$/.exec(line);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      sess.lines++;
      if (sess.lastSeq === -1) {
        sess.lastSeq = n;
        continue;
      }
      const expected = sess.lastSeq + 1;
      if (n !== expected) sess.gaps.push({ expected, got: n });
      sess.lastSeq = n;
    }
  });
  rs.on("error", (err) => {
    sess.error = err.message;
  });
}

console.log(`[child pid=${process.pid}] reading ${N} master fds for ${HOLD}s`);

setTimeout(() => {
  const summary = sessions.map((s, i) => ({
    idx: i,
    bytes: s.bytes,
    lines: s.lines,
    lastSeq: s.lastSeq,
    gapCount: s.gaps.length,
    gaps: s.gaps.slice(0, 5),
    error: s.error || null,
  }));
  const allOk = summary.every((s) => s.bytes > 0 && s.gapCount === 0 && !s.error);
  fs.writeFileSync(OUT, JSON.stringify({ allOk, summary }, null, 2));
  console.log(
    `[child pid=${process.pid}] done. allOk=${allOk}. ` +
      summary.map((s) => `s${s.idx}=${s.bytes}b/${s.gapCount}gaps`).join(" ")
  );
  process.exit(allOk ? 0 : 1);
}, HOLD * 1000);
