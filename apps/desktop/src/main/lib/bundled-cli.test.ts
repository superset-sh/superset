import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
import {
	BUNDLED_CLI_SHIM_MARKER,
	buildBundledCliShim,
	getBundledCliBinaryName,
	getBundledCliShimName,
	installBundledCliShim,
} from "./bundled-cli";

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
		expect(statSync(shimPath).mode & 0o111).not.toBe(0);
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

	it("returns missing when the bundled binary is unavailable", () => {
		const status = installBundledCliShim({
			binDir,
			bundledCliPath: path.join(tempDir, "missing", "superset"),
			platform: "darwin",
		});

		expect(status).toBe("missing");
	});
});
