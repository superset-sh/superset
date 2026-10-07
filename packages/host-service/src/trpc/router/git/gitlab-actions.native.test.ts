import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostServiceContext } from "../../../types";

mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
const { applyRepoSchema } = await import("../../../db/repo-schema");
const schema = await import("../../../db/schema");
const { githubRouter } = await import("../github/github");
const { gitRouter } = await import("./git");
const originalFetch = globalThis.fetch;
const host = "git.example.invalid:8443";
const clone = `https://${host}/team/sub/repo.git`;
const mrUrl = `https://${host}/team/sub/repo/-/merge_requests/3`;
let fixture: string;
let db: ReturnType<typeof fixtureDb>;
let sqlite: Database;
let tokens: string[];
let requests: string[];

function git(...args: string[]) {
	return execFileSync("git", ["-C", fixture, ...args], { encoding: "utf8" });
}

function fixtureDb() {
	sqlite = new Database(join(fixture, "owned.sqlite"));
	const database = drizzle(sqlite, { schema });
	runMigrations(database, resolve(import.meta.dir, "../../../../drizzle"));
	applyRepoSchema(sqlite);
	return database;
}

function context(): HostServiceContext {
	return {
		isAuthenticated: true,
		db,
		credentials: {
			getToken: async (selectedHost: string) => {
				tokens.push(selectedHost);
				return "owned-fixture-token";
			},
		},
		github: async () => {
			throw new Error("GitHub must not run");
		},
	} as unknown as HostServiceContext;
}

const action = () => ({
	owner: "team/sub",
	repo: "repo",
	pullNumber: 3,
	provider: "gitlab" as const,
	host,
	workspaceId: "workspace",
	expectedUrl: mrUrl,
});

beforeAll(() => {
	fixture = mkdtempSync(join(tmpdir(), "superset-gitlab-action-owned-"));
	git("init", "--quiet");
	git(
		"remote",
		"add",
		"origin",
		"https://foreign.example.invalid/team/other.git",
	);
	git("remote", "add", "selected", clone);
	db = fixtureDb();
	db.insert(schema.projects)
		.values({
			id: "project",
			repoPath: fixture,
			repoProvider: "gitlab",
			repoUrl: clone,
			remoteName: "selected",
		})
		.run();
	db.insert(schema.projects).values({ id: "other", repoPath: fixture }).run();
	db.insert(schema.pullRequests)
		.values({
			id: "pr",
			projectId: "project",
			repoProvider: "gitlab",
			repoHost: host,
			repoOwner: "team/sub",
			repoName: "repo",
			prNumber: 3,
			url: mrUrl,
			title: "owned",
			state: "open",
			headBranch: "feature",
			headSha: "abc",
		})
		.run();
	db.insert(schema.workspaces)
		.values({
			id: "workspace",
			projectId: "project",
			worktreePath: fixture,
			branch: "feature",
			pullRequestId: "pr",
		})
		.run();
});

beforeEach(() => {
	git("remote", "set-url", "selected", clone);
	db.update(schema.projects)
		.set({ remoteName: "selected" })
		.where(eq(schema.projects.id, "project"))
		.run();
	db.update(schema.workspaces)
		.set({ projectId: "project" })
		.where(eq(schema.workspaces.id, "workspace"))
		.run();
	tokens = [];
	requests = [];
	globalThis.fetch = Object.assign(
		async (value: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(value));
			expect(url.origin).toBe(`https://${host}`);
			expect(new Headers(init?.headers).get("authorization")).toBe(
				"Bearer owned-fixture-token",
			);
			requests.push(url.pathname);
			if (url.pathname.endsWith("/trace")) return new Response("owned job log");
			return Response.json({
				id: 1,
				iid: 3,
				title: "owned",
				state: "merged",
				merge_commit_sha: "abc",
				merge_method: "merge",
				squash_option: "default_off",
			});
		},
		{ preconnect: originalFetch.preconnect },
	);
});

afterAll(() => {
	globalThis.fetch = originalFetch;
	sqlite?.close();
	if (fixture) rmSync(fixture, { recursive: true, force: true });
});

test("native selected-remote lookup drives the action and rejects a live same-host repoint before credentials", async () => {
	expect(
		await githubRouter.createCaller(context()).mergePR(action()),
	).toMatchObject({ merged: true, sha: "abc" });
	expect(tokens.length).toBeGreaterThan(0);
	expect(tokens.every((selectedHost) => selectedHost === host)).toBe(true);
	expect(
		requests.every((path) =>
			path.startsWith("/api/v4/projects/team%2Fsub%2Frepo"),
		),
	).toBe(true);
	git("remote", "set-url", "selected", `https://${host}/team/foreign.git`);
	tokens = [];
	requests = [];
	let rejection: unknown;
	try {
		await githubRouter.createCaller(context()).mergePR(action());
	} catch (error) {
		rejection = error;
	}
	expect(rejection).toMatchObject({ code: "BAD_REQUEST" });
	expect(tokens).toEqual([]);
	expect(requests).toEqual([]);
});

test("actual workspace/PR rows bind job logs to a project and its selected remote", async () => {
	const input = {
		workspaceId: "workspace",
		detailsUrl: `https://${host}/team/sub/repo/-/jobs/8`,
	};
	expect(
		await gitRouter.createCaller(context()).getCheckJobLogs(input),
	).toEqual({ logs: "owned job log" });
	expect(requests).toEqual(["/api/v4/projects/team%2Fsub%2Frepo/jobs/8/trace"]);
	db.update(schema.workspaces)
		.set({ projectId: "other" })
		.where(eq(schema.workspaces.id, "workspace"))
		.run();
	tokens = [];
	requests = [];
	await expect(
		gitRouter.createCaller(context()).getCheckJobLogs(input),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(tokens).toEqual([]);
	expect(requests).toEqual([]);
});

test("a configured-remote change cannot silently dispatch to origin", async () => {
	db.update(schema.projects)
		.set({ remoteName: "origin" })
		.where(eq(schema.projects.id, "project"))
		.run();
	await expect(
		githubRouter.createCaller(context()).mergePR(action()),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(tokens).toEqual([]);
	expect(requests).toEqual([]);
});
