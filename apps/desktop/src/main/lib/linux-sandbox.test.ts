import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// ---- Mocks ----

// Mock child_process.execFileSync
const execFileSyncMock = mock(() => Buffer.from(""));
mock.module("node:child_process", () => ({
	execFileSync: execFileSyncMock,
}));

// Mock electron app.commandLine
const appendSwitchMock = mock(() => {});
mock.module("electron", () => ({
	app: {
		commandLine: {
			appendSwitch: appendSwitchMock,
		},
	},
}));

// ---- Helpers ----

function setPlatform(platform: string) {
	Object.defineProperty(process, "platform", {
		value: platform,
		writable: true,
		configurable: true,
	});
}

// ---- Tests ----

describe("linux-sandbox", () => {
	let originalPlatform: string;

	beforeEach(() => {
		originalPlatform = process.platform;
		execFileSyncMock.mockReset();
		appendSwitchMock.mockReset();
	});

	afterEach(() => {
		setPlatform(originalPlatform);
	});

	describe("isNamespaceSandboxAvailable", () => {
		test("returns true when unshare succeeds", async () => {
			execFileSyncMock.mockReturnValue(Buffer.from(""));
			const { isNamespaceSandboxAvailable } = await import("./linux-sandbox");
			// Re-import won't re-evaluate cached module, so call directly
			expect(isNamespaceSandboxAvailable()).toBe(true);
			expect(execFileSyncMock).toHaveBeenCalledWith(
				"unshare",
				["-Ur", "true"],
				{ timeout: 2000, stdio: "ignore" },
			);
		});

		test("returns false when unshare fails (AppArmor blocks it)", async () => {
			execFileSyncMock.mockImplementation(() => {
				throw new Error("unshare: unshare failed: Operation not permitted");
			});
			const { isNamespaceSandboxAvailable } = await import("./linux-sandbox");
			expect(isNamespaceSandboxAvailable()).toBe(false);
		});

		test("returns false when unshare binary is not found", async () => {
			execFileSyncMock.mockImplementation(() => {
				const err = new Error("spawn unshare ENOENT") as NodeJS.ErrnoException;
				err.code = "ENOENT";
				throw err;
			});
			const { isNamespaceSandboxAvailable } = await import("./linux-sandbox");
			expect(isNamespaceSandboxAvailable()).toBe(false);
		});
	});

	describe("applyLinuxSandboxFallback", () => {
		test("does nothing on non-Linux platforms", async () => {
			setPlatform("darwin");
			const { applyLinuxSandboxFallback } = await import("./linux-sandbox");
			const result = applyLinuxSandboxFallback();
			expect(result).toBe(false);
			expect(appendSwitchMock).not.toHaveBeenCalled();
		});

		test("does nothing on Windows", async () => {
			setPlatform("win32");
			const { applyLinuxSandboxFallback } = await import("./linux-sandbox");
			const result = applyLinuxSandboxFallback();
			expect(result).toBe(false);
			expect(appendSwitchMock).not.toHaveBeenCalled();
		});

		test("does nothing when namespace sandbox is available", async () => {
			setPlatform("linux");
			execFileSyncMock.mockReturnValue(Buffer.from(""));
			const { applyLinuxSandboxFallback } = await import("./linux-sandbox");
			const result = applyLinuxSandboxFallback();
			expect(result).toBe(false);
			expect(appendSwitchMock).not.toHaveBeenCalled();
		});

		test("appends --no-sandbox when namespace sandbox is blocked", async () => {
			setPlatform("linux");
			execFileSyncMock.mockImplementation(() => {
				throw new Error("Operation not permitted");
			});
			const { applyLinuxSandboxFallback } = await import("./linux-sandbox");
			const result = applyLinuxSandboxFallback();
			expect(result).toBe(true);
			expect(appendSwitchMock).toHaveBeenCalledWith("no-sandbox");
		});
	});
});
