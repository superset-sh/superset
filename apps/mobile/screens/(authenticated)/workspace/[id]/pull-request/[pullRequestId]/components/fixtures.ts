import type {
	PullRequest,
	PullRequestCapabilities,
	PullRequestCheck,
	PullRequestMergeability,
	PullRequestReviewer,
} from "../../../utils/pullRequest";

/**
 * One fixture per reference screen, named for the design it reproduces, so a
 * wrong render points at a picture:

 */
export interface PullRequestScenario {
	description: string;
	pullRequest: PullRequest;
	checks: PullRequestCheck[];
	reviewers: PullRequestReviewer[];
	mergeability: PullRequestMergeability;
	capabilities: PullRequestCapabilities;
}

const avatar = (login: string) => `https://github.com/${login}.png?size=96`;

const KIET: PullRequestReviewer = {
	login: "Kitenite",
	avatarUrl: avatar("Kitenite"),
	isTeam: false,
	state: "REQUESTED",
};
const AVI: PullRequestReviewer = {
	login: "AviPeltz",
	avatarUrl: avatar("AviPeltz"),
	isTeam: false,
	state: "REQUESTED",
};
const RABBIT: PullRequestReviewer = {
	login: "coderabbitai[bot]",
	avatarUrl: avatar("coderabbitai"),
	isTeam: false,
	state: "COMMENTED",
};

const minutes = (from: string, count: number) => ({
	startedAt: new Date(from),
	completedAt: new Date(new Date(from).getTime() + count * 60_000),
});

function check(
	name: string,
	overrides: Partial<PullRequestCheck> = {},
): PullRequestCheck {
	return {
		name,
		status: "COMPLETED",
		conclusion: "SUCCESS",
		isRequired: false,
		detailsUrl: null,
		...minutes("2026-08-15T15:30:00Z", 3),
		...overrides,
	};
}

const PR: PullRequest = {
	id: "pr-1",
	number: 6510,
	title: "chore(ui): remove stale hooks barrel placeholder",
	body: [
		"## What & why",
		"",
		"Remove the unused `// Hooks will be added here as needed` comment from",
		"`packages/ui/src/hooks/index.ts`. The file is an empty barrel export; the",
		"placeholder comment adds no information.",
		"",
		"## How I tested it",
		"",
		"- [x] `bun run lint` and `bun run typecheck` pass",
		"- [x] No runtime or build behaviour changes",
	].join("\n"),
	url: "https://github.com/superset-sh/superset/pull/6510",
	baseBranch: "main",
	state: "open",
	isDraft: false,
	additions: 0,
	deletions: 1,
	changedFiles: 1,
	mergedAt: null,
	mergedBy: null,
};

const MERGEABILITY: PullRequestMergeability = {
	mergeable: "MERGEABLE",
	mergeStateStatus: "CLEAN",
	approvals: 0,
	requiredApprovals: 1,
	reviewDecision: null,
	unresolvedThreads: 0,
	requiresThreadResolution: false,
	queue: null,
	allowedMergeMethods: ["squash"],
};

const CAN: PullRequestCapabilities = {
	merge: true,
	markReady: true,
	updateBranch: false,
	reopen: true,
	dequeue: true,
};

const GREEN_CHECKS: PullRequestCheck[] = [
	check("CI / Build", { isRequired: true }),
	check("CI / Test", { isRequired: true }),
	check("CI / Typecheck", { isRequired: true }),
	check("CI / Lint", { isRequired: true }),
	check("cubic · AI code reviewer", { conclusion: "NEUTRAL" }),
	check("Sherif", { conclusion: "SKIPPED" }),
];

function scenario(
	description: string,
	overrides: {
		pullRequest?: Partial<PullRequest>;
		checks?: PullRequestCheck[];
		reviewers?: PullRequestReviewer[];
		mergeability?: Partial<PullRequestMergeability>;
		capabilities?: Partial<PullRequestCapabilities>;
	} = {},
): PullRequestScenario {
	return {
		description,
		pullRequest: { ...PR, ...overrides.pullRequest },
		checks: overrides.checks ?? GREEN_CHECKS,
		reviewers: overrides.reviewers ?? [],
		mergeability: { ...MERGEABILITY, ...overrides.mergeability },
		capabilities: { ...CAN, ...overrides.capabilities },
	};
}

export const SCENARIOS = {
	draftConflicts: scenario("Draft · conflicts · nobody assigned", {
		pullRequest: {
			number: 6498,
			title: "Add cloud-specific setup instructions to AGENTS.md",
			additions: 51,
			deletions: 0,
			changedFiles: 1,
			isDraft: true,
		},
		mergeability: { mergeStateStatus: "DIRTY", mergeable: "CONFLICTING" },
		capabilities: { merge: false },
	}),

	draftReadyForReview: scenario("Draft · green · nobody has acted", {
		pullRequest: {
			number: 6498,
			title: "Add cloud-specific setup instructions to AGENTS.md",
			additions: 51,
			deletions: 0,
			changedFiles: 1,
			isDraft: true,
		},
		reviewers: [KIET, AVI],
		capabilities: { merge: false },
	}),

	draftChangesRequested: scenario("Draft · changes requested", {
		pullRequest: {
			number: 6498,
			title: "Add cloud-specific setup instructions to AGENTS.md",
			additions: 51,
			deletions: 0,
			changedFiles: 1,
			isDraft: true,
		},
		reviewers: [{ ...KIET, state: "CHANGES_REQUESTED" }, AVI],
		capabilities: { merge: false },
	}),

	draftChecksRunning: scenario("Draft · 4/17 passing · 13 running", {
		pullRequest: { isDraft: true },
		checks: [
			...Array.from({ length: 4 }, (_, index) =>
				check(`CI / Passed ${index + 1}`, { isRequired: index < 2 }),
			),
			...Array.from({ length: 13 }, (_, index) =>
				check(`Deploy Preview / Job ${index + 1}`, {
					status: "IN_PROGRESS",
					conclusion: null,
					isRequired: index < 2,
				}),
			),
		],
		capabilities: { merge: false },
	}),

	draftOneCheckFailedRestRunning: scenario(
		"Draft · 1 failed · 2 running · 16 passed",
		{
			pullRequest: {
				number: 6649,
				title: "Fix Superset terminal CLI auth",
				additions: 290,
				deletions: 20,
				changedFiles: 11,
				isDraft: true,
			},
			checks: [
				...Array.from({ length: 16 }, (_, index) =>
					check(`CI / Passed ${index + 1}`, { isRequired: index < 2 }),
				),
				check("CI / Typecheck", {
					conclusion: "FAILURE",
					isRequired: true,
					...minutes("2026-08-15T15:30:00Z", 5),
				}),
				...Array.from({ length: 2 }, (_, index) =>
					check(`Deploy Preview / Job ${index + 1}`, {
						status: "IN_PROGRESS",
						conclusion: null,
					}),
				),
			],
			capabilities: { merge: false },
		},
	),

	openConflictsBotCommented: scenario("Open · conflicts · bot commented", {
		pullRequest: {
			number: 6498,
			title: "Add cloud-specific setup instructions to AGENTS.md",
			additions: 51,
			deletions: 0,
			changedFiles: 1,
		},
		reviewers: [RABBIT, KIET, AVI],
		mergeability: { mergeStateStatus: "DIRTY", mergeable: "CONFLICTING" },
		capabilities: {},
	}),

	openConflictsBare: scenario("Open · conflicts · no checks, no reviewers", {
		pullRequest: {
			number: 5,
			title: "Set README version to 2.0.0 (conflicting)",
			additions: 4,
			deletions: 0,
		},
		checks: [],
		mergeability: {
			mergeStateStatus: "DIRTY",
			mergeable: "CONFLICTING",
			requiredApprovals: 0,
		},
		capabilities: {},
	}),

	openApprovedChecksRunning: scenario("Open · approved · 17/19 · behind", {
		pullRequest: {
			number: 6510,
			title: "chore(ui): remove stale hooks barrel placeholder",
			additions: 0,
			deletions: 1,
			changedFiles: 1,
		},
		checks: [
			...Array.from({ length: 17 }, (_, index) =>
				check(`CI / Job ${index + 1}`, { isRequired: index < 3 }),
			),
			check("CI / Slow Job", {
				status: "IN_PROGRESS",
				conclusion: null,
				isRequired: true,
			}),
			check("Sherif", { conclusion: "SKIPPED" }),
		],
		reviewers: [{ ...KIET, state: "APPROVED" }],
		mergeability: { approvals: 1, mergeStateStatus: "BEHIND" },
		capabilities: { updateBranch: true },
	}),

	openOneCheckFailed: scenario("Open · one check, failing", {
		pullRequest: {
			number: 3,
			title: "Add contributing guidelines",
			additions: 42,
			changedFiles: 3,
		},
		checks: [
			check("CI / Failing Check", {
				conclusion: "FAILURE",
				...minutes("2026-08-15T15:30:00Z", 5),
			}),
		],
		mergeability: { requiredApprovals: 0, mergeStateStatus: "UNSTABLE" },
	}),

	openTwoChecksOneFailed: scenario("Open · one failing, one passing", {
		pullRequest: {
			number: 3,
			title: "Add contributing guidelines",
			additions: 55,
			changedFiles: 3,
		},
		checks: [
			check("CI / Failing Check", {
				conclusion: "FAILURE",
				...minutes("2026-08-15T15:30:00Z", 4),
			}),
			check("CI / Passing Check"),
		],
		mergeability: { requiredApprovals: 0, mergeStateStatus: "UNSTABLE" },
	}),

	openTwoChecksFailed: scenario("Open · two failing checks", {
		pullRequest: {
			number: 3,
			title: "Add contributing guidelines",
			additions: 55,
			changedFiles: 3,
		},
		checks: [
			check("CI / Failing Check", {
				conclusion: "FAILURE",
				...minutes("2026-08-15T15:30:00Z", 10),
			}),
			check("CI / Failing Lint Check", {
				conclusion: "FAILURE",
				...minutes("2026-08-15T15:30:00Z", 10),
			}),
			check("CI / Passing Check"),
		],
		mergeability: { requiredApprovals: 0, mergeStateStatus: "UNSTABLE" },
	}),

	openWaitingForReview: scenario("Open · green · waiting for review", {
		pullRequest: {
			number: 6510,
			title: "chore(ui): remove stale hooks barrel placeholder",
			additions: 0,
			deletions: 1,
			changedFiles: 1,
		},
		reviewers: [KIET],
		mergeability: { approvals: 0, mergeStateStatus: "BLOCKED" },
		capabilities: { updateBranch: true },
	}),

	openReadyNoCi: scenario("Open · mergeable · no CI, no reviewers", {
		pullRequest: {
			number: 1,
			title: "Add basic README documentation",
			additions: 9,
			deletions: 0,
		},
		checks: [],
		mergeability: { requiredApprovals: 0 },
	}),

	merging: scenario("The same card, mid-merge", {
		pullRequest: {
			number: 1,
			title: "Add basic README documentation",
			additions: 9,
			deletions: 0,
		},
		checks: [],
		mergeability: { requiredApprovals: 0 },
	}),

	// Checks, reviewers and required approvals are all present so the story
	// proves the rows are dropped by state, not by absent data.
	merged: scenario("Merged · rows collapse to the receipt", {
		pullRequest: {
			number: 1,
			title: "Add basic README documentation",
			additions: 9,
			deletions: 0,
			state: "merged",
			mergedAt: new Date("2026-08-15T22:25:00Z"),
			mergedBy: { login: "saddlepaddle", avatarUrl: avatar("saddlepaddle") },
		},
		reviewers: [{ ...KIET, state: "APPROVED" }],
		mergeability: { approvals: 1 },
	}),

	closed: scenario("Closed · status rows dropped", {
		pullRequest: {
			number: 3489,
			title: "Archive the legacy onboarding flow",
			state: "closed",
			additions: 2285,
			deletions: 0,
			changedFiles: 8,
		},
		reviewers: [KIET],
	}),

	queued: scenario("Queued to merge", {
		reviewers: [{ ...KIET, state: "APPROVED" }],
		mergeability: {
			approvals: 1,
			queue: { position: 2, state: "AWAITING_CHECKS" },
		},
	}),

	blocked: scenario("Blocked by branch rules", {
		reviewers: [{ ...KIET, state: "APPROVED" }],
		mergeability: { approvals: 1, mergeStateStatus: "BLOCKED" },
		capabilities: {},
	}),

	mergeabilityPending: scenario("Mergeability still computing — merge waits", {
		reviewers: [{ ...KIET, state: "APPROVED" }],
		mergeability: {
			approvals: 1,
			mergeable: "UNKNOWN",
			mergeStateStatus: "UNKNOWN",
		},
	}),

	manyReviewers: scenario("Overflow · four reviewers", {
		reviewers: [
			{ ...KIET, state: "APPROVED" },
			AVI,
			RABBIT,
			{
				login: "mobile-reviewers",
				avatarUrl: null,
				isTeam: true,
				state: "REQUESTED",
			},
		],
		mergeability: { approvals: 1 },
	}),
} satisfies Record<string, PullRequestScenario>;

export type ScenarioName = keyof typeof SCENARIOS;
