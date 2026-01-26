import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { extractToc, getAllSlugs, getBlogPost } from "@/lib/blog";
import { mdxComponents } from "../components/mdx-components";
import { BlogPostLayout } from "./components/BlogPostLayout";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: PageProps) {
	const { slug } = await params;
	const post = getBlogPost(slug);

	if (!post) {
		notFound();
	}

	const toc = extractToc(post.content);

	return (
		<main>
			<BlogPostLayout post={post} toc={toc}>
				<MDXRemote source={post.content} components={mdxComponents} />
			</BlogPostLayout>
		</main>
	);
}

export async function generateStaticParams() {
	return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const post = getBlogPost(slug);

	if (!post) {
		return {};
	}

	return {
		title: `${post.title} | Superset Blog`,
		description: post.description,
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			publishedTime: post.date,
			authors: [post.author],
			...(post.image && { images: [post.image] }),
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description,
			...(post.image && { images: [post.image] }),
		},
	};
}
