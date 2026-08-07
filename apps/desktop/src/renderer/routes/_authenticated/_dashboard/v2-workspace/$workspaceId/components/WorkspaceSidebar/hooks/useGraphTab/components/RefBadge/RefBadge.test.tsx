import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GraphRef } from "../../types";
import { RefBadge } from "./RefBadge";

function render(ref: GraphRef, { compact = false, laneColor = 1 } = {}) {
	return renderToStaticMarkup(
		<RefBadge graphRef={ref} compact={compact} laneColor={laneColor} />,
	);
}

describe("RefBadge", () => {
	it("renders HEAD as bare text with no glyph", () => {
		const markup = render({ name: "HEAD", type: "head", state: null });
		expect(markup).toContain("HEAD");
		// A head badge carries no lucide icon (branch/tag do, as <svg>).
		expect(markup).not.toContain("<svg");
	});

	it("uses a branch glyph for branch and remote, a tag glyph for tag", () => {
		// branch + remote both use the GitBranch icon; tag uses Tag. All three
		// render exactly one lucide <svg>.
		for (const type of ["branch", "remote"] as const) {
			const markup = render({ name: "main", type, state: null });
			expect(markup).toMatch(/<svg[^>]*>/);
		}
		expect(render({ name: "v1", type: "tag", state: null })).toMatch(
			/<svg[^>]*>/,
		);
	});

	it("tints an open badge with its lane colour", () => {
		const markup = render(
			{ name: "main", type: "branch", state: "open" },
			{ laneColor: 4 },
		);
		expect(markup).toContain("var(--graph-lane-4)");
		expect(markup).toContain("18%");
		// Non-open badges do not carry the lane tint.
		const closed = render({
			name: "main",
			type: "branch",
			state: "merged",
		});
		expect(closed).not.toContain("var(--graph-lane-");
	});

	it("strikes and flags a prunable ref, surfacing the prune reason", () => {
		const markup = render({
			name: "fix/pty",
			type: "branch",
			state: "prunable",
			pruneReason: "worktree path is gone",
		});
		expect(markup).toContain("line-through");
		expect(markup).toContain("border-destructive");
		// The prune reason rides in the tooltip, not the visible name.
		expect(markup).toContain('title="fix/pty — worktree path is gone"');
	});

	it("mutes a merged ref and underlines an orphan", () => {
		expect(
			render({ name: "docs/x", type: "branch", state: "merged" }),
		).toContain("bg-muted");
		expect(
			render({ name: "chore/x", type: "branch", state: "orphan-branch" }),
		).toContain("underline");
	});

	it("dashes a detached-worktree border and shows the worktree path", () => {
		const markup = render({
			name: "feat/x",
			type: "branch",
			state: "detached-worktree",
			worktreePath: "/tmp/wt/x",
		});
		expect(markup).toContain("border-dashed");
		expect(markup).toContain('title="feat/x — /tmp/wt/x"');
	});

	it("shrinks the badge in compact mode", () => {
		const standard = render(
			{ name: "main", type: "branch", state: "open" },
			{ compact: false },
		);
		const compact = render(
			{ name: "main", type: "branch", state: "open" },
			{ compact: true },
		);
		expect(standard).toContain("h-4");
		expect(standard).toContain("text-[11px]");
		expect(compact).toContain("h-3.5");
		expect(compact).toContain("text-[10px]");
	});

	it("shows the full remote shortname without stripping a prefix", () => {
		// check-git-ref-strings.sh forbids inferring kind from a shortname
		// prefix; the remote name must render verbatim.
		const markup = render({ name: "origin/main", type: "remote", state: null });
		expect(markup).toContain("origin/main");
	});
});
