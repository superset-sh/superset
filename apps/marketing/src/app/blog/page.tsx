import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/blog";
import { BlogCard } from "./components/BlogCard";

export const metadata: Metadata = {
	title: "Blog | Superset",
	description:
		"News, updates, and insights from the Superset team about parallel coding agents and developer productivity.",
};

function GridCross({ className }: { className?: string }) {
	return (
		<div className={`absolute ${className}`}>
			<div className="absolute -translate-x-1/2 -translate-y-1/2 w-px h-4 bg-border" />
			<div className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-border" />
		</div>
	);
}

export default async function BlogPage() {
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
						Blog
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						News & Updates
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						Insights from the Superset team about parallel coding agents and
						developer productivity.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Posts section */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{posts.length === 0 ? (
					<p className="text-muted-foreground">No posts yet.</p>
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
