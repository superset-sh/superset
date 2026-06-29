import type {
	BranchSyncStatus,
	PRFlowState,
	PullRequest,
} from "../getPRFlowState";

interface BuildPRContextOptions {
	/** Contents of the per-project `.superset/pr-prompt.md`, when present.
	 *  Trimmed and appended as a `## Project guidelines` section that the
	 *  slash command honours. Empty/null skips the section entirely. */
	projectPrompt?: string | null;
}

/**
 * Builds the markdown attachment that is passed to the agent when the
 * PR action button is clicked. The skill reads this file to decide
 * whether to commit, publish, or push before calling `gh pr create`.
 */
export function buildPRContext(
	state: PRFlowState,
	options: BuildPRContextOptions = {},
): string {
	const base = (() => {
		switch (state.kind) {
			case "no-pr":
				return renderNoPR(state.sync);
			case "pr-exists":
				return renderPrExists(state.pr, state.sync);
			default:
				return renderStub(state.kind);
		}
	})();
	return appendProjectGuidelines(base, options.projectPrompt);
}

function appendProjectGuidelines(
	context: string,
	projectPrompt: string | null | undefined,
): string {
	const trimmed = projectPrompt?.trim();
	if (!trimmed) return context;
	return `${context}\n## Project guidelines\n\n${trimmed}\n`;
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

function renderPrExists(
	pr: PullRequest,
	sync: BranchSyncStatus | null,
): string {
	const lines: string[] = [];
	lines.push("# PR context");
	lines.push("");
	lines.push(
		"You are about to update an existing pull request. Use this snapshot",
		"to decide whether to push pending commits and refresh the PR title",
		"or body before reporting back.",
	);
	lines.push("");

	lines.push("## Pull request");
	lines.push(`- Number: #${pr.number}`);
	lines.push(`- URL: ${pr.url}`);
	lines.push(`- State: ${pr.isDraft ? "draft" : pr.state}`);
	lines.push(`- Repo: \`${pr.repoOwner}/${pr.repoName}\``);
	lines.push("");

	if (sync) {
		const baseBranch = pr.baseRefName ?? sync.defaultBranch;
		lines.push("## Branch");
		lines.push(`- Current: \`${sync.currentBranch ?? "(detached)"}\``);
		lines.push(`- Base: \`${baseBranch ?? "(unknown)"}\``);
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

		const preconditions: string[] = [];
		if (sync.hasUncommitted) {
			preconditions.push("- Commit or stash uncommitted changes.");
		}
		if (sync.hasUpstream && sync.pushCount > 0) {
			preconditions.push("- Push unpushed commits.");
		}
		if (sync.hasUpstream && sync.pullCount > 0) {
			preconditions.push(
				"- Branch is behind upstream; pull/rebase before updating the PR,",
				"  or stop and ask the user to resolve.",
			);
		}
		if (preconditions.length > 0) {
			lines.push("## Required preconditions");
			for (const line of preconditions) lines.push(line);
			lines.push("");
		}
	}

	lines.push("## Updating the PR");
	lines.push(
		"- Refresh the PR title/body from latest commits if they have drifted",
		'  (`gh pr edit <number> --title "..." --body "..."`).',
		"- After pushing, print the PR URL on its own line.",
	);
	lines.push("");

	return lines.join("\n");
}

function renderStub(kind: PRFlowState["kind"]): string {
	return `# PR context (${kind})\n\nNo additional context is available for this state yet.\n`;
}
