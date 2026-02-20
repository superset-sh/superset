import type { Metadata } from "next";
import Link from "next/link";
import { GridCross } from "@/app/blog/components/GridCross";
import { getComparisonPages } from "@/lib/compare";
import { formatCompareDate } from "@/lib/compare-utils";

export const metadata: Metadata = {
	title: "Compare Superset | AI Coding Tool Comparisons",
	description:
		"Compare Superset with Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot, and more. See how parallel agent orchestration stacks up against other AI coding tools.",
	alternates: {
		canonical: "/compare",
	},
	openGraph: {
		title: "Compare Superset | AI Coding Tool Comparisons",
		description:
			"Compare Superset with Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot, and more.",
		url: "/compare",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Compare Superset | AI Coding Tool Comparisons",
		description:
			"Compare Superset with Cursor, Claude Code, Codex, Windsurf, Devin, GitHub Copilot, and more.",
		images: ["/opengraph-image"],
	},
};

export default async function ComparePage() {
	const pages = getComparisonPages();

	const oneVsOne = pages.filter((p) => p.type === "1v1");
	const roundups = pages.filter((p) => p.type === "roundup");

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
						Compare
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						Superset vs the Alternatives
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						See how Superset compares to other AI coding tools — from AI editors
						to coding agents to cloud-based AI engineers.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{roundups.length > 0 && (
					<section className="mb-12">
						<h2 className="text-xl font-medium text-foreground mb-6">
							Roundups
						</h2>
						<div className="flex flex-col gap-4">
							{roundups.map((page) => (
								<CompareCard key={page.slug} page={page} />
							))}
						</div>
					</section>
				)}

				{oneVsOne.length > 0 && (
					<section>
						<h2 className="text-xl font-medium text-foreground mb-6">
							Head-to-Head Comparisons
						</h2>
						<div className="flex flex-col gap-4">
							{oneVsOne.map((page) => (
								<CompareCard key={page.slug} page={page} />
							))}
						</div>
					</section>
				)}

				{pages.length === 0 && (
					<p className="text-muted-foreground">No comparisons yet.</p>
				)}
			</div>
		</main>
	);
}

function CompareCard({
	page,
}: {
	page: ReturnType<typeof getComparisonPages>[number];
}) {
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
				Updated {formatCompareDate(page.lastUpdated || page.date)}
			</span>
		</Link>
	);
}
