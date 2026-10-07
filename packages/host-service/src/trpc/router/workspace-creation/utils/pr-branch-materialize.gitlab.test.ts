import { beforeEach, expect, test } from "bun:test";
import type { GitClient } from "../shared/types";
import { materializePrBranch } from "./pr-branch-materialize";

const host = "gl.example.test:8443",
	sha = "a".repeat(40),
	target = `https://${host}/Team/Widget.git`;
const metadata = {
	provider: "gitlab" as const,
	host,
	number: 12,
	headRefName: "Feature",
	headRefOid: sha,
	headRepositoryOwner: "Team",
	headRepositoryName: "Widget",
	headRepositoryUrl: target,
	isCrossRepository: false,
	selectedRepositoryUrl: target,
	selectedRemoteName: "gitlab",
	selectedOrganizationId: "org",
	projectId: "7",
	sourceProjectId: "7",
	targetProjectId: "7",
};
let liveUrl = target,
	fetchedSha = sha,
	marker = "";
const calls: string[][] = [];
const git = {
	raw: async (args: string[]) => {
		calls.push(args);
		if (args[0] === "config" && args.includes("--get"))
			return args.at(-1) === "remote.gitlab.url"
				? liveUrl
				: args.at(-1)?.startsWith("remote.")
					? ""
					: marker;
		if (args[0] === "remote" && args[1] === "get-url") {
			if (args[2] !== "gitlab") throw Error("FAKE_REMOTE_ABSENT");
			return liveUrl;
		}
		if (args[0] === "rev-parse") {
			if (args[2]?.startsWith("refs/heads/")) throw Error("FAKE_BRANCH_ABSENT");
			return fetchedSha;
		}
		return "";
	},
} as unknown as GitClient;
beforeEach(() => {
	liveUrl = target;
	fetchedSha = sha;
	marker = "";
	calls.length = 0;
});
test("GitLab head materialization fetches exact selected target MR ref and verifies its SHA", async () => {
	const result = await materializePrBranch({
		git,
		branch: "Feature",
		remoteName: "origin",
		pr: metadata,
	});
	expect(result.createdBranch).toBe(true);
	expect(
		calls.some(
			(args) =>
				args.includes(target) &&
				args.some((value) => value.includes("refs/merge-requests/12/head")),
		),
	).toBe(true);
	expect(
		calls.some((args) => args.some((value) => value.includes("refs/pull/"))),
	).toBe(false);
	expect(result.trackingRemote).toBe("gitlab");
});
test("a foreign current remote and mismatching head refuse branch materialization", async () => {
	liveUrl = "https://other.test/Team/Widget.git";
	await expect(
		materializePrBranch({
			git,
			branch: "Feature",
			remoteName: "gitlab",
			pr: metadata,
		}),
	).rejects.toThrow();
	expect(calls.some((args) => args.includes("fetch"))).toBe(false);
	liveUrl = target;
	fetchedSha = "b".repeat(40);
	await expect(
		materializePrBranch({
			git,
			branch: "Feature",
			remoteName: "gitlab",
			pr: metadata,
		}),
	).rejects.toThrow();
	expect(calls.some((args) => args[0] === "branch")).toBe(false);
});
test("fork tracking uses verified same-instance source URL rather than inferred GitHub origin", async () => {
	const result = await materializePrBranch({
		git,
		branch: "People/Feature",
		remoteName: "gitlab",
		pr: {
			...metadata,
			sourceProjectId: "8",
			headRepositoryOwner: "People",
			headRepositoryName: "Fork",
			headRepositoryUrl: `https://${host}/People/Fork.git`,
			isCrossRepository: true,
		},
	});
	expect(
		calls.some(
			(args) =>
				args[0] === "remote" &&
				args[1] === "add" &&
				args[3] === `https://${host}/People/Fork.git`,
		),
	).toBe(true);
	expect(
		calls.some((args) => args.some((value) => value.includes("github.com"))),
	).toBe(false);
	expect(result.trackingRemote).toBe("superset-pr-12");
});

test("a recorded checkout for another organization or MR rejects before fetch", async () => {
	marker = JSON.stringify(["other-org", target, "7", 12]);
	await expect(
		materializePrBranch({
			git,
			branch: "Feature",
			remoteName: "gitlab",
			pr: metadata,
		}),
	).rejects.toThrow();
	expect(calls.some((args) => args.includes("fetch"))).toBe(false);
	marker = JSON.stringify(["org", target, "7", 13]);
	await expect(
		materializePrBranch({
			git,
			branch: "Feature",
			remoteName: "gitlab",
			pr: metadata,
		}),
	).rejects.toThrow();
});
