import Link from "next/link";
import type { BlogPost } from "@/lib/blog";
import { AuthorAvatar } from "../AuthorAvatar";

interface BlogCardProps {
	post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
	const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		<Link href={post.url} className="block group">
			<article className="border border-border bg-background p-6 transition-all hover:bg-muted/50 hover:border-foreground/20">
				<div className="flex items-center gap-3 mb-3">
					<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
						{post.category}
					</span>
					<span className="text-muted-foreground/50">·</span>
					<time dateTime={post.date} className="text-xs text-muted-foreground">
						{formattedDate}
					</time>
				</div>
				<h2 className="text-lg font-medium text-foreground mb-2 group-hover:text-foreground/90">
					{post.title}
				</h2>
				{post.description && (
					<p className="text-muted-foreground text-sm leading-relaxed mb-4">
						{post.description}
					</p>
				)}
				<div className="flex items-center gap-2">
					<AuthorAvatar
						name={post.author}
						title="Cofounder, Superset"
						twitterHandle="avimakesrobots"
						size="sm"
					/>
					<span className="text-xs text-muted-foreground">{post.author}</span>
				</div>
			</article>
		</Link>
	);
}
