import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { getBlogPosts } from "@/lib/blog";
import { BlogCard } from "./components/BlogCard";
import { GridCross } from "./components/GridCross";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "Blog",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"News, updates, and insights from the Superset team about parallel coding agents and developer productivity.",
		}),
	);
	return {
		title,
		description,
		alternates: {
			canonical: localeUrl(lang, "/blog"),
			types: {
				"application/rss+xml": "/feed.xml",
			},
			languages: localizedAlternates(lang, "/blog").languages,
		},
		openGraph: {
			title: `${title} | Superset`,
			description: description,
			url: localeUrl(lang, "/blog"),
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

export default async function BlogPage() {
	await initServerI18n();

	const posts = getBlogPosts();

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
						<Trans>Blog</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						<Trans>News & Updates</Trans>
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<Trans>
							Insights from the Superset team about parallel coding agents and
							developer productivity.
						</Trans>
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Posts section */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{posts.length === 0 ? (
					<p className="text-muted-foreground">
						<Trans>No posts yet.</Trans>
					</p>
				) : (
					<div className="flex flex-col gap-4">
						{posts.map((post) => (
							<BlogCard key={post.url} post={post} />
						))}
					</div>
				)}
			</div>
		</main>
	);
}
