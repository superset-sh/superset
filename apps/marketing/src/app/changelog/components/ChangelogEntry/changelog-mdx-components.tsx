import { mdxComponents } from "@/app/blog/components/mdx-components";
import { PRBadge } from "../PRBadge";

export const changelogMdxComponents = {
	...mdxComponents,
	PRBadge,
	ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
		<ul className="list-disc list-outside pl-5 space-y-1" {...props}>
			{children}
		</ul>
	),
	li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
		<li {...props}>{children}</li>
	),
};
