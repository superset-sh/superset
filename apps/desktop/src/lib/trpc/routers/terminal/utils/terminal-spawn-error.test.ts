import { describe, expect, it } from "bun:test";
import {
	isTerminalSpawnFailedError,
	TerminalSpawnFailedError,
} from "main/lib/terminal/errors";
import { toTerminalSpawnError } from "./terminal-spawn-error";

describe("isTerminalSpawnFailedError", () => {
	it("does not match the legacy plain-string spawn failure", () => {
		expect(
			isTerminalSpawnFailedError(
				new Error(
					"CREATE_ATTACH_FAILED: Session spawn failed: PTY process exited immediately",
				),
			),
		).toBe(false);
	});

	it("does not match a request timeout or a daemon connection failure", () => {
		expect(
			isTerminalSpawnFailedError(new Error("Request timeout: createOrAttach")),
		).toBe(false);
		expect(isTerminalSpawnFailedError(new Error("Connection lost"))).toBe(
			false,
		);
	});

	it("matches by name so an instance that lost its prototype still counts", () => {
		const error = new TerminalSpawnFailedError({
			kind: "PTY_SPAWN_TIMEOUT",
			shell: "/bin/zsh",
		});
		const detached = Object.assign(new Error(error.message), {
			name: error.name,
			cause: error.cause,
		});
		expect(isTerminalSpawnFailedError(detached)).toBe(true);
	});
});

describe("toTerminalSpawnError", () => {
	it("turns a shell that exited before it was ready into a non-500 that names the shell and its first line", () => {
		const trpcError = toTerminalSpawnError(
			new TerminalSpawnFailedError({
				kind: "SHELL_EXITED",
				shell: "/opt/homebrew/bin/fish",
				args: ["-l"],
				exitCode: 1,
				outputHead: "\x1b[31mfish: Unknown command\x1b[0m\r\nmore\r\n",
			}),
		);
		expect(trpcError.code).toBe("PRECONDITION_FAILED");
		expect(trpcError.message).toBe(
			"Your shell (/opt/homebrew/bin/fish) exited immediately with code 1: fish: Unknown command",
		);
		expect(trpcError.cause).toMatchObject({
			kind: "SHELL_EXITED",
			exitCode: 1,
		});
	});

	it("keeps a PTY that could not be opened as a 500 that carries the helper's reason", () => {
		const trpcError = toTerminalSpawnError(
			new TerminalSpawnFailedError({
				kind: "PTY_SPAWN_FAILED",
				shell: "/bin/zsh",
				exitCode: 1,
				error: "Spawn failed: posix_spawn failed: EAGAIN",
			}),
		);
		expect(trpcError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(trpcError.message).toBe(
			"Could not open a PTY for /bin/zsh: Spawn failed: posix_spawn failed: EAGAIN",
		);
	});

	it("keeps a PTY ready timeout as a 500", () => {
		const trpcError = toTerminalSpawnError(
			new TerminalSpawnFailedError({
				kind: "PTY_SPAWN_TIMEOUT",
				shell: "/bin/zsh",
			}),
		);
		expect(trpcError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(trpcError.message).toBe("Timed out waiting for a PTY for /bin/zsh");
	});
});
