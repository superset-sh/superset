import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTerminalHostSocketPath } from "../lib/terminal-host/paths";

export function supportsLocalSocketBinding(): boolean {
	const probeDir = mkdtempSync(
		join(realpathSync(tmpdir()), "superset-socket-probe-"),
	);
	const probeSocketPath = getTerminalHostSocketPath({
		homeDir:
			process.platform === "win32" ? join(probeDir, randomUUID()) : probeDir,
	});

	try {
		const evalScript = `
const { createServer } = require("node:net");
const { unlinkSync } = require("node:fs");
const socketPath = ${JSON.stringify(probeSocketPath)};
const server = createServer();
server.on("error", () => process.exit(1));
server.listen(socketPath, () => {
	server.close(() => {
		try { unlinkSync(socketPath); } catch {}
		process.exit(0);
	});
});
`;

		const result = spawnSync(process.execPath, ["--eval", evalScript], {
			env: process.env,
			stdio: "ignore",
		});
		return result.status === 0;
	} catch {
		return false;
	} finally {
		rmSync(probeDir, { recursive: true, force: true });
	}
}
