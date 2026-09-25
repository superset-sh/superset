import { Trans } from "@lingui/react/macro";
import { formatTokens } from "@superset/shared/format-tokens";
import type { LeaderboardPreview } from "../../types";

const MIN_PARTICIPANTS_FOR_RANK = 50;

export function RankTeaser({ preview }: { preview: LeaderboardPreview }) {
	if (preview.tokens === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>
					No Claude or Codex usage found on this machine yet. Join now and
					you'll appear once you've used an agent.
				</Trans>
			</p>
		);
	}

	return (
		<div className="space-y-1">
			{preview.total >= MIN_PARTICIPANTS_FOR_RANK ? (
				<p className="text-sm">
					<Trans>
						You'd be{" "}
						<span className="font-medium text-foreground">#{preview.rank}</span>{" "}
						of {preview.total}.
					</Trans>
				</p>
			) : (
				<p className="text-sm">
					<Trans>You'd be one of the first on the board.</Trans>
				</p>
			)}
			<p className="text-xs text-muted-foreground">
				<Trans>
					Based on {formatTokens(preview.tokens)} tokens in the last 30 days,
					counting {preview.providers.join(" and ")}.
				</Trans>
			</p>
		</div>
	);
}
