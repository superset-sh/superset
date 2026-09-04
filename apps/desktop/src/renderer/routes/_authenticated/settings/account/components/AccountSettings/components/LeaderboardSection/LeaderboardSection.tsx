import { Trans, useLingui } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { LeaderboardJoinDialog } from "renderer/components/LeaderboardJoinDialog";
import { useLeaderboardJoinPreview } from "renderer/routes/_authenticated/hooks/useLeaderboardJoinPreview";
import { useLeaderboardOptIn } from "renderer/routes/_authenticated/hooks/useLeaderboardOptIn";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function LeaderboardSection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const { activeHostUrl } = useLocalHostService();
	const { handle, isLoading, optedIn, join, leave, joining } =
		useLeaderboardOptIn();

	const {
		preview,
		suggestedHandle,
		isLoading: previewLoading,
		load,
	} = useLeaderboardJoinPreview(activeHostUrl);

	const [joinOpen, setJoinOpen] = useState(false);
	const [leaveOpen, setLeaveOpen] = useState(false);

	const openJoin = () => {
		setJoinOpen(true);
		void load();
	};

	return (
		<>
			<div className="flex items-start justify-between gap-6">
				<div className="space-y-1 flex-1">
					<Label htmlFor="leaderboard-opt-in" className="text-sm font-medium">
						<HighlightText
							text={t({
								message: "Public leaderboard",
							})}
							query={searchQuery}
						/>
					</Label>
					<p className="text-xs text-muted-foreground">
						{optedIn && handle ? (
							<Trans>
								Publishing as <span className="text-foreground">{handle}</span>.
								Token counts and model names only, no repo names, file paths or
								prompts.
							</Trans>
						) : (
							<Trans>
								Rank your agent usage against other engineers. Token counts and
								model names only, no repo names, file paths or prompts.
							</Trans>
						)}
					</p>
				</div>
				<Switch
					id="leaderboard-opt-in"
					checked={optedIn}
					disabled={isLoading || joining}
					onCheckedChange={(next) => {
						if (next) openJoin();
						else setLeaveOpen(true);
					}}
				/>
			</div>

			<LeaderboardJoinDialog
				open={joinOpen}
				onOpenChange={setJoinOpen}
				preview={preview}
				suggestedHandle={suggestedHandle}
				isLoading={previewLoading}
				isJoining={joining}
				onConfirm={async (handle) => {
					if (await join(handle)) setJoinOpen(false);
				}}
			/>

			<AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Leave the leaderboard?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								Everything you've published is deleted, not hidden. You can
								rejoin later and it will rebuild from the transcripts still on
								this machine — only your past ranking is lost.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (await leave()) setLeaveOpen(false);
							}}
						>
							<Trans>Leave and delete</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
