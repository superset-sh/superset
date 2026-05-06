import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { configRouter } from "./config";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
// Valid v4 UUID — zod's .uuid() rejects all-1s.
const PROJECT_ID = "1f0e8c7e-1234-4abc-8def-0123456789ab";

interface Sandbox {
	repoPath: string;
	cleanup: () => void;
}

function createRepo(): Sandbox {
	const root = mkdtempSync(join(tmpdir(), "config-router-test-"));
	const repoPath = join(root, "repo");
	mkdirSync(repoPath, { recursive: true });
	return {
		repoPath,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

function createCaller(repoPath: string) {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(schema.projects).values({ id: PROJECT_ID, repoPath }).run();
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return configRouter.createCaller(ctx);
}

describe("configRouter", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createRepo();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	describe("getConfigContent", () => {
		it("returns null content when config.json doesn't exist", async () => {
			const caller = createCaller(sandbox.repoPath);
			const result = await caller.getConfigContent({ projectId: PROJECT_ID });
			expect(result).toEqual({ content: null, exists: false });
		});

		it("returns raw content when config.json exists", async () => {
			const caller = createCaller(sandbox.repoPath);
			const dir = join(sandbox.repoPath, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "config.json"),
				`{"setup":["bun install"]}`,
				"utf-8",
			);

			const result = await caller.getConfigContent({ projectId: PROJECT_ID });
			expect(result.exists).toBe(true);
			expect(result.content).toBe(`{"setup":["bun install"]}`);
		});

		it("throws NOT_FOUND when project isn't registered locally", async () => {
			const caller = createCaller(sandbox.repoPath);
			await expect(
				caller.getConfigContent({
					projectId: "2f0e8c7e-1234-4abc-8def-0123456789ab",
				}),
			).rejects.toThrow(/Project not set up locally/);
		});
	});

	describe("updateConfig", () => {
		it("creates .superset/config.json on first save", async () => {
			const caller = createCaller(sandbox.repoPath);
			await caller.updateConfig({
				projectId: PROJECT_ID,
				setup: ["bun install"],
				teardown: [],
			});

			const configPath = join(sandbox.repoPath, ".superset", "config.json");
			expect(existsSync(configPath)).toBe(true);
			const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
			expect(parsed).toEqual({ setup: ["bun install"], teardown: [] });
		});

		it("preserves the existing run array on subsequent saves", async () => {
			const caller = createCaller(sandbox.repoPath);
			const dir = join(sandbox.repoPath, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "config.json"),
				JSON.stringify({
					setup: ["old"],
					teardown: ["old-down"],
					run: ["bun run dev"],
				}),
				"utf-8",
			);

			await caller.updateConfig({
				projectId: PROJECT_ID,
				setup: ["bun install"],
				teardown: ["docker compose down"],
			});

			const parsed = JSON.parse(
				readFileSync(join(dir, "config.json"), "utf-8"),
			);
			expect(parsed).toEqual({
				setup: ["bun install"],
				teardown: ["docker compose down"],
				run: ["bun run dev"],
			});
		});

		it("preserves unrelated top-level keys (forward compatibility)", async () => {
			const caller = createCaller(sandbox.repoPath);
			const dir = join(sandbox.repoPath, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "config.json"),
				JSON.stringify({
					setup: [],
					teardown: [],
					somethingNew: { nested: true },
				}),
				"utf-8",
			);

			await caller.updateConfig({
				projectId: PROJECT_ID,
				setup: ["x"],
				teardown: [],
			});

			const parsed = JSON.parse(
				readFileSync(join(dir, "config.json"), "utf-8"),
			);
			expect(parsed.somethingNew).toEqual({ nested: true });
			expect(parsed.setup).toEqual(["x"]);
		});

		it("overwrites a malformed config.json with a fresh shape", async () => {
			// Documents the current behavior: a corrupt file is silently replaced.
			// Surfaced in the smoke-test list as a known-but-accepted edge case.
			const caller = createCaller(sandbox.repoPath);
			const dir = join(sandbox.repoPath, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "config.json"), "{not valid json,,,", "utf-8");

			await caller.updateConfig({
				projectId: PROJECT_ID,
				setup: ["new"],
				teardown: [],
			});

			const parsed = JSON.parse(
				readFileSync(join(dir, "config.json"), "utf-8"),
			);
			expect(parsed).toEqual({ setup: ["new"], teardown: [] });
		});
	});

	describe("shouldShowSetupCard", () => {
		it("returns true when no config exists", async () => {
			const caller = createCaller(sandbox.repoPath);
			expect(await caller.shouldShowSetupCard({ projectId: PROJECT_ID })).toBe(
				true,
			);
		});

		it("returns false once setup is non-empty", async () => {
			const caller = createCaller(sandbox.repoPath);
			await caller.updateConfig({
				projectId: PROJECT_ID,
				setup: ["bun install"],
				teardown: [],
			});
			expect(await caller.shouldShowSetupCard({ projectId: PROJECT_ID })).toBe(
				false,
			);
		});

		it("returns true when config exists but all arrays are empty", async () => {
			const caller = createCaller(sandbox.repoPath);
			await caller.updateConfig({
				projectId: PROJECT_ID,
				setup: [],
				teardown: [],
			});
			expect(await caller.shouldShowSetupCard({ projectId: PROJECT_ID })).toBe(
				true,
			);
		});

		it("returns false when only teardown is defined (setup key absent)", async () => {
			// Different from "all-empty arrays": here there's no setup key at all.
			// Card should still hide because teardown counts as configured.
			const caller = createCaller(sandbox.repoPath);
			const dir = join(sandbox.repoPath, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "config.json"),
				JSON.stringify({ teardown: ["docker compose down"] }),
				"utf-8",
			);

			expect(await caller.shouldShowSetupCard({ projectId: PROJECT_ID })).toBe(
				false,
			);
		});

		it("returns false when only the run key is set", async () => {
			// updateConfig doesn't accept run, but a v1-imported project might
			// already have one — the card should hide for those too.
			const caller = createCaller(sandbox.repoPath);
			const dir = join(sandbox.repoPath, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "config.json"),
				JSON.stringify({ setup: [], teardown: [], run: ["bun run dev"] }),
				"utf-8",
			);

			expect(await caller.shouldShowSetupCard({ projectId: PROJECT_ID })).toBe(
				false,
			);
		});
	});
});
