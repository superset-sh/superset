import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	daysSinceLaunch,
	LEADERBOARD_LAUNCH_DAY,
} from "@superset/trpc/leaderboard-periods";
import { handleSchema } from "@superset/trpc/leaderboard-schema";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { useEffect, useState } from "react";
import { BACKFILL_DAYS, type BackfillRange } from "renderer/lib/leaderboard";
import { RankTeaser } from "./components/RankTeaser";
import type { LeaderboardPreview } from "./types";

interface LeaderboardJoinDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	preview: LeaderboardPreview | null;
	suggestedHandle: string | null;
	isLoading: boolean;
	isJoining: boolean;
	onConfirm: (handle: string, range: BackfillRange) => void;
}

export function LeaderboardJoinDialog({
	open,
	onOpenChange,
	preview,
	suggestedHandle,
	isLoading,
	isJoining,
	onConfirm,
}: LeaderboardJoinDialogProps) {
	const { t } = useLingui();
	const { formatDate } = useFormat();
	const [handle, setHandle] = useState("");
	const [edited, setEdited] = useState(false);
	const canReachLaunch = daysSinceLaunch() > BACKFILL_DAYS;
	const [range, setRange] = useState<BackfillRange>(
		canReachLaunch ? "launch" : "recent",
	);

	useEffect(() => {
		if (!edited && suggestedHandle) setHandle(suggestedHandle);
	}, [edited, suggestedHandle]);

	const trimmed = handle.trim().toLowerCase();
	const valid = handleSchema.safeParse(trimmed).success;
	const launchDate = formatDate(
		new Date(`${LEADERBOARD_LAUNCH_DAY}T00:00:00Z`),
		{
			month: "long",
			day: "numeric",
			timeZone: "UTC",
		},
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Join the leaderboard</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Publishes your token counts and model names, never repo names,
							file paths or prompts. You can leave at any time, which deletes
							everything you've published.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{isLoading ? (
						<p className="text-sm text-muted-foreground">
							<Trans>Reading your local usage…</Trans>
						</p>
					) : preview ? (
						<RankTeaser preview={preview} />
					) : null}

					<div className="space-y-1.5">
						<Label htmlFor="leaderboard-handle">
							<Trans>Handle</Trans>
						</Label>
						<Input
							id="leaderboard-handle"
							value={handle}
							onChange={(event) => {
								setEdited(true);
								setHandle(event.target.value);
							}}
							placeholder={t({
								message: "pick a name for the board",
							})}
							autoComplete="off"
							spellCheck={false}
						/>
						<p className="text-xs text-muted-foreground">
							<Trans>Shown publicly alongside your name.</Trans>
						</p>
					</div>

					{canReachLaunch && (
						<div className="space-y-1.5">
							<Label>
								<Trans>Usage to publish</Trans>
							</Label>
							<RadioGroup
								className="gap-2"
								value={range}
								onValueChange={(next) => setRange(next as BackfillRange)}
								disabled={isJoining}
							>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="launch" id="backfill-launch" />
									<Label
										htmlFor="backfill-launch"
										className="font-normal cursor-pointer"
									>
										<Trans>Everything since {launchDate}</Trans>
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="recent" id="backfill-recent" />
									<Label
										htmlFor="backfill-recent"
										className="font-normal cursor-pointer"
									>
										<Trans>Last {BACKFILL_DAYS} days only</Trans>
									</Label>
								</div>
							</RadioGroup>
							<p className="text-xs text-muted-foreground">
								<Trans>
									The board starts on {launchDate}. The wider range rebuilds
									everything from the transcripts still on this machine, so a
									rank you had before leaving comes back.
								</Trans>
							</p>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
						disabled={isJoining}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						size="sm"
						disabled={!valid || isJoining}
						onClick={() => onConfirm(trimmed, range)}
					>
						{isJoining ? <Trans>Joining…</Trans> : <Trans>Join</Trans>}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
