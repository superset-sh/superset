import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { recvFd, sendFd } from "./fd-passing-spike";

/**
 * This spike was written to validate SCM_RIGHTS FD passing between two
 * Node.js processes using the `node-unix-socket` npm package. The package
 * turned out to not expose any FD passing surface (its Seqpacket/Dgram
 * classes have no sendFd/recvFd equivalent) and its SOCK_SEQPACKET
 * transport is not available on macOS at all.
 *
 * The test below codifies that finding so the spike does not silently rot:
 * both `sendFd` and `recvFd` are expected to throw until a native N-API
 * addon replaces them (see Task 3.6 in the fresh-spawn plan).
 *
 * The commented-out block is the originally intended round-trip test. Bring
 * it back the moment a working `sendFd`/`recvFd` pair exists — whether
 * through a different npm package or a native addon.
 */
describe("fd-passing spike", () => {
	it("documents that node-unix-socket cannot move FDs via SCM_RIGHTS", async () => {
		expect(() => sendFd("/tmp/ignored.sock", 0, () => {})).toThrow(
			/does not support SCM_RIGHTS/i,
		);
		await expect(recvFd("/tmp/ignored.sock")).rejects.toThrow(
			/does not support SCM_RIGHTS/i,
		);
	});

	// Intended round-trip test. Re-enable when a working FD passing
	// implementation lands.
	it.skip("transfers a writable FD between two processes via UDS", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-spike-"));
		const sockPath = path.join(tmpDir, "spike.sock");
		const outFile = path.join(tmpDir, "received.txt");

		try {
			const fd = fs.openSync(outFile, "w");

			const senderReady = new Promise<void>((resolve) => {
				sendFd(sockPath, fd, resolve);
			});

			await senderReady;

			const received = await recvFd(sockPath);
			fs.writeSync(received, "hello");
			fs.closeSync(received);

			const content = fs.readFileSync(outFile, "utf8");
			expect(content).toBe("hello");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
