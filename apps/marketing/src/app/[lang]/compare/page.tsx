import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { getComparisonPages } from "@/lib/compare";
import { formatCompareDate } from "@/lib/compare-utils";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "Compare Superset | AI Coding Comparisons and Guides",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"Compare Superset with Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot, and more. Browse side-by-side comparisons, roundups, and workflow guides.",
		}),
	);
	return {
		title,
		description,
		alternates: {
			canonical: localeUrl(lang, "/compare"),
			languages: localizedAlternates(lang, "/compare").languages,
		},
		openGraph: {
			title: `${title} | Superset`,
			description: description,
			url: localeUrl(lang, "/compare"),
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

export default async function ComparePage() {
	await initServerI18n();

	const pages = getComparisonPages();

	const oneVsOne = pages.filter((p) => p.type === "1v1");
	const roundups = pages.filter((p) => p.type === "roundup");
	const tutorials = pages.filter((p) => p.type === "tutorial");

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
						<Trans>Compare</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						<Trans>Superset vs the Alternatives</Trans>
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<Trans>
							See how Superset compares to other AI coding tools, from AI
							editors to coding agents to cloud-based AI engineers.
						</Trans>
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{roundups.length > 0 && (
					<CompareSection title={<Trans>Roundups</Trans>} pages={roundups} />
				)}

				{tutorials.length > 0 && (
					<CompareSection
						title={<Trans>Workflow Tutorials</Trans>}
						pages={tutorials}
					/>
				)}

				{oneVsOne.length > 0 && (
					<CompareSection
						title={<Trans>Head-to-Head Comparisons</Trans>}
						pages={oneVsOne}
					/>
				)}

				{pages.length === 0 && (
					<p className="text-muted-foreground">
						<Trans>No comparisons yet.</Trans>
					</p>
				)}
			</div>
		</main>
	);
}

function CompareSection({
	title,
	pages,
}: {
	title: ReactNode;
	pages: ReturnType<typeof getComparisonPages>;
}) {
	return (
		<section className="mb-12 last:mb-0">
			<h2 className="text-xl font-medium text-foreground mb-6">{title}</h2>
			<div className="flex flex-col gap-4">
				{pages.map((page) => (
					<CompareCard key={page.slug} page={page} />
				))}
			</div>
		</section>
	);
}

function CompareCard({
	page,
}: {
	page: ReturnType<typeof getComparisonPages>[number];
}) {
	const date = formatCompareDate(page.lastUpdated || page.date);

	return (
		<Link
			href={page.url}
			className="group block border border-border rounded-lg p-5 hover:border-foreground/20 transition-colors"
		>
			<h3 className="text-base font-medium text-foreground group-hover:text-foreground/80 transition-colors">
				{page.title}
			</h3>
			{page.description && (
				<p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
					{page.description}
				</p>
			)}
			<span className="text-xs text-muted-foreground mt-3 block">
				<Trans>Updated {date}</Trans>
			</span>
		</Link>
	);
}
