import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-config-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { SUPERSET_CONFIG_PATH, writeConfig, writeConfigFile } = await import(
	"./config"
);

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("config writes", () => {
	test("writeConfig uses unique temp files", () => {
		const writtenPaths: string[] = [];
		const configPath = join(tempHome, "unique-temp-config.json");
		const testFs = {
			chmodSync: fs.chmodSync,
			mkdirSync: fs.mkdirSync,
			renameSync: fs.renameSync,
			statSync: fs.statSync,
			unlinkSync: fs.unlinkSync,
			writeFileSync: (
				path: fs.PathOrFileDescriptor,
				data: string | NodeJS.ArrayBufferView,
				options?: fs.WriteFileOptions,
			) => {
				writtenPaths.push(String(path));
				fs.writeFileSync(path, data, options);
			},
		};

		writeConfigFile(configPath, { apiKey: "sk_live_one" }, testFs);
		writeConfigFile(configPath, { apiKey: "sk_live_two" }, testFs);

		expect(writtenPaths).toHaveLength(2);
		expect(writtenPaths[0]).not.toBe(writtenPaths[1]);
		expect(writtenPaths.every((path) => path.endsWith(".config.tmp"))).toBe(
			true,
		);
		expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({
			apiKey: "sk_live_two",
		});
	});

	test("writeConfig preserves old config if rename fails", () => {
		const configPath = join(tempHome, "rename-failure-config.json");
		writeFileSync(configPath, JSON.stringify({ apiKey: "sk_live_old" }));
		const tempPaths: string[] = [];
		const testFs = {
			chmodSync: fs.chmodSync,
			mkdirSync: fs.mkdirSync,
			renameSync: () => {
				throw new Error("rename failed");
			},
			statSync: fs.statSync,
			unlinkSync: (path: fs.PathLike) => {
				tempPaths.push(String(path));
				fs.unlinkSync(path);
			},
			writeFileSync: fs.writeFileSync,
		};

		expect(() =>
			writeConfigFile(configPath, { apiKey: "sk_live_new" }, testFs),
		).toThrow(/rename failed/);

		expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({
			apiKey: "sk_live_old",
		});
		expect(tempPaths).toHaveLength(1);
		expect(fs.existsSync(tempPaths[0] ?? "")).toBe(false);
	});

	test("writeConfig writes the exported Superset config path", () => {
		writeConfig({ organizationId: "org_123" });

		expect(JSON.parse(readFileSync(SUPERSET_CONFIG_PATH, "utf-8"))).toEqual({
			organizationId: "org_123",
		});
	});
});
