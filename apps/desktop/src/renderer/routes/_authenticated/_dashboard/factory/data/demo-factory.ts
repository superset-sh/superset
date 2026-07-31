import type {
	FactoryProject,
	FactorySource,
	FactoryStage,
	FactoryWorkItem,
	FactoryWorkItemMetadata,
} from "../types";

export const DEMO_FACTORY_PROJECTS: FactoryProject[] = [
	{
		id: "superset",
		name: "superset / superset",
		defaultModelId: "anthropic/claude-opus-4-1",
	},
];

interface DemoWorkItemInput {
	id: string;
	title: string;
	stage: FactoryStage;
	source: FactorySource;
	sourceKey?: string;
	url?: string;
	metadata: FactoryWorkItemMetadata;
}

function demoWorkItem(input: DemoWorkItemInput): FactoryWorkItem {
	const updatedAt = "2026-07-27T16:00:00.000Z";
	return {
		id: input.id,
		factoryProjectId: "superset",
		source: input.source,
		sourceKey: input.sourceKey ?? null,
		title: input.title,
		url: input.url ?? null,
		stages: [input.stage],
		stageHistory: [
			{
				stage: input.stage,
				enteredAt: updatedAt,
				by: input.metadata.agent ?? "Roshvan",
			},
		],
		metadata: {
			board: "work",
			project: "superset / superset",
			...input.metadata,
		},
		revision: 1,
		createdAt: "2026-07-27T14:00:00.000Z",
		updatedAt,
	};
}

export const DEMO_FACTORY_WORK_ITEMS: FactoryWorkItem[] = [
	demoWorkItem({
		id: "work-35245",
		title: "Persist pane scroll position across workspace switches",
		stage: "intake",
		source: "github-issue",
		sourceKey: "#35245",
		metadata: {
			age: "12m",
			decision: "Investigate request",
			description:
				"New issue from GitHub. Factory has captured the report and is waiting for triage.",
		},
	}),
	demoWorkItem({
		id: "work-35244",
		title: "Add repository search relevance ranking",
		stage: "intake",
		source: "linear-issue",
		sourceKey: "SUP-842",
		metadata: {
			age: "38m",
			decision: "Investigate request",
			description:
				"Product request synced from Linear with its project and customer context intact.",
		},
	}),
	demoWorkItem({
		id: "work-35238",
		title: "Keep cached task rows visible while Electric reconnects",
		stage: "triage",
		source: "github-issue",
		sourceKey: "#35238",
		metadata: {
			agent: "triage",
			age: "3m",
			decision: "Review investigation",
			description:
				"Triage reproduced the blank-state regression and identified the cache-first rendering boundary.",
			plan: [
				{ label: "Reproduce reconnect lifecycle", status: "complete" },
				{ label: "Trace live-query readiness states", status: "complete" },
				{ label: "Propose the smallest safe fix", status: "in-progress" },
			],
		},
	}),
	demoWorkItem({
		id: "work-35237",
		title: "Make CSV upload errors explain the failed row",
		stage: "triage",
		source: "linear-issue",
		sourceKey: "SUP-839",
		metadata: {
			agent: "triage",
			age: "17m",
			decision: "Review investigation",
			description:
				"Triage is mapping parser errors back to the source row without exposing uploaded content.",
		},
	}),
	demoWorkItem({
		id: "work-35236",
		title: "Add copy logs action to failed automation runs",
		stage: "planning",
		source: "github-issue",
		sourceKey: "#35236",
		metadata: {
			agent: "planner",
			age: "4m",
			branch: "factory/35236-copy-logs",
			decision: "Approve plan",
			description:
				"The planner has a scoped implementation plan. Approving it creates the worktree and hands the same context to the builder.",
			plan: [
				{
					label: "Add copy action to the failure detail header",
					status: "complete",
				},
				{ label: "Sanitize and format host-service logs", status: "complete" },
				{
					label: "Cover clipboard success and failure states",
					status: "complete",
				},
				{
					label: "Run desktop lint, types, and targeted tests",
					status: "pending",
				},
			],
		},
	}),
	demoWorkItem({
		id: "work-35235",
		title: "Surface automation ownership in the list",
		stage: "planning",
		source: "manual",
		metadata: {
			agent: "planner",
			age: "21m",
			decision: "Approve plan",
			description:
				"Manual request captured directly in Superset. The plan preserves current team filters.",
		},
	}),
	demoWorkItem({
		id: "work-35234",
		title: "Stop stale ports from surviving host restart",
		stage: "execute",
		source: "github-issue",
		sourceKey: "#35234",
		metadata: {
			agent: "builder",
			age: "18m",
			branch: "factory/35234-stale-ports",
			decision: "Open workspace",
			description:
				"Builder is editing the host-service lifecycle in an isolated Superset worktree.",
			diff: { additions: 142, deletions: 28, files: 6 },
			workspaceId: "workspace-35234",
			plan: [
				{ label: "Reproduce orphaned port ownership", status: "complete" },
				{ label: "Bind cleanup to daemon adoption", status: "complete" },
				{ label: "Add restart lifecycle coverage", status: "in-progress" },
				{ label: "Run host-service integration tests", status: "pending" },
			],
		},
	}),
	demoWorkItem({
		id: "work-35233",
		title: "Refactor workspace cancellation propagation",
		stage: "execute",
		source: "linear-issue",
		sourceKey: "SUP-833",
		metadata: {
			agent: "builder",
			age: "42m",
			branch: "factory/sup-833-cancellation",
			decision: "Open workspace",
			description:
				"Builder is updating cancellation boundaries and recording trace evidence.",
			diff: { additions: 84, deletions: 67, files: 9 },
			workspaceId: "workspace-35233",
		},
	}),
	demoWorkItem({
		id: "work-35232",
		title: "Guard command palette focus after pane remount",
		stage: "review",
		source: "github-pr",
		sourceKey: "#35232",
		metadata: {
			agent: "reviewer",
			age: "5m",
			branch: "factory/35232-focus",
			checks: { passed: 7, failed: 1 },
			decision: "Resolve failing check",
			description:
				"Independent review found one failing lifecycle test. The pull request stays gated.",
			diff: { additions: 96, deletions: 31, files: 5 },
			pullRequest: 35232,
			workspaceId: "workspace-35232",
		},
	}),
	demoWorkItem({
		id: "work-35231",
		title: "Add keyboard shortcuts help dialog",
		stage: "review",
		source: "github-pr",
		sourceKey: "#35231",
		metadata: {
			agent: "reviewer",
			age: "16m",
			branch: "factory/35231-shortcuts",
			checks: { passed: 8, failed: 0 },
			decision: "Review and merge",
			description:
				"Review is clean and every required check passed. Human merge remains the final gate.",
			diff: { additions: 211, deletions: 14, files: 12 },
			pullRequest: 35231,
			workspaceId: "workspace-35231",
		},
	}),
	demoWorkItem({
		id: "work-35230",
		title: "Fix update banner on offline launch",
		stage: "done",
		source: "github-pr",
		sourceKey: "#35230",
		metadata: {
			age: "1h",
			branch: "factory/35230-offline-update",
			checks: { passed: 6, failed: 0 },
			decision: "Shipped",
			description:
				"Merged after review. Factory recorded the final evidence and closed the source issue.",
			diff: { additions: 38, deletions: 19, files: 4 },
			pullRequest: 35230,
		},
	}),
	demoWorkItem({
		id: "review-6003",
		title: "Review: prototype a Mastra-powered Superset Factory",
		stage: "review",
		source: "github-pr",
		sourceKey: "#6003",
		url: "https://github.com/superset-sh/superset/pull/6003",
		metadata: {
			agent: "reviewer",
			age: "8m",
			board: "review",
			branch: "superset-factory",
			checks: { passed: 11, failed: 0 },
			decision: "Review and merge",
			description:
				"Independent review has inspected the prototype, repository gates, Superset integration seams, and POC boundaries.",
			diff: { additions: 3320, deletions: 12, files: 41 },
			project: "superset-sh / superset",
			pullRequest: 6003,
			workspaceId: "workspace-pr-6003",
		},
	}),
	demoWorkItem({
		id: "review-603",
		title: "Review: preserve cached season analytics",
		stage: "review",
		source: "github-pr",
		sourceKey: "#603",
		metadata: {
			agent: "reviewer",
			age: "26m",
			board: "review",
			branch: "fix/cached-season",
			checks: { passed: 9, failed: 1 },
			decision: "Resolve failing check",
			description:
				"Review found one rights-gated snapshot failure and has stopped before merge.",
			diff: { additions: 64, deletions: 21, files: 7 },
			project: "race-calendar / F1Calendar",
			pullRequest: 603,
			workspaceId: "workspace-pr-603",
		},
	}),
	demoWorkItem({
		id: "review-599",
		title: "Review: remove stale documentation",
		stage: "done",
		source: "github-pr",
		sourceKey: "#599",
		metadata: {
			age: "2h",
			board: "review",
			branch: "docs/stale-cleanup",
			checks: { passed: 5, failed: 0 },
			decision: "Shipped",
			description:
				"Docs-only patch merged after link and index checks. No analytics update was needed.",
			diff: { additions: 12, deletions: 344, files: 18 },
			project: "race-calendar / F1Calendar",
			pullRequest: 599,
		},
	}),
];
