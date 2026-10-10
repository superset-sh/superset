import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
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

	it("installs an executable managed shim into the terminal bin directory", async () => {
		const status = await installBundledCliShim({
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

	it("updates an existing managed shim", async () => {
		const shimPath = path.join(binDir, "superset");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(shimPath, `${BUNDLED_CLI_SHIM_MARKER}\nold\n`, {
			mode: 0o755,
		});

		const status = await installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});

		expect(status).toBe("installed");
		expect(readFileSync(shimPath, "utf-8")).toContain(bundledCliPath);
	});

	it.skipIf(process.platform === "win32")(
		"reuses the persistent Linux CLI across AppImage remounts",
		async () => {
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			const cliPath = path.join(binDir, ".superset-cli", "superset");
			const installed = statSync(cliPath);
			const source = statSync(bundledCliPath);
			const nextPath = path.join(tempDir, "next-mount", "superset");
			mkdirSync(path.dirname(nextPath));
			copyFileSync(bundledCliPath, nextPath);
			utimesSync(nextPath, source.atime, source.mtime);
			await installBundledCliShim({
				binDir,
				bundledCliPath: nextPath,
				platform: "linux",
			});
			expect(statSync(cliPath).ino).toBe(installed.ino);
			expect(statSync(cliPath).mtimeMs).toBe(installed.mtimeMs);
		},
	);

	it.skipIf(process.platform === "win32")(
		"refreshes a same-sized Linux CLI rebuilt at the same path",
		async () => {
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			const source = statSync(bundledCliPath);
			writeFileSync(bundledCliPath, "#!/bin/xx\n");
			utimesSync(bundledCliPath, source.atime, new Date(source.mtimeMs + 1000));
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			expect(
				readFileSync(path.join(binDir, ".superset-cli", "superset"), "utf8"),
			).toBe("#!/bin/xx\n");
		},
	);

	it.skipIf(process.platform === "win32")(
		"installs a usable Linux CLI when cache metadata cannot be persisted",
		async () => {
			const cliDir = path.join(binDir, ".superset-cli");
			mkdirSync(path.join(cliDir, "installed.json"), { recursive: true });
			writeFileSync(bundledCliPath, '#!/bin/sh\nprintf "available\\n"\n');
			for (let launch = 0; launch < 2; launch++) {
				expect(
					await installBundledCliShim({
						binDir,
						bundledCliPath,
						platform: "linux",
					}),
				).toBe("installed");
				expect(
					readdirSync(cliDir).some((name) => name.startsWith(".install-")),
				).toBe(false);
			}
			rmSync(path.join(tempDir, "resources"), { recursive: true });
			const result = spawnSync(path.join(binDir, "superset"));
			expect(result.status).toBe(0);
			expect(result.stdout.toString()).toBe("available\n");
		},
	);

	it.skipIf(process.platform === "win32")(
		"repairs a modified persistent Linux CLI",
		async () => {
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			const cliPath = path.join(binDir, ".superset-cli", "superset");
			writeFileSync(cliPath, "broken");
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			expect(readFileSync(cliPath, "utf8")).toBe(
				readFileSync(bundledCliPath, "utf8"),
			);
		},
	);

	it.skipIf(process.platform === "win32")(
		"runs the Linux CLI after its AppImage resources disappear",
		async () => {
			binDir = path.join(tempDir, "user's bin");
			writeFileSync(bundledCliPath, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			expect(readFileSync(path.join(binDir, "superset"), "utf-8")).toContain(
				BUNDLED_CLI_SHIM_MARKER,
			);
			rmSync(path.join(tempDir, "resources"), { recursive: true });

			const result = spawnSync(path.join(binDir, "superset"), [
				"--version",
				"argument with spaces",
			]);

			expect(result.status).toBe(0);
			expect(result.stdout.toString()).toBe(
				"--version\nargument with spaces\n",
			);
		},
	);

	it.skipIf(process.platform === "win32")(
		"refreshes the persistent Linux CLI on the next desktop launch",
		async () => {
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			const nextCliPath = path.join(tempDir, "next-mount", "superset");
			mkdirSync(path.dirname(nextCliPath));
			writeFileSync(nextCliPath, '#!/bin/sh\nprintf "updated\\n"\n');

			await installBundledCliShim({
				binDir,
				bundledCliPath: nextCliPath,
				platform: "linux",
			});
			rmSync(path.dirname(nextCliPath), { recursive: true });

			const result = spawnSync(path.join(binDir, "superset"));
			expect(result.status).toBe(0);
			expect(result.stdout.toString()).toBe("updated\n");
		},
	);

	it.skipIf(process.platform === "win32")(
		"keeps the previous Linux CLI usable when copying its replacement fails",
		async () => {
			writeFileSync(bundledCliPath, '#!/bin/sh\nprintf "previous\\n"\n');
			await installBundledCliShim({
				binDir,
				bundledCliPath,
				platform: "linux",
			});
			await expect(
				installBundledCliShim({
					binDir,
					bundledCliPath: path.dirname(bundledCliPath),
					platform: "linux",
				}),
			).rejects.toThrow();
			rmSync(path.join(tempDir, "resources"), { recursive: true });

			const result = spawnSync(path.join(binDir, "superset"));
			expect(result.status).toBe(0);
			expect(result.stdout.toString()).toBe("previous\n");
		},
	);

	it.each([
		"darwin",
		"linux",
	] as const)("does not overwrite an unmanaged superset executable on %s", async (platform) => {
		const shimPath = path.join(binDir, "superset");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(shimPath, "#!/bin/sh\necho custom\n", { mode: 0o755 });
		chmodSync(shimPath, 0o755);

		const status = await installBundledCliShim({
			binDir,
			bundledCliPath,
			platform,
		});

		expect(status).toBe("skipped");
		expect(readFileSync(shimPath, "utf-8")).toBe("#!/bin/sh\necho custom\n");
	});

	it("returns missing when the bundled binary is unavailable", async () => {
		const status = await installBundledCliShim({
			binDir,
			bundledCliPath: path.join(tempDir, "missing", "superset"),
			platform: "darwin",
		});

		expect(status).toBe("missing");
	});
});
