import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { type SimpleGit, simpleGit } from "simple-git";
import type { HostDb } from "../../../../db/db";
import { applyRepoSchema } from "../../../../db/repo-schema";
import * as schema from "../../../../db/schema";
import { projects } from "../../../../db/schema";
import type { GitCredentialProvider } from "../../../../runtime/git";
import { resolveGithubRepo, resolveRepo } from "./project-helpers";

const originalFetch = globalThis.fetch;
let directory: string;
let db: HostDb;
let sqlite: Database;
let git: SimpleGit;
const credentials: GitCredentialProvider = {
	getToken: async () => null,
	getCredentials: async () => ({ env: {} }),
	credentialRemedy: () => "",
};

beforeEach(async () => {
	directory = mkdtempSync(join(tmpdir(), "superset-live-repo-"));
	const repoPath = join(directory, "repo");
	mkdirSync(repoPath);
	git = simpleGit(repoPath);
	await git.init();
	sqlite = new Database(":memory:");
	const testDb = drizzle(sqlite, { schema });
	migrate(testDb, {
		migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
	});
	applyRepoSchema(sqlite);
	db = testDb as unknown as HostDb;
	db.insert(projects).values({ id: "project", repoPath }).run();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	sqlite?.close();
	rmSync(directory, { recursive: true, force: true });
});

test("resolves GitLab nested groups from the live origin", async () => {
	await git.addRemote("origin", "git@gitlab.com:group/sub/app.git");
	expect(await resolveRepo({ db, credentials }, "project")).toMatchObject({
		provider: "gitlab",
		host: "gitlab.com",
		owner: "group/sub",
		name: "app",
		remoteName: "origin",
	});
});

test("uses configured remote while preserving the original GitHub fallback", async () => {
	await git.addRemote("origin", "https://github.com/original/app.git");
	await git.addRemote("gitlab", "https://gitlab.com/group/sub/app.git");
	db.update(projects).set({ remoteName: "gitlab" }).run();
	expect(await resolveRepo({ db, credentials }, "project")).toMatchObject({
		provider: "gitlab",
		remoteName: "gitlab",
	});
	expect(
		await resolveGithubRepo(
			{ db } as Parameters<typeof resolveGithubRepo>[0],
			"project",
		),
	).toMatchObject({ owner: "original", name: "app" });
});

test("retains a trusted custom GitLab host and port while reading renamed live paths", async () => {
	await git.addRemote(
		"origin",
		"https://git.example.invalid:8443/new/sub/app.git",
	);
	db.update(projects)
		.set({
			repoProvider: "gitlab",
			repoUrl: "https://git.example.invalid:8443/old/app",
			repoOwner: "old",
			repoName: "old-app",
		})
		.run();
	expect(await resolveRepo({ db, credentials }, "project")).toMatchObject({
		provider: "gitlab",
		host: "git.example.invalid:8443",
		owner: "new/sub",
		name: "app",
	});
});

test("falls back from a missing configured remote to origin", async () => {
	await git.addRemote("origin", "https://github.com/Team/App.git");
	db.update(projects).set({ remoteName: "removed" }).run();
	expect(await resolveRepo({ db, credentials }, "project")).toMatchObject({
		provider: "github",
		host: "github.com",
		owner: "Team",
		name: "App",
		remoteName: "origin",
	});
});

test("resolves the Git root from a project stored at a subdirectory", async () => {
	const nested = join(directory, "repo", "src", "nested");
	mkdirSync(nested, { recursive: true });
	db.update(projects).set({ repoPath: nested }).run();
	await git.addRemote("upstream", "https://gitlab.com/group/app.git");
	expect((await resolveRepo({ db, credentials }, "project")).repoPath).toBe(
		await git.revparse(["--show-toplevel"]).then((path) => path.trim()),
	);
});

test("preserves the setup error for missing projects", async () => {
	await expect(
		resolveRepo({ db, credentials }, "missing"),
	).rejects.toMatchObject({
		code: "PRECONDITION_FAILED",
		cause: { kind: "PROJECT_NOT_SETUP", projectId: "missing" },
	});
});

test("validates the live remote before provider probing or credential lookup", async () => {
	await git.addRemote("origin", "https://custom.example.invalid/Team/App.git");
	let fetches = 0;
	let tokens = 0;
	globalThis.fetch = Object.assign(
		async () => {
			fetches++;
			return new Response(null, { status: 401 });
		},
		{ preconnect: originalFetch.preconnect },
	);
	const scopedCredentials = {
		...credentials,
		getToken: async () => {
			tokens++;
			return "FAKE_TOKEN";
		},
	};
	await expect(
		resolveRepo({ db, credentials: scopedCredentials }, "project", {
			validateRemote: () => {
				throw new Error("Wrong thread repository");
			},
		}),
	).rejects.toThrow("Wrong thread repository");
	expect(fetches).toBe(0);
	expect(tokens).toBe(0);
});

test("SSH remotes retain the project's canonical custom web authority", async () => {
	await git.addRemote(
		"origin",
		"ssh://git@git.example.invalid:2222/group/app.git",
	);
	db.update(projects)
		.set({
			repoProvider: "gitlab",
			repoUrl: "https://git.example.invalid:8443/group/app",
		})
		.run();
	expect(await resolveRepo({ db, credentials }, "project")).toMatchObject({
		provider: "gitlab",
		host: "git.example.invalid:8443",
		url: "https://git.example.invalid:8443/group/app",
	});
});
