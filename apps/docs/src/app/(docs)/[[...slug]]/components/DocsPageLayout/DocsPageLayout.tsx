import type { TableOfContents } from "fumadocs-core/toc";
import { AnchorProvider } from "fumadocs-core/toc";
import { I18nLabel } from "fumadocs-ui/contexts/i18n";
import { Edit, Text } from "lucide-react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { buttonVariants } from "@/components/Button";
import { cn } from "@/lib/cn";
import type { TOCProps } from "./components/PageClient/components/TableOfContents/TableOfContents";
import {
	TOCItems,
	TOCScrollArea,
	Toc,
	TocPopoverContent,
	TocPopoverTrigger,
} from "./components/PageClient/components/TableOfContents/TableOfContents";
import type { FooterProps } from "./components/PageClient/PageClient";
import {
	Footer,
	LastUpdate,
	PageArticle,
	PageBody,
	TocPopoverHeader,
} from "./components/PageClient/PageClient";

type TableOfContentOptions = Omit<TOCProps, "items" | "children"> & {
	enabled: boolean;
	component: ReactNode;
	header?: ReactNode;
	footer?: ReactNode;
};

type TableOfContentPopoverOptions = Omit<TableOfContentOptions, "single">;

interface EditOnGitHubOptions
	extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
	owner: string;
	repo: string;
	branch?: string;
	path: string;
}

interface FooterOptions extends FooterProps {
	enabled: boolean;
	component: ReactNode;
}

export interface DocsPageProps {
	toc?: TableOfContents;
	full?: boolean;
	tableOfContent?: Partial<TableOfContentOptions>;
	tableOfContentPopover?: Partial<TableOfContentPopoverOptions>;
	footer?: Partial<FooterOptions>;
	editOnGithub?: EditOnGitHubOptions;
	lastUpdate?: Date | string | number;
	children: ReactNode;
	container?: HTMLAttributes<HTMLDivElement>;
	article?: HTMLAttributes<HTMLElement>;
}

export function DocsPage({
	toc = [],
	full = false,
	tableOfContentPopover: {
		enabled: tocPopoverEnabled,
		component: tocPopoverReplace,
		...tocPopoverOptions
	} = {},
	tableOfContent: {
		enabled: tocEnabled,
		component: tocReplace,
		...tocOptions
	} = {},
	footer: {
		enabled: footerEnabled,
		component: footerReplace,
		...footerOptions
	} = {},
	editOnGithub,
	lastUpdate,
	children,
	container,
	article,
}: DocsPageProps) {
	const isTocRequired =
		toc.length > 0 ||
		tocOptions.footer !== undefined ||
		tocOptions.header !== undefined;

	// disable TOC on full mode, you can still enable it with `enabled` option.
	tocEnabled ??= !full && isTocRequired;

	tocPopoverEnabled ??=
		toc.length > 0 ||
		tocPopoverOptions.header !== undefined ||
		tocPopoverOptions.footer !== undefined;

	// enable footer by default
	footerEnabled ??= true;

	return (
		<AnchorProvider toc={toc}>
			<PageBody
				{...container}
				className={cn(container?.className)}
				style={
					{
						"--fd-tocnav-height": !tocPopoverEnabled ? "0px" : undefined,
						...container?.style,
					} as object
				}
			>
				{tocPopoverEnabled && !tocPopoverReplace ? (
					<TocPopoverHeader className="h-10">
						<TocPopoverTrigger className="w-full" items={toc} />
						<TocPopoverContent>
							{tocPopoverOptions.header}
							<TOCScrollArea isMenu>
								<TOCItems items={toc} />
							</TOCScrollArea>
							{tocPopoverOptions.footer}
						</TocPopoverContent>
					</TocPopoverHeader>
				) : (
					tocPopoverReplace
				)}
				<PageArticle
					{...article}
					className={cn(
						full || !tocEnabled ? "max-w-[1120px]" : "max-w-[860px]",
						article?.className,
					)}
				>
					{children}
					<div role="none" className="flex-1" />
					<div className="flex flex-row flex-wrap items-center justify-between gap-4 empty:hidden">
						{editOnGithub ? <EditOnGitHub {...editOnGithub} /> : null}
						{lastUpdate ? <LastUpdate date={new Date(lastUpdate)} /> : null}
					</div>
					{footerEnabled && !footerReplace ? (
						<Footer items={footerOptions?.items} />
					) : (
						footerReplace
					)}
				</PageArticle>
			</PageBody>
			{tocEnabled && !tocReplace ? (
				<Toc>
					{tocOptions.header}
					<h3 className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
						<Text className="size-4" />
						<I18nLabel label="toc" />
					</h3>
					<TOCScrollArea>
						<TOCItems items={toc} />
					</TOCScrollArea>
					{tocOptions.footer}
				</Toc>
			) : (
				tocReplace
			)}
		</AnchorProvider>
	);
}

function EditOnGitHub({
	owner,
	repo,
	branch = "main",
	path,
	...props
}: EditOnGitHubOptions) {
	const href = `https://github.com/${owner}/${repo}/blob/${branch}/${path.startsWith("/") ? path.slice(1) : path}`;

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			{...props}
			className={cn(
				buttonVariants({
					variant: "secondary",
					size: "sm",
					className:
						"gap-1.5 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
				}),
				props.className,
			)}
		>
			<Edit className="size-3.5" />
			Edit on GitHub
		</a>
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
