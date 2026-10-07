import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "@/hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"native status labels and per-action pending state render in an owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	f.mockLeaf("@lingui/react/macro", {
		Trans: () => null,
		useLingui: () => ({
			i18n: { _: (m: { message: string }) => m.message },
			t: ({ message }: { message: string }) => message,
		}),
	});
	f.mockLeaf("@superset/i18n/react", {
		useFormat: () => ({ formatNumber: (value: number) => String(value) }),
	});
	let buttons: {
		accessibilityLabel: string;
		accessibilityState: { busy: boolean; disabled: boolean };
	}[] = [];
	const View = ({ children }: { children?: import("react").ReactNode }) =>
		f.React.createElement("div", null, children);
	f.mockLeaf("react-native", {
		View,
		Pressable: (
			props: (typeof buttons)[number] & {
				children?: import("react").ReactNode;
			},
		) => {
			buttons.push(props);
			return f.React.createElement(View, props);
		},
		ActivityIndicator: () => f.React.createElement("span", null, "spinner"),
	});
	const { GitLabPullRequestCard } = await import("./GitLabPullRequestCard");
	const nativeDetail = {
		provider: "gitlab" as const,
		host: "git.example:8443",
		pullRequest: {
			id: "gitlab:17",
			number: 17,
			title: "Native",
			body: "",
			url: f.nativeUrl,
			baseBranch: "main",
			state: "open" as const,
			isDraft: false,
			additions: 7,
			deletions: 2,
			changedFiles: 1,
			diffStatsComplete: true,
			mergedAt: null,
			mergedBy: null,
		},
		checks: [],
		reviewers: [],
		mergeability: {
			mergeable: "MERGEABLE",
			mergeStateStatus: "CLEAN",
			approvals: 0,
			requiredApprovals: 0,
			reviewDecision: null,
			unresolvedThreads: 0,
			requiresThreadResolution: false,
			queue: null,
			allowedMergeMethods: ["merge"],
		},
		capabilities: {
			merge: true,
			markReady: true,
			updateBranch: true,
			reopen: true,
			dequeue: false,
		},
		reviewState: {
			provider: "gitlab",
			detailedMergeStatus: "mergeable",
			approvalsRequired: null,
			approvalsLeft: null,
			approvedBy: [],
			blockingDiscussionsResolved: true,
			hasConflicts: false,
		},
		mergePolicy: {
			provider: "gitlab" as const,
			method: "merge" as const,
			squash: "never" as const,
		},
	};

	let status = "mergeable";
	function Probe() {
		return f.React.createElement(GitLabPullRequestCard, {
			detail: {
				...nativeDetail,
				reviewState: {
					...nativeDetail.reviewState,
					detailedMergeStatus: status,
				},
			},
			view: { checks: [], reviewers: [] } as Parameters<
				typeof GitLabPullRequestCard
			>[0]["view"],
			busyAction: "merge",
			onAction: () => {},
			onOpenChecks: () => {},
			onOpenCheck: () => {},
			onOpenReviewers: () => {},
		});
	}
	afterEach(async () => f.cleanup());
	test("one pending action keeps other labels visible and disabled", async () => {
		buttons = [];
		status = "mergeable";
		await f.render(Probe);
		expect(
			buttons.map(({ accessibilityLabel, accessibilityState }) => ({
				label: accessibilityLabel,
				...accessibilityState,
			})),
		).toEqual([
			{ label: "Merge", busy: true, disabled: true },
			{ label: "Rebase branch", busy: false, disabled: true },
		]);
		expect(buttons[1]?.accessibilityLabel).toBe("Rebase branch");
	});
	test("provider tokens render meaningful localized status labels", async () => {
		for (const [token, label] of [
			["ci_still_running", "Waiting for Checks"],
			["not_approved", "Waiting for Review"],
			["unknown_future_status", "Approval requirements unavailable"],
		]) {
			status = token;
			await f.render(Probe);
			expect(document.body.textContent).toContain(
				`GitLab merge status: ${label}`,
			);
			expect(document.body.textContent).not.toContain(token);
		}
	});
}
