"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GridCross } from "@/app/blog/components/GridCross";
import { type ComparisonPage, formatCompareDate } from "@/lib/compare-utils";

interface CompareLayoutProps {
	page: ComparisonPage;
	children: ReactNode;
}

export function CompareLayout({ page, children }: CompareLayoutProps) {
	const formattedDate = formatCompareDate(page.lastUpdated ?? page.date);

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
						<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
							Comparison
						</span>

						<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-4 mb-4">
							{page.title}
						</h1>

						{page.description && (
							<p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
								{page.description}
							</p>
						)}

						<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
							<span>Last updated</span>
							<span className="text-muted-foreground/50">·</span>
							<time dateTime={page.lastUpdated ?? page.date}>
								{formattedDate}
							</time>
						</div>
					</div>
				</div>

				{/* Bottom crosses */}
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				<div className="prose max-w-none">{children}</div>
			</div>

			{/* Footer CTA */}
			<footer className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />
				</div>
				<div className="max-w-3xl mx-auto px-6 py-10 text-center">
					<p className="text-muted-foreground mb-4">Ready to try Superset?</p>
					<Link
						href="/"
						className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors border border-border rounded-md px-4 py-2"
					>
						Get started
					</Link>
				</div>
			</footer>
		</article>
	);
}
