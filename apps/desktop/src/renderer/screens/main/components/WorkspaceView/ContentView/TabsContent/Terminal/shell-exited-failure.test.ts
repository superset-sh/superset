import { describe, expect, it } from "bun:test";
import { getShellExitedFailure } from "./shell-exited-failure";

describe("getShellExitedFailure", () => {
	it("returns the failure for a SHELL_EXITED cause", () => {
		expect(
			getShellExitedFailure({
				message: "Your shell (/bin/zsh) exited immediately with code 1",
				data: {
					code: "PRECONDITION_FAILED",
					cause: {
						kind: "SHELL_EXITED",
						shell: "/bin/zsh",
						args: ["-l"],
						exitCode: 1,
						outputHead: "bad rc\r\n",
					},
				},
			}),
		).toEqual({
			message: "Your shell (/bin/zsh) exited immediately with code 1",
			exitCode: 1,
			signal: undefined,
			outputHead: "bad rc\r\n",
		});
	});

	it("ignores errors without a cause, with another cause, or with a malformed one", () => {
		expect(getShellExitedFailure(new Error("Connection lost"))).toBeNull();
		expect(
			getShellExitedFailure({
				message: "disposed",
				data: { cause: { kind: "TERMINAL_HOST_CLIENT_DISPOSED" } },
			}),
		).toBeNull();
		expect(
			getShellExitedFailure({
				message: "x",
				data: { cause: { kind: "SHELL_EXITED", exitCode: "1" } },
			}),
		).toBeNull();
	});
});
