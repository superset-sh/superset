import { formatTokens } from "@superset/shared/format-tokens";
import type { LeaderboardPreview } from "../../types";

const MIN_PARTICIPANTS_FOR_RANK = 50;

export function RankTeaser({ preview }: { preview: LeaderboardPreview }) {
	if (preview.tokens === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No Claude or Codex usage found on this machine yet. Join now and you'll
				appear once you've used an agent.
			</p>
		);
	}

	return (
		<div className="space-y-1">
			{preview.total >= MIN_PARTICIPANTS_FOR_RANK ? (
				<p className="text-sm">
					You'd be{" "}
					<span className="font-medium text-foreground">#{preview.rank}</span>{" "}
					of {preview.total}.
				</p>
			) : (
				<p className="text-sm">You'd be one of the first on the board.</p>
			)}
			<p className="text-xs text-muted-foreground">
				Based on {formatTokens(preview.tokens)} tokens in the last 30 days,
				counting {preview.providers.join(" and ")}.
			</p>
		</div>
	);
}
