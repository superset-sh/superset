import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/blog";
import { BlogCard } from "./components/BlogCard";

export const metadata: Metadata = {
	title: "Blog | Superset",
	description:
		"News, updates, and insights from the Superset team about parallel coding agents and developer productivity.",
};

export default async function BlogPage() {
	const posts = getBlogPosts();

	return (
		<main className="relative min-h-screen">
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

			<div className="relative mx-auto max-w-3xl px-6 py-24 md:py-32">
				<header className="mb-16">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Blog
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white mt-4">
						News & Updates
					</h1>
					<p className="text-muted-foreground mt-4 max-w-lg">
						Insights from the Superset team about parallel coding agents and developer productivity.
					</p>
				</header>

				{posts.length === 0 ? (
					<p className="text-white/50">No posts yet.</p>
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
