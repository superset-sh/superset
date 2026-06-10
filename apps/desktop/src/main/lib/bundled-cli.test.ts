import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.module("electron", () => ({
	app: {
		getAppPath: () => process.cwd(),
		isPackaged: false,
	},
}));

const {
	BUNDLED_CLI_SHIM_MARKER,
	buildBundledCliShim,
	getBundledCliBinaryName,
	getBundledCliShimName,
	installBundledCliShim,
} = await import("./bundled-cli");

describe("bundled CLI", () => {
	let tempDir: string;
	let binDir: string;
	let bundledCliPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), "superset-bundled-cli-"));
		binDir = path.join(tempDir, "bin");
		bundledCliPath = path.join(tempDir, "resources", "bin", "superset");
		mkdirSync(path.dirname(bundledCliPath), { recursive: true });
		writeFileSync(bundledCliPath, "#!/bin/sh\n", { mode: 0o755 });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("uses the platform-specific binary and shim names", () => {
		expect(getBundledCliBinaryName("darwin")).toBe("superset");
		expect(getBundledCliShimName("darwin")).toBe("superset");
		expect(getBundledCliBinaryName("win32")).toBe("superset.exe");
		expect(getBundledCliShimName("win32")).toBe("superset.cmd");
	});

	it("builds a POSIX shim that execs the bundled binary safely", () => {
		const cliPath =
			"/Applications/Superset Test.app/Contents/Resources/bin/super'set";
		const shim = buildBundledCliShim(cliPath, "darwin");

		expect(shim).toContain(BUNDLED_CLI_SHIM_MARKER);
		expect(shim).toContain(
			`exec '/Applications/Superset Test.app/Contents/Resources/bin/super'"'"'set' "$@"`,
		);
	});

	it("builds a Windows cmd shim for the bundled executable", () => {
		const cliPath = String.raw`C:\Program Files\Superset\resources\bin\superset.exe`;
		const shim = buildBundledCliShim(cliPath, "win32");

		expect(shim).toContain(BUNDLED_CLI_SHIM_MARKER);
		expect(shim).toBe(
			`@echo off\r\nrem ${BUNDLED_CLI_SHIM_MARKER}\r\n"C:\\Program Files\\Superset\\resources\\bin\\superset.exe" %*\r\n`,
		);
	});

	it("installs an executable managed shim into the terminal bin directory", () => {
		const status = installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});
		const shimPath = path.join(binDir, "superset");

		expect(status).toBe("installed");
		expect(existsSync(shimPath)).toBe(true);
		expect(readFileSync(shimPath, "utf-8")).toContain(BUNDLED_CLI_SHIM_MARKER);
		if (process.platform !== "win32") {
			expect(statSync(shimPath).mode & 0o111).not.toBe(0);
		}
	});

	it("updates an existing managed shim", () => {
		const shimPath = path.join(binDir, "superset");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(shimPath, `${BUNDLED_CLI_SHIM_MARKER}\nold\n`, {
			mode: 0o755,
		});

		const status = installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});

		expect(status).toBe("installed");
		expect(readFileSync(shimPath, "utf-8")).toContain(bundledCliPath);
	});

	it("does not overwrite an unmanaged superset executable", () => {
		const shimPath = path.join(binDir, "superset");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(shimPath, "#!/bin/sh\necho custom\n", { mode: 0o755 });
		chmodSync(shimPath, 0o755);

		const status = installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});

		expect(status).toBe("skipped");
		expect(readFileSync(shimPath, "utf-8")).toBe("#!/bin/sh\necho custom\n");
	});

	it("installs a managed Windows cmd shim", () => {
		const windowsCliPath = path.join(
			tempDir,
			"resources",
			"bin",
			"superset.exe",
		);
		writeFileSync(windowsCliPath, "");

		const status = installBundledCliShim({
			binDir,
			bundledCliPath: windowsCliPath,
			platform: "win32",
		});
		const shimPath = path.join(binDir, "superset.cmd");
		const shim = readFileSync(shimPath, "utf-8");

		expect(status).toBe("installed");
		expect(shim).toContain(BUNDLED_CLI_SHIM_MARKER);
		expect(shim).toContain(`"${windowsCliPath}" %*`);
	});

	it("returns missing when the bundled binary is unavailable", () => {
		const status = installBundledCliShim({
			binDir,
			bundledCliPath: path.join(tempDir, "missing", "superset"),
			platform: "darwin",
		});

		expect(status).toBe("missing");
	});
});
