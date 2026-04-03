import { describe, expect, test } from "bun:test";
import {
	getGitHubPRCommentsQueryPolicy,
	getGitHubStatusQueryPolicy,
} from "./githubQueryPolicy";

describe("getGitHubStatusQueryPolicy", () => {
	test("active surfaces poll every 10s", () => {
		for (const surface of ["changes-sidebar", "workspace-page"] as const) {
			expect(
				getGitHubStatusQueryPolicy(surface, {
					hasWorkspaceId: true,
					isActive: true,
				}),
			).toEqual({
				enabled: true,
				refetchInterval: 10_000,
				refetchOnWindowFocus: true,
				staleTime: 10_000,
			});
		}
	});

	test("hover surfaces rely on staleTime debounce, no polling", () => {
		for (const surface of [
			"workspace-list-item",
			"workspace-row",
			"workspace-hover-card",
		] as const) {
			expect(
				getGitHubStatusQueryPolicy(surface, {
					hasWorkspaceId: true,
					isActive: true,
				}),
			).toEqual({
				enabled: true,
				refetchInterval: false,
				refetchOnWindowFocus: false,
				staleTime: 10_000,
			});
		}
	});
});

describe("getGitHubPRCommentsQueryPolicy", () => {
	test("polls every 30s when active with a pull request", () => {
		expect(
			getGitHubPRCommentsQueryPolicy({
				hasWorkspaceId: true,
				hasActivePullRequest: true,
				isActive: true,
			}),
		).toEqual({
			enabled: true,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
			staleTime: 30_000,
		});
	});
});
