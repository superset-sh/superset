import type { BranchSyncStatus, PRFlowState } from "../getPRFlowState";

/**
 * Builds the markdown attachment that is passed to the agent when the
 * PR action button is clicked. The skill reads this file to decide
 * whether to commit, publish, or push before calling `gh pr create`.
 */
export function buildPRContext(state: PRFlowState): string {
	switch (state.kind) {
		case "no-pr":
			return renderNoPR(state.sync);
		default:
			return renderStub(state.kind);
	}
}

function renderNoPR(sync: BranchSyncStatus): string {
	const lines: string[] = [];
	lines.push("# PR context");
	lines.push("");
	lines.push(
		"You are about to create a pull request. Use this snapshot to",
		"decide what steps to run before calling `gh pr create`.",
	);
	lines.push("");

	lines.push("## Branch");
	lines.push(`- Current: \`${sync.currentBranch ?? "(detached)"}\``);
	lines.push(`- Base: \`${sync.defaultBranch ?? "(unknown)"}\``);
	lines.push(`- Published: ${sync.hasUpstream ? "yes" : "no"}`);
	lines.push("");

	lines.push("## Sync");
	lines.push(
		`- Commits ahead of upstream: ${sync.hasUpstream ? sync.pushCount : "n/a"}`,
	);
	lines.push(
		`- Commits behind upstream: ${sync.hasUpstream ? sync.pullCount : "n/a"}`,
	);
	lines.push(`- Uncommitted changes: ${sync.hasUncommitted ? "yes" : "no"}`);
	lines.push("");

	lines.push("## Required preconditions");
	if (sync.hasUncommitted) {
		lines.push("- Commit or stash uncommitted changes.");
	}
	if (!sync.hasUpstream) {
		lines.push("- Publish the branch (`git push -u origin <branch>`).");
	} else if (sync.pushCount > 0) {
		lines.push("- Push unpushed commits.");
	}
	if (sync.hasUpstream && sync.pullCount > 0) {
		lines.push(
			"- Branch is behind upstream; pull/rebase before creating the PR,",
			"  or stop and ask the user to resolve.",
		);
	}
	lines.push("");

	lines.push("## Creating the PR");
	if (sync.defaultBranch) {
		lines.push(
			`- Run \`gh pr create --base ${sync.defaultBranch} --title "..." --body "..."\`.`,
		);
	} else {
		lines.push(
			"- Resolve the base branch first (e.g. `gh repo view --json defaultBranchRef`),",
			'  then run `gh pr create --base <resolved-branch> --title "..." --body "..."`.',
		);
	}
	lines.push(
		"- If the prompt includes `--draft`, add `--draft` to the `gh` call.",
	);
	lines.push("- Print the PR URL at the end.");
	lines.push("");

	return lines.join("\n");
}

function renderStub(kind: PRFlowState["kind"]): string {
	return `# PR context (${kind})\n\nNo additional context is available for this state yet.\n`;
}
