import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { RoadmapBoard } from "./components/RoadmapBoard";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "Roadmap",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"See what we're building now, what's coming next, and where Superset is headed.",
		}),
	);
	return {
		title,
		description,
		alternates: {
			canonical: localeUrl(lang, "/roadmap"),
			languages: localizedAlternates(lang, "/roadmap").languages,
		},
		openGraph: {
			title: `${title} | Superset`,
			description: description,
			url: localeUrl(lang, "/roadmap"),
			images: ["/opengraph-image"],
		},
		twitter: {
			card: "summary_large_image",
			title: `${title} | Superset`,
			description: description,
			images: ["/opengraph-image"],
		},
	};
}

export default async function RoadmapPage() {
	await initServerI18n();

	const company = COMPANY.NAME;

	return (
		<main className="relative min-h-screen">
			{/* Vertical guide lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Header section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>Roadmap</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						<Trans>What We're Building</Trans>
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<Trans>
							A look at what's in progress, what's coming next, and where{" "}
							{company} is headed. Plans further out stay intentionally flexible
							so we can respond to what you tell us.
						</Trans>
					</p>
					<p className="text-sm text-muted-foreground mt-3">
						<Trans>
							Want something sooner?{" "}
							<a
								href={COMPANY.DISCORD_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="text-foreground underline underline-offset-4 hover:no-underline"
							>
								Tell us in Discord
							</a>
							. Much of what's here started as a user request.
						</Trans>
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-5xl mx-auto px-6 py-12 md:py-16">
				<RoadmapBoard />
			</div>
		</main>
	);
}
