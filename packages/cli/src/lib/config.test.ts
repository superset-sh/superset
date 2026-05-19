import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import type { PathLike } from "node:fs";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "superset-cli-config-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { readConfig, writeConfig } = await import("./config");

const configPath = path.join(tempHome, "config.json");
const tmpPath = `${configPath}.tmp`;

function removeConfigFiles(): void {
	fs.rmSync(configPath, { force: true });
	fs.rmSync(tmpPath, { force: true });
}

afterEach(() => {
	removeConfigFiles();
});

afterAll(() => {
	fs.rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("writeConfig", () => {
	it("writes config to a temp file before renaming it into place", () => {
		const config = {
			auth: {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		};
		const originalRenameSync = fs.renameSync;
		const writeSpy = spyOn(fs, "writeFileSync");
		const renameSpy = spyOn(fs, "renameSync").mockImplementation(
			(oldPath: PathLike, newPath: PathLike) => {
				expect(oldPath).toBe(tmpPath);
				expect(newPath).toBe(configPath);
				expect(fs.existsSync(tmpPath)).toBe(true);
				originalRenameSync(oldPath, newPath);
			},
		);

		writeConfig(config);

		expect(writeSpy).toHaveBeenCalledWith(
			tmpPath,
			JSON.stringify(config, null, 2),
			{ mode: 0o600 },
		);
		expect(renameSpy).toHaveBeenCalledTimes(1);
		expect(readConfig()).toEqual(config);
		expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);

		writeSpy.mockRestore();
		renameSpy.mockRestore();
	});

	it("leaves the previous config intact when the process stops before rename", () => {
		const originalConfig = {
			auth: {
				accessToken: "old-access-token",
				refreshToken: "old-refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		};
		const nextConfig = {
			auth: {
				accessToken: "new-access-token",
				refreshToken: "new-refresh-token",
				expiresAt: Date.now() + 120_000,
			},
		};

		writeConfig(originalConfig);
		const renameSpy = spyOn(fs, "renameSync").mockImplementation(() => {
			throw new Error("simulated crash before rename");
		});

		expect(() => writeConfig(nextConfig)).toThrow(
			"simulated crash before rename",
		);

		expect(JSON.parse(fs.readFileSync(configPath, "utf-8"))).toEqual(
			originalConfig,
		);
		expect(JSON.parse(fs.readFileSync(tmpPath, "utf-8"))).toEqual(nextConfig);

		renameSpy.mockRestore();
	});
});
