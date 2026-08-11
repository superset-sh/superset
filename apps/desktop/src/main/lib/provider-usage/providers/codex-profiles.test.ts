import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CodexUsageSnapshot,
	createCodexLoginCommand,
	createCodexProfileStore,
	parseCodexIdentity,
	projectCachedWindows,
} from "./codex-profiles";

function base64Url(value: unknown): string {
	return Buffer.from(JSON.stringify(value))
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function authJson(accountId: string, email: string, plan = "pro"): string {
	const claims = {
		email,
		"https://api.openai.com/auth": {
			chatgpt_account_id: accountId,
			chatgpt_plan_type: plan,
		},
	};
	return JSON.stringify({
		tokens: {
			account_id: accountId,
			id_token: `${base64Url({ alg: "none" })}.${base64Url(claims)}.`,
		},
	});
}

describe("codex profile store", () => {
	let rootDir = "";
	let homeDir = "";

	beforeEach(async () => {
		rootDir = mkdtempSync(join(tmpdir(), "superset-codex-profiles-"));
		homeDir = join(rootDir, "home");
		await mkdir(join(homeDir, ".codex"), { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	test("imports the active Codex credential under a stable suggested profile name", async () => {
		writeFileSync(
			join(homeDir, ".codex", "auth.json"),
			authJson("acct_a", "person@example.com", "plus"),
		);
		const store = createCodexProfileStore({ rootDir, homeDir });

		const profile = await store.importActive();

		expect(profile.profileName).toBe("person-example-com");
		expect(profile.identity).toEqual({
			accountId: "acct_a",
			email: "person@example.com",
			plan: "plus",
		});
		expect(await store.listProfiles()).toEqual([
			{
				profileName: "person-example-com",
				identity: {
					accountId: "acct_a",
					email: "person@example.com",
					plan: "plus",
				},
				isActive: true,
			},
		]);
		expect(
			parseCodexIdentity(
				readFileSync(
					join(
						rootDir,
						"provider-usage",
						"codex",
						"profiles",
						"person-example-com",
						"auth.json",
					),
					"utf8",
				),
			)?.accountId,
		).toBe("acct_a");
	});

	test("switches profiles by backing up and atomically replacing active auth.json", async () => {
		writeFileSync(
			join(homeDir, ".codex", "auth.json"),
			authJson("acct_a", "first@example.com"),
		);
		const store = createCodexProfileStore({
			rootDir,
			homeDir,
			now: () => new Date("2026-08-11T10:15:00.000Z"),
			randomId: () => "swap-id",
		});
		await store.importActive();

		writeFileSync(
			join(homeDir, ".codex", "auth.json"),
			authJson("acct_b", "second@example.com"),
		);
		await store.importActive();

		await store.activate("first-example-com");

		expect(
			parseCodexIdentity(
				readFileSync(join(homeDir, ".codex", "auth.json"), "utf8"),
			)?.accountId,
		).toBe("acct_a");
		expect(
			parseCodexIdentity(
				readFileSync(
					join(
						rootDir,
						"provider-usage",
						"codex",
						"backups",
						"auth-2026-08-11T10-15-00.000Z-swap-id.json",
					),
					"utf8",
				),
			)?.accountId,
		).toBe("acct_b");
	});

	test("prunes old credential backups after switching profiles", async () => {
		writeFileSync(
			join(homeDir, ".codex", "auth.json"),
			authJson("acct_a", "first@example.com"),
		);
		let id = 0;
		const store = createCodexProfileStore({
			rootDir,
			homeDir,
			now: () => new Date("2026-08-11T10:15:00.000Z"),
			randomId: () => `id-${id++}`,
		});
		await store.importActive();
		writeFileSync(
			join(homeDir, ".codex", "auth.json"),
			authJson("acct_b", "second@example.com"),
		);
		await store.importActive();

		for (let index = 0; index < 7; index += 1) {
			await store.activate(
				index % 2 === 0 ? "first-example-com" : "second-example-com",
			);
		}

		const backups = readdirSync(
			join(rootDir, "provider-usage", "codex", "backups"),
		).filter((name) => name.startsWith("auth-"));
		expect(backups).toHaveLength(5);
	});

	test("rejects path-like profile names before reading or writing auth files", async () => {
		writeFileSync(
			join(homeDir, ".codex", "auth.json"),
			authJson("acct_a", "person@example.com"),
		);
		const store = createCodexProfileStore({ rootDir, homeDir });

		await expect(store.importActive("../escape")).rejects.toThrow(
			"Codex profile name is invalid.",
		);
		await expect(store.activate("../escape")).rejects.toThrow(
			"Codex profile name is invalid.",
		);
		await expect(store.activate("/tmp/escape")).rejects.toThrow(
			"Codex profile name is invalid.",
		);
	});

	test("filters expired cached windows instead of showing fabricated capacity", () => {
		const snapshot: CodexUsageSnapshot = {
			accountId: "acct_a",
			capturedAt: Date.parse("2026-08-11T10:00:00.000Z"),
			planLabel: "pro",
			windows: [
				{
					id: "primary",
					label: "5h",
					usedPercent: 80,
					remainingPercent: 20,
					resetAt: Date.parse("2026-08-11T09:59:00.000Z"),
					windowSeconds: 18_000,
				},
				{
					id: "secondary",
					label: "Weekly",
					usedPercent: 60,
					remainingPercent: 40,
					resetAt: Date.parse("2026-08-12T10:00:00.000Z"),
					windowSeconds: 604_800,
				},
			],
		};

		expect(
			projectCachedWindows(snapshot, Date.parse("2026-08-11T10:01:00.000Z")),
		).toEqual([
			{
				id: "secondary",
				label: "Weekly",
				usedPercent: 60,
				remainingPercent: 40,
				resetAt: Date.parse("2026-08-12T10:00:00.000Z"),
				windowSeconds: 604_800,
			},
		]);
	});

	test("runs Windows command shims through cmd.exe for Codex login", () => {
		expect(
			createCodexLoginCommand(
				"C:\\Users\\person\\AppData\\Roaming\\npm\\codex.cmd",
				{ ComSpec: "C:\\Windows\\System32\\cmd.exe" },
				"win32",
			),
		).toEqual({
			command: "C:\\Windows\\System32\\cmd.exe",
			args: [
				"/d",
				"/s",
				"/c",
				'"C:\\Users\\person\\AppData\\Roaming\\npm\\codex.cmd" login',
			],
		});

		expect(
			createCodexLoginCommand(
				"C:\\Program Files\\Codex\\codex.exe",
				{},
				"win32",
			),
		).toEqual({
			command: "C:\\Program Files\\Codex\\codex.exe",
			args: ["login"],
		});
	});
});
