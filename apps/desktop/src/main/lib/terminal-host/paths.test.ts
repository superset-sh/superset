import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { getTerminalHostSocketPath, isTerminalHostNamedPipe } from "./paths";

describe("terminal-host paths", () => {
	it("uses a stable Windows named pipe instead of a socket file", () => {
		const socketPath = getTerminalHostSocketPath({
			homeDir: String.raw`C:\Users\Ada\.superset`,
			platform: "win32",
		});

		expect(socketPath).toMatch(
			/^\\\\\.\\pipe\\superset-terminal-host-[a-f0-9]{12}$/,
		);
		expect(isTerminalHostNamedPipe(socketPath)).toBe(true);
	});

	it("keeps Unix platforms on a filesystem socket", () => {
		const socketPath = getTerminalHostSocketPath({
			homeDir: "/Users/ada/.superset",
			platform: "darwin",
		});

		expect(socketPath).toBe(join("/Users/ada/.superset", "terminal-host.sock"));
		expect(isTerminalHostNamedPipe(socketPath)).toBe(false);
	});
});
