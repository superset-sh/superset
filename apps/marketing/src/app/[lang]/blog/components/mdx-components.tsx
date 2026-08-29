import type { BundledLanguage } from "shiki";
import { slugify } from "@/lib/blog-utils";
import { BlogCodeBlock } from "./BlogCodeBlock";

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

export const mdxComponents = {
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
		return <BlogCodeBlock code={code} language={language} />;
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
