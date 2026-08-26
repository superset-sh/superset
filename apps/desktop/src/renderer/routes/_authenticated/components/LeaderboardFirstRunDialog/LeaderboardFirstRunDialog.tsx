import { useEffect, useState } from "react";
import { LeaderboardJoinDialog } from "renderer/components/LeaderboardJoinDialog";
import { authClient } from "renderer/lib/auth-client";
import {
	markLeaderboardAsked,
	readLeaderboardAsked,
} from "renderer/lib/leaderboard";
import { useLeaderboardJoinPreview } from "renderer/routes/_authenticated/hooks/useLeaderboardJoinPreview";
import { useLeaderboardOptIn } from "renderer/routes/_authenticated/hooks/useLeaderboardOptIn";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function LeaderboardFirstRunDialog() {
	const { data: session } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const { isLoading, optedIn, join, joining } = useLeaderboardOptIn();
	const {
		preview,
		suggestedHandle,
		isLoading: previewLoading,
		load,
	} = useLeaderboardJoinPreview(activeHostUrl);

	const [asked, setAsked] = useState(readLeaderboardAsked);
	const [open, setOpen] = useState(false);

	const onboarded = Boolean(session?.user?.onboardedAt);

	useEffect(() => {
		if (asked || !onboarded || isLoading || optedIn) return;

		markLeaderboardAsked();
		setAsked(true);
		setOpen(true);
		void load();
	}, [asked, onboarded, isLoading, optedIn, load]);

	return (
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
	);
}
