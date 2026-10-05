import { Trans } from "@lingui/react/macro";
import Link from "next/link";
export function LeaderboardBackLink() {
	return (
		<Link
			href="/leaderboard"
			className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
		>
			<Trans>← Back to leaderboard</Trans>
		</Link>
	);
}
