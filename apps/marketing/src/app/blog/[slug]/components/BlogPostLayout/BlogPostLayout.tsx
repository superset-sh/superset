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

export function BlogPostLayout({ post, children }: BlogPostLayoutProps) {
	const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		<article className="relative min-h-screen">
			{/* Grid background */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
						linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
					`,
					backgroundSize: "64px 64px",
				}}
			/>

			{/* Hero header */}
			<header className="relative py-24 md:py-32 text-center px-6">
				<div className="max-w-3xl mx-auto">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						{post.category}
					</span>

					<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-white mt-6 mb-6">
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
			</header>

			{/* Back link with line */}
			<div className="relative max-w-3xl mx-auto px-6 mb-12">
				<div className="flex items-center gap-4">
					<Link
						href="/blog"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
					>
						<ArrowLeft className="h-4 w-4" />
						Blog
					</Link>
					<div className="flex-1 h-px bg-border" />
				</div>
			</div>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 pb-24">
				<div className="prose max-w-none">
					{children}
				</div>
			</div>
		</article>
	);
}
