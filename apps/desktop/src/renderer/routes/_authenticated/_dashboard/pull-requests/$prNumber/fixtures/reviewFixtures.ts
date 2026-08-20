import type { ReviewTabData } from "../types/review";

/**
 * PLACEHOLDER DATA — no risk-classification backend exists yet. The Review
 * tab renders this fixture regardless of which PR is open so the UI can ship
 * ahead of that pipeline; swap this import for a real query once one lands.
 */
export const REVIEW_FIXTURE: ReviewTabData = {
	whatItDoes:
		"Reorganizes the PR detail page into Review, Summary, Code, and Checks tabs, and adds a risk-triaged summary that surfaces the changes most likely to need careful review first.",
	keyChanges: [
		"PR detail page gains a tab bar with Review as the default view",
		"A new Review tab pairs a narrative description with a risk-triaged sidebar",
		"High-risk changes surface first; everything else collapses under Other Changes",
	],
	reviewFocus: ["Selective staging removed", "No test coverage"],
	chapters: [
		{
			id: "chapter-1",
			order: 1,
			title: "Pin release action to a verified SHA",
			summary:
				"Replaces the floating tag reference in the release workflow with a commit SHA to close a supply-chain gap.",
			keyChanges: [],
			riskLevel: "high",
			riskReasons: [
				"Runs with elevated publish credentials",
				"A compromised upstream tag could execute in this workflow",
			],
			additions: 420,
			deletions: 69,
		},
		{
			id: "chapter-2",
			order: 2,
			title: "Patch ws to clear two vulnerability alerts",
			summary:
				"Bumps the ws dependency past two disclosed CVEs affecting the WebSocket server used in production.",
			keyChanges: [],
			riskLevel: "high",
			riskReasons: ["Production runtime dependency, not dev-only tooling"],
			additions: 2,
			deletions: 2,
		},
		{
			id: "chapter-3",
			order: 3,
			title: "Rename internal helper for clarity",
			summary: "Mechanical rename with no behavior change.",
			keyChanges: [],
			riskLevel: "low",
			riskReasons: [],
			additions: 14,
			deletions: 14,
		},
		{
			id: "chapter-4",
			order: 4,
			title: "Add fixture data for the new review sidebar",
			summary:
				"Test-only fixtures backing the new UI; no production behavior affected.",
			keyChanges: [],
			riskLevel: "low",
			riskReasons: [],
			additions: 86,
			deletions: 0,
		},
		{
			id: "chapter-5",
			order: 5,
			title: "Update tab layout and sidebar copy",
			summary:
				"Localized presentational changes to the PR detail page; no data fetching or permissions affected.",
			keyChanges: [],
			riskLevel: "medium",
			riskReasons: [
				"Touches a high-traffic page, though the change is presentational",
			],
			additions: 118,
			deletions: 41,
		},
	],
	evidence: [
		{ id: "evidence-1", label: "Test Results", kind: "document" },
		{ id: "evidence-2", label: "Screenshots", kind: "image" },
		{ id: "evidence-3", label: "CDP Video", kind: "video" },
		{ id: "evidence-4", label: "UI Review", kind: "document" },
		{ id: "evidence-5", label: "Lint Report", kind: "document" },
	],
	comments: [
		{
			id: "comment-1",
			authorName: "coderabbitai[bot]",
			authorAvatarUrl: null,
			status: "resolved",
			body: "Looks good — the SHA pin matches the latest published release tag.",
		},
		{
			id: "comment-2",
			authorName: "coderabbitai[bot]",
			authorAvatarUrl: null,
			status: "high-risk",
			body: "This workflow still has write access to packages; consider scoping the token down further.",
		},
		{
			id: "comment-3",
			authorName: "coderabbitai[bot]",
			authorAvatarUrl: null,
			status: "resolved",
			body: "ws bump looks correct against the advisory range.",
		},
	],
};
