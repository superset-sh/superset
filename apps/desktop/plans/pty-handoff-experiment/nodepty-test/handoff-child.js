// Receives N inherited master fds at fds 3..3+N-1 and holds them open.
// Reads briefly to drain kernel buffers (avoid blocking the shells), then sleeps.
//
// argv: [N, holdSeconds]

const fs = require("fs");
const N = parseInt(process.argv[2] || "0", 10);
const HOLD = parseInt(process.argv[3] || "30", 10);

if (N === 0) {
  console.error("usage: handoff-child.js N HOLD_SECONDS");
  process.exit(2);
}

// Wrap each inherited fd as a ReadStream and consume bytes so the kernel
// PTY buffer doesn't fill. We just count bytes — don't care about the content.
const streams = [];
let totalBytes = 0;
for (let i = 0; i < N; i++) {
  const fd = 3 + i;
  const rs = fs.createReadStream(null, { fd, autoClose: false });
  rs.on("data", (chunk) => {
    totalBytes += chunk.length;
  });
  rs.on("error", (err) => {
    console.error(`fd ${fd} error:`, err.message);
  });
  streams.push(rs);
}

console.log(`[child pid=${process.pid}] holding ${N} master fds for ${HOLD}s`);

setInterval(() => {
  console.log(`[child pid=${process.pid}] alive, bytes read: ${totalBytes}`);
}, 5000);

setTimeout(() => {
  console.log(`[child pid=${process.pid}] exiting after ${HOLD}s`);
  process.exit(0);
}, HOLD * 1000);
