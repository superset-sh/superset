import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllSlugs, getBlogPost, extractToc } from "@/lib/blog";
import { BlogPostLayout } from "./components/BlogPostLayout";
import { CodeBlock, CodeBlockCopyButton } from "@superset/ui/ai-elements/code-block";
import type { BundledLanguage } from "shiki";

interface PageProps {
	params: Promise<{ slug: string }>;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function extractCodeFromChildren(children: React.ReactNode): {
	code: string;
	language: BundledLanguage;
} {
	if (
		children &&
		typeof children === "object" &&
		"props" in children &&
		children.props
	) {
		const codeProps = children.props as {
			children?: string;
			className?: string;
		};
		const code = codeProps.children?.trim() ?? "";
		const className = codeProps.className ?? "";
		const match = className.match(/language-(\w+)/);
		const language = (match?.[1] ?? "text") as BundledLanguage;
		return { code, language };
	}
	return { code: String(children ?? ""), language: "text" as BundledLanguage };
}

const components = {
	h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
		const id = typeof children === "string" ? slugify(children) : undefined;
		return (
			<h2 id={id} {...props}>
				{children}
			</h2>
		);
	},
	h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
		const id = typeof children === "string" ? slugify(children) : undefined;
		return (
			<h3 id={id} {...props}>
				{children}
			</h3>
		);
	},
	pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => {
		const { code, language } = extractCodeFromChildren(children);
		return (
			<CodeBlock code={code} language={language} className="my-6">
				<CodeBlockCopyButton />
			</CodeBlock>
		);
	},
	code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
		if (className?.includes("language-")) {
			return <code className={className} {...props}>{children}</code>;
		}
		return (
			<code
				{...props}
				className="bg-white/5 px-1.5 py-0.5 rounded text-[0.875em] text-white/90 font-mono"
			>
				{children}
			</code>
		);
	},
};

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
				<MDXRemote source={post.content} components={components} />
			</BlogPostLayout>
		</main>
	);
}

export async function generateStaticParams() {
	return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
