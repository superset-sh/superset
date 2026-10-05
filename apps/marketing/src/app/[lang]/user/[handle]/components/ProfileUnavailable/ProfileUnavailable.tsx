import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import { LeaderboardLayout } from "@/app/[lang]/components/LeaderboardLayout";

export function ProfileUnavailable({
	rateLimited = true,
}: {
	rateLimited?: boolean;
}) {
	return (
		<LeaderboardLayout compact>
			<h1 className="text-2xl md:text-3xl font-medium text-foreground">
				{rateLimited ? (
					<Trans>This profile is busy right now</Trans>
				) : (
					<Trans>Something went wrong</Trans>
				)}
			</h1>
			<p className="text-sm text-muted-foreground leading-relaxed mt-4">
				{rateLimited ? (
					<Trans>Too many people are looking at once. Try again shortly.</Trans>
				) : (
					<Trans>Something went wrong. Please try again.</Trans>
				)}
			</p>
			<Link
				href="/leaderboard"
				className="inline-flex items-center mt-8 px-4 py-2.5 text-sm border border-border text-foreground hover:bg-muted transition-colors"
			>
				<Trans>Back to the leaderboard</Trans>
			</Link>
		</LeaderboardLayout>
	);
}
