import { describe, expect, test } from "bun:test";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSupersetConfigPath, writeConfig } from "./config";
import { withTempSupersetHome } from "./settings/test-helpers";

withTempSupersetHome("superset-cli-config-");

describe("config writes", () => {
	test("writeConfig uses unique temp files", () => {
		const writtenPaths: string[] = [];
		const recordingFs = {
			...nodeFs,
			writeFileSync: ((path, data, options) => {
				writtenPaths.push(String(path));
				return nodeFs.writeFileSync(path, data, options);
			}) as typeof nodeFs.writeFileSync,
		};

		writeConfig({ apiKey: "sk_live_one" }, recordingFs);
		writeConfig({ apiKey: "sk_live_two" }, recordingFs);

		const tempWrites = writtenPaths.filter((p) => p.endsWith(".config.tmp"));
		expect(tempWrites).toHaveLength(2);
		expect(tempWrites[0]).not.toBe(tempWrites[1]);
		expect(
			JSON.parse(nodeFs.readFileSync(getSupersetConfigPath(), "utf-8")),
		).toEqual({
			apiKey: "sk_live_two",
		});
	});

	test("writeConfig preserves old config if rename fails", () => {
		nodeFs.writeFileSync(
			getSupersetConfigPath(),
			JSON.stringify({ apiKey: "sk_live_old" }),
		);

		const unlinkedPaths: string[] = [];
		const failingFs = {
			...nodeFs,
			renameSync: () => {
				throw new Error("rename failed");
			},
			unlinkSync: ((path) => {
				unlinkedPaths.push(String(path));
				return nodeFs.unlinkSync(path);
			}) as typeof nodeFs.unlinkSync,
		};

		expect(() => writeConfig({ apiKey: "sk_live_new" }, failingFs)).toThrow(
			/rename failed/,
		);

		expect(
			JSON.parse(nodeFs.readFileSync(getSupersetConfigPath(), "utf-8")),
		).toEqual({
			apiKey: "sk_live_old",
		});
		expect(unlinkedPaths).toHaveLength(1);
		expect(nodeFs.existsSync(unlinkedPaths[0] ?? "")).toBe(false);
	});

	test("writeConfig writes the exported Superset config path", () => {
		writeConfig({ organizationId: "org_123" });

		expect(
			JSON.parse(nodeFs.readFileSync(getSupersetConfigPath(), "utf-8")),
		).toEqual({
			organizationId: "org_123",
		});
	});

	test("writeConfig writes through a symlinked config.json", () => {
		const dotfiles = nodeFs.mkdtempSync(join(tmpdir(), "superset-dotfiles-"));
		const real = join(dotfiles, "superset-config.json");
		nodeFs.writeFileSync(real, JSON.stringify({ apiKey: "sk_live_old" }));
		nodeFs.rmSync(getSupersetConfigPath(), { force: true });
		nodeFs.symlinkSync(real, getSupersetConfigPath());

		writeConfig({ organizationId: "org_linked" });

		expect(nodeFs.statSync(getSupersetConfigPath()).isSymbolicLink()).toBe(
			false,
		);
		expect(nodeFs.lstatSync(getSupersetConfigPath()).isSymbolicLink()).toBe(
			true,
		);
		expect(JSON.parse(nodeFs.readFileSync(real, "utf-8"))).toEqual({
			organizationId: "org_linked",
		});
		nodeFs.rmSync(dotfiles, { recursive: true, force: true });
	});
});
