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
	for (const file of fs.readdirSync(tempHome)) {
		if (file.startsWith("config.json.") && file.endsWith(".tmp")) {
			fs.rmSync(path.join(tempHome, file), { force: true });
		}
	}
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
	it("writes config to a unique temp file before renaming it into place", () => {
		const config = {
			auth: {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60_000,
			},
		};
		const originalRenameSync = fs.renameSync;
		const tempPaths: string[] = [];
		const writeSpy = spyOn(fs, "writeFileSync");
		const renameSpy = spyOn(fs, "renameSync").mockImplementation(
			(oldPath: PathLike, newPath: PathLike) => {
				const tempPath = String(oldPath);
				tempPaths.push(tempPath);
				expect(tempPath).not.toBe(tmpPath);
				expect(tempPath.startsWith(`${configPath}.`)).toBe(true);
				expect(tempPath.endsWith(".tmp")).toBe(true);
				expect(newPath).toBe(configPath);
				expect(fs.existsSync(tempPath)).toBe(true);
				originalRenameSync(oldPath, newPath);
			},
		);

		writeConfig(config);

		expect(writeSpy).toHaveBeenCalledWith(
			tempPaths[0],
			JSON.stringify(config, null, 2),
			{ mode: 0o600, flag: "wx" },
		);
		expect(renameSpy).toHaveBeenCalledTimes(1);
		expect(tempPaths).toHaveLength(1);
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
		let pendingTmpPath: string | undefined;
		const renameSpy = spyOn(fs, "renameSync").mockImplementation(
			(oldPath: PathLike) => {
				pendingTmpPath = String(oldPath);
				throw new Error("simulated crash before rename");
			},
		);

		expect(() => writeConfig(nextConfig)).toThrow(
			"simulated crash before rename",
		);

		expect(JSON.parse(fs.readFileSync(configPath, "utf-8"))).toEqual(
			originalConfig,
		);
		expect(pendingTmpPath).toBeDefined();
		expect(pendingTmpPath).not.toBe(tmpPath);
		expect(JSON.parse(fs.readFileSync(pendingTmpPath!, "utf-8"))).toEqual(
			nextConfig,
		);

		renameSpy.mockRestore();
	});
});
