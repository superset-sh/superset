import { Trans } from "@lingui/react/macro";
import type { SupportedLocale } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { SectionHeading } from "../SectionHeading";
import { MOBILE_LAUNCH_DATE } from "./constants";

interface LatestNewsSectionProps {
	lang: SupportedLocale;
}

export function LatestNewsSection({ lang }: LatestNewsSectionProps) {
	const launchDate = formatDate(
		MOBILE_LAUNCH_DATE,
		{ year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
		lang,
	);
	const mobilePath = lang === "en" ? "/mobile" : `/${lang}/mobile`;

	return (
		<section aria-labelledby="latest-news">
			<SectionHeading id="latest-news">
				<Trans>Latest news</Trans>
			</SectionHeading>
			<article className="mt-6">
				<p className="font-mono text-muted-foreground text-xs">
					<time dateTime="2026-09-21">{launchDate}</time>
				</p>
				<h3 className="mt-2 font-medium text-2xl text-foreground tracking-tight">
					<Trans>Superset Mobile launches on iPhone</Trans>
				</h3>
				<p className="mt-4 text-muted-foreground leading-relaxed">
					<Trans>
						Superset Mobile lets developers continue the Superset workspaces
						they already use on their computer from an iPhone.
					</Trans>
				</p>
				<ul className="mt-4 list-disc space-y-1.5 pl-5 text-muted-foreground leading-relaxed">
					<li>
						<Trans>Continue the same workspace from your iPhone</Trans>
					</li>
					<li>
						<Trans>Prompt agents and answer their questions</Trans>
					</li>
					<li>
						<Trans>Follow terminal sessions live</Trans>
					</li>
					<li>
						<Trans>Review syntax-highlighted diffs</Trans>
					</li>
				</ul>
				<p className="mt-4 text-muted-foreground leading-relaxed">
					<Trans>
						The app is free to download. It requires iOS 26 or later and
						Superset Pro. Android is next.
					</Trans>
				</p>
				<div className="mt-6 flex flex-wrap gap-3 text-sm">
					<a
						href={COMPANY.APP_STORE_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="bg-foreground px-4 py-2 font-medium text-background transition-colors hover:bg-brand hover:text-white"
					>
						<Trans>View on the App Store</Trans>
					</a>
					<Link
						href={mobilePath}
						className="border border-border px-4 py-2 text-foreground transition-colors hover:border-foreground"
					>
						<Trans>Superset for iPhone page</Trans>
					</Link>
				</div>
			</article>
		</section>
	);
}
