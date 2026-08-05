import type {
	DashboardSidebarWorkspacePullRequest,
	DashboardSidebarWorkspacePullRequestCheck,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import type {
	PrototypeLinearStatus,
	PrototypeRepo,
	PrototypeWorkspace,
} from "../model/types";

/**
 * Fixture "now". Fixed constant (no Date.now()) so fixtures are deterministic;
 * the store advances a virtual clock relative to this.
 */
export const FIXTURE_NOW = new Date("2026-07-20T14:00:00.000Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const REPOS = {
	dotfile: {
		id: "repo-dotfile",
		name: "dotfile",
		owner: "dotfile",
		iconUrl: null,
	},
	dotskills: {
		id: "repo-dotskills",
		name: "dotskills",
		owner: "dotfile",
		iconUrl: null,
	},
	infrastructure: {
		id: "repo-infra",
		name: "infrastructure",
		owner: "dotfile",
		iconUrl: null,
	},
	superset: {
		id: "repo-superset",
		name: "superset",
		owner: "superset-sh",
		iconUrl: null,
	},
} satisfies Record<string, PrototypeRepo>;

const LINEAR = {
	inProgress: {
		label: "In Progress",
		type: "in-progress",
		iconType: "started",
		color: "#f59e0b",
		progress: 50,
	},
	inReview: {
		label: "In Review",
		type: "in-review",
		iconType: "started",
		color: "#3b82f6",
		progress: 75,
	},
	todo: {
		label: "Todo",
		type: "todo",
		iconType: "unstarted",
		color: "#9ca3af",
	},
	backlog: {
		label: "Backlog",
		type: "backlog",
		iconType: "backlog",
		color: "#9ca3af",
	},
	done: {
		label: "Done",
		type: "done",
		iconType: "completed",
		color: "#22c55e",
	},
} satisfies Record<string, PrototypeLinearStatus>;

function check(
	name: string,
	status: DashboardSidebarWorkspacePullRequestCheck["status"],
): DashboardSidebarWorkspacePullRequestCheck {
	return { name, status, url: null };
}

function pr(
	number: number,
	state: DashboardSidebarWorkspacePullRequest["state"],
	overrides: Partial<DashboardSidebarWorkspacePullRequest> = {},
): DashboardSidebarWorkspacePullRequest {
	return {
		url: `https://github.com/dotfile/repo/pull/${number}`,
		number,
		title: `PR #${number}`,
		state,
		reviewDecision: null,
		checksStatus: "none",
		checks: [],
		...overrides,
	};
}

/**
 * A hand-authored fleet spanning repos, agent statuses, PR states, linear
 * statuses, and activity ages — chosen to exercise every group-by/order-by
 * combination and the ⌘J ranking.
 */
export const FIXTURE_WORKSPACES: PrototypeWorkspace[] = [
	{
		id: "ws-re-review",
		title: "Re-review !5620",
		repo: REPOS.dotfile,
		agentStatus: "permission",
		pullRequest: pr(5620, "open", {
			reviewDecision: "changes_requested",
			checksStatus: "success",
			checks: [check("build", "success"), check("test", "success")],
		}),
		linearStatus: LINEAR.inReview,
		lastActivityAt: FIXTURE_NOW - 12 * MIN,
		createdAt: FIXTURE_NOW - 2 * DAY,
		diff: { additions: 47, deletions: 9 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-push-hook",
		title: "Push hook check for invalid refs",
		repo: REPOS.dotfile,
		agentStatus: "review",
		pullRequest: pr(5644, "open", {
			reviewDecision: "pending",
			checksStatus: "failure",
			checks: [check("build", "success"), check("e2e", "failure")],
		}),
		linearStatus: LINEAR.inReview,
		lastActivityAt: FIXTURE_NOW - 26 * MIN,
		createdAt: FIXTURE_NOW - 1 * DAY,
		diff: { additions: 307, deletions: 5 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-risk-score",
		title: "Per category risk score",
		repo: REPOS.dotfile,
		agentStatus: "working",
		pullRequest: null,
		linearStatus: LINEAR.inProgress,
		lastActivityAt: FIXTURE_NOW - 40 * 1000,
		createdAt: FIXTURE_NOW - 5 * HOUR,
		diff: { additions: 147, deletions: 65 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [
			{ port: 3000, label: "web", processName: "next-server", pid: 52301 },
			{ port: 5881, label: "api", processName: "next-server", pid: 52302 },
		],
	},
	{
		id: "ws-stress-test",
		title: "Stress test",
		repo: REPOS.dotfile,
		agentStatus: "working",
		pullRequest: null,
		linearStatus: LINEAR.inProgress,
		lastActivityAt: FIXTURE_NOW - 3 * MIN,
		createdAt: FIXTURE_NOW - 6 * HOUR,
		diff: { additions: 362, deletions: 0 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [
			{ port: 6006, label: "storybook", processName: "node", pid: 51877 },
		],
	},
	{
		id: "ws-spf",
		title: "SPF issue",
		repo: REPOS.dotfile,
		agentStatus: "idle",
		pullRequest: null,
		linearStatus: LINEAR.todo,
		lastActivityAt: FIXTURE_NOW - 6 * DAY,
		createdAt: FIXTURE_NOW - 7 * DAY,
		diff: { additions: 0, deletions: 0 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-debounce",
		title: "Debounce InfoCamere",
		repo: REPOS.dotfile,
		agentStatus: "idle",
		pullRequest: pr(5601, "merged"),
		linearStatus: LINEAR.done,
		lastActivityAt: FIXTURE_NOW - 3 * DAY,
		createdAt: FIXTURE_NOW - 4 * DAY,
		diff: { additions: 244, deletions: 20 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-audit-skills",
		title: "Audit write-skills",
		repo: REPOS.dotskills,
		agentStatus: "review",
		pullRequest: pr(212, "open", {
			reviewDecision: "pending",
			checksStatus: "pending",
			checks: [check("lint", "pending")],
		}),
		linearStatus: LINEAR.inReview,
		lastActivityAt: FIXTURE_NOW - 1 * HOUR,
		createdAt: FIXTURE_NOW - 2 * DAY,
		diff: { additions: 213, deletions: 1230 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-split-skills",
		title: "Split monorepo skills",
		repo: REPOS.dotskills,
		agentStatus: "failed",
		pullRequest: null,
		linearStatus: LINEAR.inProgress,
		lastActivityAt: FIXTURE_NOW - 18 * MIN,
		createdAt: FIXTURE_NOW - 8 * HOUR,
		diff: { additions: 0, deletions: 0 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-harness-obs",
		title: "Harness observability",
		repo: REPOS.dotskills,
		agentStatus: "idle",
		pullRequest: pr(198, "draft"),
		linearStatus: LINEAR.todo,
		lastActivityAt: FIXTURE_NOW - 2 * DAY,
		createdAt: FIXTURE_NOW - 3 * DAY,
		diff: { additions: 580, deletions: 0 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
	},
	{
		id: "ws-paragon-queue",
		title: "Paragon queue",
		repo: REPOS.infrastructure,
		agentStatus: "working",
		pullRequest: null,
		linearStatus: LINEAR.inProgress,
		lastActivityAt: FIXTURE_NOW - 90 * 1000,
		createdAt: FIXTURE_NOW - 4 * HOUR,
		diff: { additions: 15, deletions: 7 },
		hostType: "remote-device",
		workspaceType: "worktree",
		hostIsOnline: true,
		ports: [
			{ port: 8080, label: null, processName: "docker-proxy", pid: 40112 },
		],
	},
	{
		id: "ws-tune-monitor",
		title: "Tune monitor 106893117",
		repo: REPOS.infrastructure,
		agentStatus: "review",
		pullRequest: pr(4411, "open", {
			reviewDecision: "approved",
			checksStatus: "success",
			checks: [check("plan", "success")],
		}),
		linearStatus: LINEAR.inReview,
		lastActivityAt: FIXTURE_NOW - 2 * HOUR,
		createdAt: FIXTURE_NOW - 1 * DAY,
		diff: { additions: 45, deletions: 1 },
		hostType: "remote-device",
		workspaceType: "worktree",
		hostIsOnline: false,
		ports: [],
	},
	{
		id: "ws-improve-report",
		title: "local",
		repo: REPOS.superset,
		agentStatus: "idle",
		pullRequest: null,
		linearStatus: LINEAR.backlog,
		lastActivityAt: FIXTURE_NOW - 5 * DAY,
		createdAt: FIXTURE_NOW - 5 * DAY,
		diff: { additions: 15642, deletions: 50165 },
		hostType: "local-device",
		workspaceType: "main",
		hostIsOnline: null,
		ports: [],
	},
];
