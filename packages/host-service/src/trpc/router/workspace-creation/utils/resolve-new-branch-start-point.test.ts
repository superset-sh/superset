import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import {
	BaseRefreshError,
	resolveNewBranchStartPoint,
} from "./resolve-new-branch-start-point";

describe("fresh new-branch bases", () => {
	let root: string,
		repo: string,
		remote: string,
		writer: SimpleGit,
		git: SimpleGit;
	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "setup-base-"));
		remote = join(root, "remote.git");
		repo = join(root, "repo");
		await simpleGit(root).init(true, ["--initial-branch=main"]); // independent local fixture
		mkdirSync(remote);
		await simpleGit(remote).init(true, ["--initial-branch=main"]);
		const source = join(root, "writer");
		mkdirSync(source);
		writer = simpleGit(source);
		await writer.init(false, ["--initial-branch=main"]);
		await writer.addConfig("user.name", "Test");
		await writer.addConfig("user.email", "test@example.invalid");
		writeFileSync(join(source, "file"), "initial");
		await writer.add(".");
		await writer.commit("initial");
		await writer.addRemote("origin", remote);
		await writer.push("origin", "main");
		await simpleGit(root).clone(remote, repo);
		git = simpleGit(repo);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));
	test("fetches the remote into the exact ref even with a narrowed fetch configuration, without moving local main", async () => {
		const localBefore = (await git.revparse(["HEAD"])).trim();
		await writer.commit("new", { "--allow-empty": null });
		await writer.push("origin", "main");
		await git.addConfig(
			"remote.origin.fetch",
			"+refs/heads/other:refs/remotes/origin/other",
		);
		const result = await resolveNewBranchStartPoint(git, "origin/main");
		expect(result.kind).toBe("remote-tracking");
		expect(result.commit).toBe((await writer.revparse(["HEAD"])).trim());
		expect((await git.revparse(["HEAD"])).trim()).toBe(localBefore);
		expect((await git.revparse(["refs/remotes/origin/main"])).trim()).toBe(
			result.commit ?? "",
		);
	});
	test("explicit local base stays local even with an upstream and no network", async () => {
		const result = await resolveNewBranchStartPoint(
			git,
			"refs/heads/main",
			async () => {
				throw new Error("must not fetch");
			},
		);
		expect(result.kind).toBe("local");
		expect(result.commit).toBe((await git.revparse(["HEAD"])).trim());
	});
	test("default and unqualified upstream bases refresh", async () => {
		let count = 0;
		const fetch = async () => {
			count++;
		};
		await resolveNewBranchStartPoint(git, undefined, fetch);
		await resolveNewBranchStartPoint(git, "main", fetch);
		expect(count).toBe(2);
	});
	test("fetch failure blocks creation and exposes the cached commit for an explicit one-time override", async () => {
		const fetch = async () => {
			throw new Error("offline");
		};
		let failure: BaseRefreshError | undefined;
		try {
			await resolveNewBranchStartPoint(git, "origin/main", fetch);
		} catch (error) {
			expect(error).toBeInstanceOf(BaseRefreshError);
			failure = error as BaseRefreshError;
		}
		expect(failure?.cachedCommit).toBeTruthy();
		expect(failure?.cachedCommitTime).toBeGreaterThan(0);
		if (!failure?.cachedCommit) throw new Error("Expected a cached commit");
		const result = await resolveNewBranchStartPoint(git, "origin/main", fetch, {
			ref: "origin/main",
			commit: failure.cachedCommit,
		});
		expect(result.commit).toBe(failure.cachedCommit);
		await expect(
			resolveNewBranchStartPoint(git, "origin/main", fetch, {
				ref: "origin/main",
				commit: "a".repeat(40),
			}),
		).rejects.toThrow("cached base changed");
	});
	test("missing explicit base never silently forks from HEAD", async () => {
		await expect(
			resolveNewBranchStartPoint(git, "origin/missing"),
		).rejects.toThrow("Could not refresh");
		await expect(
			resolveNewBranchStartPoint(git, "refs/heads/missing"),
		).rejects.toThrow("does not exist");
	});
	test("fetches an upstream whose tracking ref has not been created yet", async () => {
		await git.raw(["update-ref", "-d", "refs/remotes/origin/main"]);
		const result = await resolveNewBranchStartPoint(git, "main");
		expect(result.commit).toBe((await writer.revparse(["HEAD"])).trim());
	});
});
