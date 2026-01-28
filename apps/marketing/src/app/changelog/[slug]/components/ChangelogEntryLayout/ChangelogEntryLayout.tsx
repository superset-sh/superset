"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { GridCross } from "@/app/blog/components/GridCross";
import {
	type ChangelogEntry,
	formatChangelogDate,
} from "@/lib/changelog-utils";

interface ChangelogEntryLayoutProps {
	entry: ChangelogEntry;
	children: ReactNode;
}

export function ChangelogEntryLayout({
	entry,
	children,
}: ChangelogEntryLayoutProps) {
	const formattedDate = formatChangelogDate(entry.date);

	return (
		<article className="relative min-h-screen">
			{/* Grid background with dashed lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Hero header */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12">
					{/* Grid crosses */}
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<div className="text-center">
						<time
							dateTime={entry.date}
							className="text-sm font-mono text-muted-foreground uppercase tracking-wider"
						>
							{formattedDate}
						</time>

						<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-4 mb-4">
							{entry.title}
						</h1>

						{entry.description && (
							<p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
								{entry.description}
							</p>
						)}
					</div>
				</div>

				{/* Bottom crosses */}
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Back link section */}
			<div className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 py-4">
					<Link
						href="/changelog"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Changelog
					</Link>
				</div>
			</div>

			{/* Featured image */}
			{entry.image && (
				<div className="relative max-w-3xl mx-auto px-6 pt-12">
					<div className="relative overflow-hidden border border-border">
						{/* biome-ignore lint/performance/noImgElement: Need native img for natural dimensions */}
						<img
							src={entry.image}
							alt={entry.title}
							className="w-full h-auto"
						/>
					</div>
				</div>
			)}

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				<div className="prose max-w-none">{children}</div>
			</div>

			{/* Footer */}
			<footer className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />
				</div>
				<div className="max-w-3xl mx-auto px-6 py-10">
					<Link
						href="/changelog"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						All updates
					</Link>
				</div>
			</footer>
		</article>
	);
}
