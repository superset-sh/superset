import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import { AuthorAvatar } from "@/app/blog/components/AuthorAvatar";
import { BlogCard } from "@/app/blog/components/BlogCard";
import { GridCross } from "@/app/blog/components/GridCross";
import { type BlogPost, formatBlogDate, type TocItem } from "@/lib/blog-utils";

interface BlogPostLayoutProps {
	post: BlogPost;
	toc: TocItem[];
	relatedPosts: BlogPost[];
	children: ReactNode;
}

export function BlogPostLayout({
	post,
	relatedPosts,
	children,
}: BlogPostLayoutProps) {
	const formattedDate = formatBlogDate(post.date);
	const { author } = post;

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
							{post.category}
						</span>

						<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-4 mb-4">
							{post.title}
						</h1>

						{post.description && (
							<p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
								{post.description}
							</p>
						)}

						<div className="inline-flex items-center gap-3 text-sm text-muted-foreground mx-auto">
							<AuthorAvatar name={author.name} avatar={author.avatar} />
							<div className="flex flex-col items-start">
								<span className="text-foreground/70">{author.name}</span>
								<span className="text-xs text-muted-foreground">
									{author.role}
									<span className="text-muted-foreground/50"> · </span>
									<time dateTime={post.date}>{formattedDate}</time>
								</span>
							</div>
						</div>
						<div className="inline-flex items-center gap-3 mt-3 mx-auto pl-11">
							{author.twitter && (
								<a
									href={`https://x.com/${author.twitter}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									<RiTwitterXFill className="size-4" />
								</a>
							)}
							{author.github && (
								<a
									href={`https://github.com/${author.github}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									<RiGithubFill className="size-4" />
								</a>
							)}
							{author.linkedin && (
								<a
									href={`https://linkedin.com/in/${author.linkedin}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									<RiLinkedinBoxFill className="size-4" />
								</a>
							)}
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
				<div className="max-w-3xl mx-auto px-6 py-4">
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
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				<div className="prose max-w-none">{children}</div>
			</div>

			{/* Related Posts */}
			{relatedPosts.length > 0 && (
				<section className="relative border-t border-border">
					<div className="max-w-3xl mx-auto px-6 py-12">
						<h2 className="text-xl font-medium text-foreground mb-6">
							Related Posts
						</h2>
						<div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
							{relatedPosts.map((relatedPost) => (
								<BlogCard key={relatedPost.slug} post={relatedPost} />
							))}
						</div>
					</div>
				</section>
			)}

			{/* Footer */}
			<footer className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />
				</div>
				<div className="max-w-3xl mx-auto px-6 py-10">
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
