"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogPost } from "@/lib/blog";

interface TocItem {
	id: string;
	text: string;
	level: number;
}

interface BlogPostLayoutProps {
	post: BlogPost;
	toc: TocItem[];
	children: ReactNode;
}

function GridCross({ className }: { className?: string }) {
	return (
		<div className={`absolute ${className}`}>
			<div className="absolute -translate-x-1/2 -translate-y-1/2 w-px h-4 bg-border" />
			<div className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-border" />
		</div>
	);
}

export function BlogPostLayout({ post, children }: BlogPostLayoutProps) {
	const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

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
				<div className="max-w-3xl mx-auto px-6 py-20 md:py-28">
					{/* Grid crosses */}
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<div className="text-center">
						<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
							{post.category}
						</span>

						<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-6 mb-6">
							{post.title}
						</h1>

						{post.description && (
							<p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
								{post.description}
							</p>
						)}

						<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
							<span className="text-foreground/70">{post.author}</span>
							<span className="text-muted-foreground/50">·</span>
							<time dateTime={post.date}>{formattedDate}</time>
						</div>
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
				<div className="max-w-3xl mx-auto px-6 py-6">
					<Link
						href="/blog"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Blog
					</Link>
				</div>
			</div>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-16">
				<div className="prose max-w-none">
					{children}
				</div>
			</div>

			{/* Footer */}
			<footer className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />
				</div>
				<div className="max-w-3xl mx-auto px-6 py-12">
					<Link
						href="/blog"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						All posts
					</Link>
				</div>
			</footer>
		</article>
	);
}
