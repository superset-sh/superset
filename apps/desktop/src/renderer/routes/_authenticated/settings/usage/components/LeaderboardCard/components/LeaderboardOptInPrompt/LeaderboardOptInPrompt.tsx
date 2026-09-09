import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { formatTokens } from "@superset/shared/format-tokens";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LeaderboardJoinDialog } from "renderer/components/LeaderboardJoinDialog";
import { useLeaderboardJoinPreview } from "renderer/routes/_authenticated/hooks/useLeaderboardJoinPreview";
import { CardFrame } from "../CardFrame";
import { StatTile } from "./components/StatTile";

interface LeaderboardOptInPromptProps {
	hostUrl: string | null;
	join: (handle: string) => Promise<boolean>;
	joining: boolean;
	localTokens: number | null;
	localTokensLoading: boolean;
	participants: number | null;
	collapsed: boolean;
	onToggleCollapsed: () => void;
}

export function LeaderboardOptInPrompt({
	hostUrl,
	join,
	joining,
	localTokens,
	localTokensLoading,
	participants,
	collapsed,
	onToggleCollapsed,
}: LeaderboardOptInPromptProps) {
	const {
		preview,
		suggestedHandle,
		isLoading: previewLoading,
		load,
	} = useLeaderboardJoinPreview(hostUrl);

	const [open, setOpen] = useState(false);

	const openJoin = () => {
		setOpen(true);
		void load();
	};

	// Blurred digits sized to the board, so the tease reads as "a real rank
	// you can't see yet" rather than a placeholder.
	const hiddenRank = `#${"8".repeat(String(participants ?? 100).length)}`;

	return (
		<>
			<CardFrame
				collapsed={collapsed}
				onToggleCollapsed={onToggleCollapsed}
				title={<Trans>Where do you rank?</Trans>}
				actions={
					<Button size="sm" onClick={openJoin}>
						<Trans>Reveal my rank</Trans>
					</Button>
				}
			>
				<div className="mt-2 flex items-center justify-between gap-6 pl-7">
					<p className="text-xs text-muted-foreground">
						{participants !== null ? (
							<Trans>
								{formatNumber(participants)} developers are ranked by agent
								usage. Your last 30 days are already counted, just hidden. Token
								counts and model names only, no repo names, file paths or
								prompts.
							</Trans>
						) : (
							<Trans>
								See where your last 30 days land on the public leaderboard.
								Token counts and model names only, no repo names, file paths or
								prompts.
							</Trans>
						)}
					</p>
					<div className="flex shrink-0 gap-8">
						<StatTile
							label={<Trans>Your tokens</Trans>}
							value={localTokens === null ? "—" : formatTokens(localTokens)}
							hint={<Trans>last 30 days</Trans>}
							loading={localTokensLoading}
						/>
						<StatTile
							label={<Trans>Your rank</Trans>}
							value={
								<>
									<span aria-hidden className="select-none blur-[5px]">
										{hiddenRank}
									</span>
									<span className="sr-only">
										<Trans>Hidden until you join</Trans>
									</span>
								</>
							}
							hint={
								participants !== null ? (
									<Trans>of {formatNumber(participants)}</Trans>
								) : (
									" "
								)
							}
						/>
					</div>
				</div>
			</CardFrame>

			<LeaderboardJoinDialog
				open={open}
				onOpenChange={setOpen}
				preview={preview}
				suggestedHandle={suggestedHandle}
				isLoading={previewLoading}
				isJoining={joining}
				onConfirm={async (handle) => {
					if (await join(handle)) setOpen(false);
				}}
			/>
		</>
	);
}
