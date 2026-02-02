import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";
import { getAuthor } from "@/lib/authors";
import {
	extractToc,
	getAllSlugs,
	getBlogPost,
	getRelatedPosts,
} from "@/lib/blog";
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
	const relatedPosts = getRelatedPosts({
		slug,
		relatedSlugs: post.relatedSlugs,
	});
	const author = getAuthor(post.author);

	const url = `${COMPANY.MARKETING_URL}/blog/${slug}`;

	const sameAs: string[] = [];
	if (author?.twitterHandle) {
		sameAs.push(`https://x.com/${author.twitterHandle}`);
	}
	if (author?.githubHandle) {
		sameAs.push(`https://github.com/${author.githubHandle}`);
	}
	if (author?.linkedinUrl) {
		sameAs.push(author.linkedinUrl);
	}

	return (
		<main>
			<ArticleJsonLd
				title={post.title}
				description={post.description}
				author={{
					name: author?.name ?? post.author,
					url: author?.twitterHandle
						? `https://x.com/${author.twitterHandle}`
						: undefined,
					sameAs: sameAs.length > 0 ? sameAs : undefined,
				}}
				publishedTime={new Date(post.date).toISOString()}
				url={url}
				image={post.image}
			/>
			<BreadcrumbJsonLd
				items={[
					{ name: "Home", url: COMPANY.MARKETING_URL },
					{ name: "Blog", url: `${COMPANY.MARKETING_URL}/blog` },
					{ name: post.title, url },
				]}
			/>
			<BlogPostLayout post={post} toc={toc} relatedPosts={relatedPosts}>
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

	const author = getAuthor(post.author);
	const url = `${COMPANY.MARKETING_URL}/blog/${slug}`;

	return {
		title: post.title,
		description: post.description,
		alternates: {
			canonical: url,
		},
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			url,
			siteName: COMPANY.NAME,
			publishedTime: post.date,
			authors: [author?.name ?? post.author],
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
