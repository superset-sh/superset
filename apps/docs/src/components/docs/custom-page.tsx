import type { TableOfContents } from "fumadocs-core/toc";
import { AnchorProvider } from "fumadocs-core/toc";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface CustomDocsPageProps {
	toc?: TableOfContents;
	full?: boolean;
	tableOfContent?: {
		style?: "clerk" | "normal";
	};
	children: ReactNode;
	container?: HTMLAttributes<HTMLDivElement>;
	article?: HTMLAttributes<HTMLElement>;
}

export function CustomDocsPage({
	toc = [],
	full = false,
	children,
	container,
	article,
}: CustomDocsPageProps) {
	return (
		<AnchorProvider toc={toc}>
			<div
				{...container}
				id="nd-page"
				className={cn("flex w-full min-w-0 flex-col", container?.className)}
			>
				<article
					{...article}
					className={cn(
						"flex w-full flex-1 flex-col gap-6 px-4 pt-8 md:px-6 md:pt-12 xl:px-12",
						full ? "max-w-[1120px]" : "max-w-[860px]",
						"xl:mx-auto",
						article?.className,
					)}
				>
					{children}
				</article>
			</div>
		</AnchorProvider>
	);
}

/**
 * Add typography styles
 */
export const DocsBody = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>((props, ref) => (
	<div ref={ref} {...props} className={cn("prose", props.className)}>
		{props.children}
	</div>
));

DocsBody.displayName = "DocsBody";

export const DocsDescription = forwardRef<
	HTMLParagraphElement,
	HTMLAttributes<HTMLParagraphElement>
>((props, ref) => {
	// don't render if no description provided
	if (props.children === undefined) return null;

	return (
		<p
			ref={ref}
			{...props}
			className={cn("mb-8 text-lg text-muted-foreground", props.className)}
		>
			{props.children}
		</p>
	);
});

DocsDescription.displayName = "DocsDescription";

export const DocsTitle = forwardRef<
	HTMLHeadingElement,
	HTMLAttributes<HTMLHeadingElement>
>((props, ref) => {
	return (
		<h1
			ref={ref}
			{...props}
			className={cn("text-3xl font-semibold", props.className)}
		>
			{props.children}
		</h1>
	);
});

DocsTitle.displayName = "DocsTitle";
