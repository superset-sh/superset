import type {
	ComposerChip,
	ComposerDraftSegment,
} from "@superset/chat-ui/PromptInput";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { getPluginIconUrl } from "renderer/components/PluginIcon";
import { PULL_REQUEST_ICON } from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";
import type { PullRequestDisplayState } from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState/toPullRequestDisplayState";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { iconDataUrl } from "../iconDataUrl";

export type LinkedContextChipData =
	| { kind: "linked_issue"; issue: LinkedIssue }
	| { kind: "linked_pr"; pr: LinkedPR };

export type LinkedContext = { issues: LinkedIssue[]; pr: LinkedPR | null };

// Tailwind's emerald-500, purple-500, red-500 and zinc-400: the colours the
// PR and issue rows use, as hex for an <img> chip.
export const LINKED_STATE_COLOR = {
	open: "#10b981",
	merged: "#a855f7",
	closed: "#ef4444",
	draft: "#a1a1aa",
} as const;

function prDisplayState(state: string): PullRequestDisplayState {
	return state === "draft" || state === "merged" || state === "closed"
		? state
		: "open";
}

export function linkedIssueIconUrl(
	issue: LinkedIssue,
	isDark: boolean,
): string | undefined {
	if (issue.source === "github") {
		return issue.state === "closed"
			? iconDataUrl(GoIssueClosed, LINKED_STATE_COLOR.merged)
			: iconDataUrl(GoIssueOpened, LINKED_STATE_COLOR.open);
	}
	return getPluginIconUrl(
		issue.source === "linear" ? "linear" : "superset",
		isDark,
	);
}

export function linkedPrIconUrl(pr: LinkedPR): string {
	const state = prDisplayState(pr.state);
	return iconDataUrl(PULL_REQUEST_ICON[state], LINKED_STATE_COLOR[state]);
}

export function linkedIssueChip(
	issue: LinkedIssue,
	isDark: boolean,
): ComposerChip {
	return {
		label: issue.slug,
		serialized: issue.url ?? `@${issue.slug}`,
		...(issue.title ? { description: issue.title } : {}),
		iconUrl: linkedIssueIconUrl(issue, isDark),
		data: { kind: "linked_issue", issue } satisfies LinkedContextChipData,
	};
}

export function linkedPrChip(pr: LinkedPR): ComposerChip {
	return {
		label: `#${pr.prNumber}`,
		serialized: pr.url,
		...(pr.title ? { description: pr.title } : {}),
		iconUrl: linkedPrIconUrl(pr),
		data: { kind: "linked_pr", pr } satisfies LinkedContextChipData,
	};
}

function chipData(chip: ComposerChip): LinkedContextChipData | null {
	const data = chip.data as
		| { kind?: unknown; issue?: LinkedIssue; pr?: LinkedPR }
		| undefined;
	if (data?.kind === "linked_issue" && data.issue)
		return { kind: "linked_issue", issue: data.issue };
	if (data?.kind === "linked_pr" && data.pr)
		return { kind: "linked_pr", pr: data.pr };
	return null;
}

/** The issues and PR a prompt links, deduped; the first PR chip wins. */
export function linkedContextOf(chips: readonly ComposerChip[]): LinkedContext {
	const issues: LinkedIssue[] = [];
	let pr: LinkedPR | null = null;
	for (const chip of chips) {
		const data = chipData(chip);
		if (!data) continue;
		if (data.kind === "linked_pr") {
			pr ??= data.pr;
		} else if (!issues.some((issue) => issue.slug === data.issue.slug)) {
			issues.push(data.issue);
		}
	}
	return { issues, pr };
}

export function draftLinkedContext(
	segments: readonly ComposerDraftSegment[],
): LinkedContext {
	return linkedContextOf(
		segments.flatMap((segment) =>
			segment.type === "chip" ? [segment.chip] : [],
		),
	);
}

/** A draft that opens with these chips, ready to type after. */
export function linkedContextSeed(
	chips: readonly ComposerChip[],
): ComposerDraftSegment[] {
	return chips.flatMap((chip) => [
		{ type: "chip" as const, chip },
		{ type: "text" as const, text: " " },
	]);
}

const LINEAR_ISSUE_URL = /linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]*-\d+)/i;
const GITHUB_ISSUE_URL = /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/;
const GITHUB_PR_URL = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/;

/** What a pasted link points at, so `@<url>` can resolve to that one item. */
export function linkedRefFromText(
	text: string,
):
	| { kind: "linear"; identifier: string }
	| { kind: "github-issue" | "github-pr"; number: number }
	| null {
	const linear = LINEAR_ISSUE_URL.exec(text);
	if (linear?.[1])
		return { kind: "linear", identifier: linear[1].toUpperCase() };
	const issue = GITHUB_ISSUE_URL.exec(text);
	if (issue?.[1]) return { kind: "github-issue", number: Number(issue[1]) };
	const pr = GITHUB_PR_URL.exec(text);
	if (pr?.[1]) return { kind: "github-pr", number: Number(pr[1]) };
	return null;
}
