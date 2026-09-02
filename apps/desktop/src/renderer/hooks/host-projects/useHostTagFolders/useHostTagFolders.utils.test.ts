import { describe, expect, test } from "bun:test";
import type {
	HostProjectRowsResult,
	HostProjectsQueryTarget,
} from "../useHostProjects/useHostProjects.utils";
import {
	type HostTagFolderSetting,
	type HostTagFoldersResult,
	mergeHostTagFolders,
	mergeHostTagFoldersWithLegacy,
} from "./useHostTagFolders.utils";

const setting = (
	color: string,
	overrides: Partial<HostTagFolderSetting> = {},
): HostTagFolderSetting => ({
	scope: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	tag: "api",
	displayName: null,
	color,
	tabOrder: null,
	...overrides,
});

const result = (
	machineId: string,
	isLocal: boolean,
	settings: HostTagFolderSetting[],
): HostTagFoldersResult => ({
	target: {
		machineId,
		organizationId: "org",
		hostUrl: `http://${machineId}`,
		isLocal,
	} satisfies HostProjectsQueryTarget,
	status: "ready",
	settings,
});

const legacyResult = (
	target: HostProjectsQueryTarget,
	displayName: string,
): HostProjectRowsResult => ({
	target,
	reachable: true,
	rows: [
		{
			id: setting("#ff0000").scope,
			repoPath: "/tmp/project",
			name: "Project",
			repoOwner: null,
			repoName: null,
			repoUrl: null,
			worktreeBaseDir: null,
			icon: null,
			color: null,
			createdAt: 0,
			updatedAt: 0,
			tagSettings: [
				{
					tag: "api",
					displayName,
					color: "#ff0000",
					tabOrder: null,
				},
			],
		},
	],
});

describe("mergeHostTagFolders", () => {
	test("deduplicates project rows and prefers the local host regardless of input order", () => {
		const remote = result("remote", false, [setting("#ff0000")]);
		const local = result("local", true, [setting("#0000ff")]);
		expect(mergeHostTagFolders([remote, local])).toEqual([setting("#0000ff")]);
		expect(mergeHostTagFolders([local, remote])).toEqual([setting("#0000ff")]);
	});

	test("uses stable host identity ordering when no local replica exists", () => {
		const alpha = result("alpha", false, [setting("#111111")]);
		const zeta = result("zeta", false, [setting("#999999")]);
		expect(mergeHostTagFolders([zeta, alpha])).toEqual([setting("#111111")]);
	});

	test("treats local nulls as explicit resets instead of filling from a stale replica", () => {
		const remote = result("remote", false, [
			setting("#ff0000", { displayName: "Remote label" }),
		]);
		const local = result("local", true, [
			setting("#0000ff", { displayName: "Local label", color: null }),
		]);
		expect(mergeHostTagFolders([remote, local])).toEqual([
			setting("#0000ff", { displayName: "Local label", color: null }),
		]);
	});

	test("preserves independent tags and scopes", () => {
		const rows = mergeHostTagFolders([
			result("local", true, [
				setting("#111111"),
				setting("#222222", { tag: "web" }),
				setting("#333333", { scope: "sessions" }),
			]),
		]);
		expect(rows).toHaveLength(3);
	});
});

describe("mergeHostTagFoldersWithLegacy", () => {
	test("keeps an old remote host's row when the local canonical host has no row", () => {
		const local = result("local", true, []);
		const remote = { ...result("remote", false, []), status: "error" as const };
		expect(
			mergeHostTagFoldersWithLegacy(
				[local, remote],
				[legacyResult(remote.target, "Remote API")],
			),
		).toEqual([setting("#ff0000", { displayName: "Remote API" })]);
	});

	test("treats a successful empty canonical read as authoritative", () => {
		const local = result("local", true, []);
		expect(
			mergeHostTagFoldersWithLegacy(
				[local],
				[legacyResult(local.target, "Deleted API")],
			),
		).toEqual([]);
	});
});
