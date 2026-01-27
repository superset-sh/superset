import { mdxComponents } from "@/app/blog/components/mdx-components";

function ChangelogLink({
	href,
	children,
	...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	const isGitHubPR =
		href?.includes("github.com") && href?.includes("/pull/");

	if (isGitHubPR) {
		return (
			<a
				href={href}
				className="text-xs font-mono text-muted-foreground no-underline bg-muted px-1.5 py-0.5 rounded ml-1 opacity-70 hover:opacity-100 transition-opacity"
				{...props}
			>
				{children}
			</a>
		);
	}

	return (
		<a href={href} {...props}>
			{children}
		</a>
	);
}

export const changelogMdxComponents = {
	...mdxComponents,
	a: ChangelogLink,
};
