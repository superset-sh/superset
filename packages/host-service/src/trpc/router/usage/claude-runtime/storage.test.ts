import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	discoverClaudeProfiles,
	keychainServicesForConfigDir,
} from "../profiles";
import { switchClaudeRuntimeAccount } from "./runtime";
import { createClaudeRuntimeStorage } from "./storage";

let home: string;
let secrets: Map<string, string>;
let directory: string;
let first: string;
let second: string;

function credential(token: string, email: string, expiresAt = 100) {
	return JSON.stringify({
		claudeAiOauth: {
			accessToken: token,
			refreshToken: `${token}-refresh`,
			email,
			expiresAt,
		},
	});
}

async function seed(path: string, token: string, email: string) {
	await mkdir(path, { recursive: true });
	await writeFile(join(path, ".credentials.json"), credential(token, email));
	await writeFile(
		join(path, ".claude.json"),
		JSON.stringify({ oauthAccount: { emailAddress: email }, theme: "dark" }),
	);
}

function storage() {
	return createClaudeRuntimeStorage({
		homeDir: home,
		directory,
		listProfiles: () => discoverClaudeProfiles([first, second]),
		readSecrets: async (service) =>
			secrets.has(service) ? [secrets.get(service) as string] : [],
		writeSecret: async (service, value) => {
			if (value === null) secrets.delete(service);
			else secrets.set(service, value);
		},
	});
}

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), "superset-claude-runtime-"));
	directory = join(home, "runtime");
	first = join(home, ".claude-one");
	second = join(home, ".claude-two");
	secrets = new Map();
	await seed(first, "one", "one@example.com");
	await seed(second, "two", "two@example.com");
});
afterEach(() => rm(home, { recursive: true, force: true }));

describe("Claude runtime credential storage", () => {
	it("switches a stable runtime path without overwriting either saved login", async () => {
		const s = storage();
		await switchClaudeRuntimeAccount(s, first, async () => {});
		await switchClaudeRuntimeAccount(s, second, async () => {});
		expect(await readFile(join(directory, ".credentials.json"), "utf8")).toBe(
			credential("two", "two@example.com"),
		);
		expect(await readFile(join(first, ".credentials.json"), "utf8")).toBe(
			credential("one", "one@example.com"),
		);
		expect(await readFile(join(second, ".credentials.json"), "utf8")).toBe(
			credential("two", "two@example.com"),
		);
		expect(
			secrets.get(keychainServicesForConfigDir(directory)[0] as string),
		).toBe(credential("two", "two@example.com"));
		for (const file of [
			".credentials.json",
			"selection.json",
			".claude.json",
		]) {
			expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
		}
	});

	it("restores every runtime surface and preserves a refreshed outgoing login after a failed switch", async () => {
		const s = storage();
		await switchClaudeRuntimeAccount(s, first, async () => {});
		const refreshed = credential("one-refreshed", "one@example.com", 200);
		await writeFile(join(directory, ".credentials.json"), refreshed);
		const before = await Promise.all(
			[".credentials.json", ".claude.json", "selection.json"].map((file) =>
				readFile(join(directory, file), "utf8"),
			),
		);
		const beforeSecrets = new Map(secrets);
		await expect(
			switchClaudeRuntimeAccount(s, second, async () => {
				throw new Error("commit failed");
			}),
		).rejects.toThrow("commit failed");
		expect(
			await Promise.all(
				[".credentials.json", ".claude.json", "selection.json"].map((file) =>
					readFile(join(directory, file), "utf8"),
				),
			),
		).toEqual(before);
		expect(
			secrets.get(keychainServicesForConfigDir(directory)[0] as string),
		).toBe(
			beforeSecrets.get(keychainServicesForConfigDir(directory)[0] as string),
		);
		expect(await readFile(join(first, ".credentials.json"), "utf8")).toBe(
			refreshed,
		);
	});

	it("rolls back an unsuccessful first activation", async () => {
		const s = storage();
		await expect(
			switchClaudeRuntimeAccount(s, first, async () => {
				throw new Error("commit failed");
			}),
		).rejects.toThrow("commit failed");
		expect(await s.readSelection()).toBeNull();
		expect(secrets.size).toBe(0);
		await expect(
			readFile(join(directory, ".credentials.json")),
		).rejects.toThrow();
	});

	it("preserves runtime settings when replacing account identity", async () => {
		await mkdir(directory);
		await writeFile(
			join(directory, ".claude.json"),
			JSON.stringify({ theme: "light", hasCompletedOnboarding: true }),
		);
		await switchClaudeRuntimeAccount(storage(), first, async () => {});
		expect(
			JSON.parse(await readFile(join(directory, ".claude.json"), "utf8")),
		).toEqual({
			theme: "light",
			hasCompletedOnboarding: true,
			oauthAccount: { emailAddress: "one@example.com" },
		});
	});

	it("does not overwrite malformed runtime settings", async () => {
		await mkdir(directory);
		await writeFile(join(directory, ".claude.json"), "malformed");
		await expect(
			switchClaudeRuntimeAccount(storage(), first, async () => {}),
		).rejects.toThrow();
		expect(await readFile(join(directory, ".claude.json"), "utf8")).toBe(
			"malformed",
		);
		expect(secrets.size).toBe(0);
	});

	it("restores the system-default login without altering its settings", async () => {
		await seed(join(home, ".claude"), "system", "system@example.com");
		await writeFile(
			join(home, ".claude.json"),
			JSON.stringify({
				oauthAccount: { emailAddress: "system@example.com" },
				theme: "system",
			}),
		);
		const s = storage();
		await switchClaudeRuntimeAccount(s, first, async () => {});
		await switchClaudeRuntimeAccount(s, null, async () => {});
		expect((await s.readRuntime()).credentials).toContain(
			credential("system", "system@example.com"),
		);
		expect(
			JSON.parse(await readFile(join(home, ".claude.json"), "utf8")).theme,
		).toBe("system");
	});
});
