import { Button } from "@superset/ui/button";
import { TrophyIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { LeaderboardJoinDialog } from "renderer/components/LeaderboardJoinDialog";
import { useLeaderboardJoinPreview } from "renderer/routes/_authenticated/hooks/useLeaderboardJoinPreview";
import { useLeaderboardOptIn } from "renderer/routes/_authenticated/hooks/useLeaderboardOptIn";

export function LeaderboardPrompt({ hostUrl }: { hostUrl: string | null }) {
	const { isLoading, optedIn, join, joining } = useLeaderboardOptIn();
	const {
		preview,
		suggestedHandle,
		isLoading: previewLoading,
		load,
	} = useLeaderboardJoinPreview(hostUrl);

	const [dismissed, setDismissed] = useState(false);
	const [open, setOpen] = useState(false);

	if (isLoading || optedIn || dismissed) return null;

	const openJoin = () => {
		setOpen(true);
		void load();
	};

	return (
		<>
			<div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
				<TrophyIcon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium">Compare this with everyone else</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						Publish token counts and model names to the public leaderboard. No
						repo names, file paths or prompts. Leave any time.
					</p>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button size="sm" variant="outline" onClick={openJoin}>
						See my rank
					</Button>
					<Button
						size="sm"
						variant="ghost"
						aria-label="Dismiss"
						onClick={() => setDismissed(true)}
					>
						<XIcon className="size-3.5" />
					</Button>
				</div>
			</div>

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
