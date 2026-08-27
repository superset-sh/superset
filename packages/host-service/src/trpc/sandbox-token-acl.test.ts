import { Database as BunDatabase } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects, terminalSessions, workspaces } from "../db/schema";
import {
	checkSandboxTokenAccess,
	checkSandboxWsAccess,
} from "./sandbox-token-acl";

const MIGRATIONS = path.resolve(import.meta.dir, "../../drizzle");
const OWN_WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const OWN_TERMINAL = "term-own";
const OTHER_TERMINAL = "term-other";

describe("sandbox token ACL", () => {
	let db: HostDb;

	beforeEach(() => {
		const sqlite = new BunDatabase(":memory:");
		const d = drizzle(sqlite, { schema });
		migrate(d, { migrationsFolder: MIGRATIONS });
		db = d as unknown as HostDb;
		db.insert(projects)
			.values({ id: "proj-1", repoPath: "/tmp/repo", name: "p" })
			.run();
		db.insert(workspaces)
			.values([
				{
					id: OWN_WS,
					projectId: "proj-1",
					worktreePath: "/tmp/own",
					branch: "own",
					type: "worktree",
				},
				{
					id: OTHER_WS,
					projectId: "proj-1",
					worktreePath: "/tmp/other",
					branch: "other",
					type: "worktree",
				},
			])
			.run();
		db.insert(terminalSessions)
			.values([
				{ id: OWN_TERMINAL, originWorkspaceId: OWN_WS },
				{ id: OTHER_TERMINAL, originWorkspaceId: OTHER_WS },
			])
			.run();
	});

	const check = (pathName: string, rawInput: unknown) =>
		checkSandboxTokenAccess({
			path: pathName,
			rawInput,
			tokenWorkspaceId: OWN_WS,
			db,
		});

	test("denies unlisted procedures (creation, host-scoped)", async () => {
		for (const p of [
			"terminal.launchSession",
			"terminal.createSession",
			"workspaces.create",
			"workspace.list",
			"filesystem.browseHost",
			"auth.setAnthropicApiKey",
			"project.list",
		]) {
			expect((await check(p, {})).allowed).toBe(false);
		}
	});

	test("allows own-workspace agent + terminal ops", async () => {
		expect((await check("agents.run", { workspaceId: OWN_WS })).allowed).toBe(
			true,
		);
		expect(
			(await check("terminal.send", { terminalId: OWN_TERMINAL })).allowed,
		).toBe(true);
		expect(
			(await check("terminal.list", { workspaceId: OWN_WS })).allowed,
		).toBe(true);
		expect(
			(await check("workspaces.syncSandbox", { workspaceId: OWN_WS })).allowed,
		).toBe(true);
		expect(
			(await check("workspaces.syncSandbox", { workspaceId: OTHER_WS }))
				.allowed,
		).toBe(false);
	});

	test("denies cross-workspace access by workspaceId and by terminalId", async () => {
		expect((await check("agents.run", { workspaceId: OTHER_WS })).allowed).toBe(
			false,
		);
		expect(
			(await check("terminal.send", { terminalId: OTHER_TERMINAL })).allowed,
		).toBe(false);
	});

	test("fails closed when scope can't be resolved", async () => {
		expect((await check("terminal.list", {})).allowed).toBe(false);
		expect(
			(await check("terminal.send", { terminalId: "does-not-exist" })).allowed,
		).toBe(false);
	});

	const ws = (pathName: string) =>
		checkSandboxWsAccess({ path: pathName, tokenWorkspaceId: OWN_WS, db });

	test("ws: attach own terminal allowed, others + host routes denied", () => {
		expect(ws(`/terminal/${OWN_TERMINAL}`).allowed).toBe(true);
		expect(ws(`/terminal/${OTHER_TERMINAL}`).allowed).toBe(false);
		expect(ws("/terminal/sessions").allowed).toBe(false);
		expect(ws("/events").allowed).toBe(false);
		expect(ws("/browser/x").allowed).toBe(false);
	});
});
