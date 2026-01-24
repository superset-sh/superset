import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import type { BundledLanguage } from "shiki";
import { extractToc, getAllSlugs, getBlogPost } from "@/lib/blog";
import { BlogPostLayout } from "./components/BlogPostLayout";

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

function Video({ src, title }: { src: string; title?: string }) {
	return (
		<span className="block my-8 not-prose">
			{/* biome-ignore lint/a11y/useMediaCaption: User-uploaded videos don't have caption tracks */}
			<video
				src={src}
				title={title}
				className="w-full rounded-lg border border-border"
				controls
				playsInline
				preload="metadata"
			/>
			{title && (
				<span className="block text-center text-sm text-muted-foreground mt-3">
					{title}
				</span>
			)}
		</span>
	);
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
			<div className="not-prose my-6 [&_pre]:!bg-[#282c34] [&>div>div]:!bg-[#282c34] [&>div]:!bg-[#282c34] [&>div]:!border-[#3e4451]">
				<CodeBlock code={code} language={language}>
					<CodeBlockCopyButton />
				</CodeBlock>
			</div>
		);
	},
	code: ({
		children,
		className,
		...props
	}: React.HTMLAttributes<HTMLElement>) => {
		if (className?.includes("language-")) {
			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
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
	img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
		<span className="block my-8 not-prose">
			{/* biome-ignore lint/performance/noImgElement: MDX images have unknown dimensions */}
			<img
				src={src}
				alt={alt}
				className="w-full rounded-lg border border-border"
				{...props}
			/>
			{alt && (
				<span className="block text-center text-sm text-muted-foreground mt-3">
					{alt}
				</span>
			)}
		</span>
	),
	Video,
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
