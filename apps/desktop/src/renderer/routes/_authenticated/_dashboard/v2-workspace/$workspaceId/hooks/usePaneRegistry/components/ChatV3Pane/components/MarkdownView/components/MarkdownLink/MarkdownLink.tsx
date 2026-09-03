import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";
import { ClickHint } from "renderer/lib/clickPolicy";
import { useMarkdownFileLink } from "../../../../providers/MarkdownFileLinkProvider";
import { filePathFromMarkdownHref } from "../../utils/filePathFromMarkdownHref";

type MarkdownLinkProps = ComponentProps<"a"> & {
	node?: unknown;
};

export function MarkdownLink({
	children,
	className,
	href,
	node: _node,
	onClick,
	...props
}: MarkdownLinkProps) {
	const fileLink = useMarkdownFileLink();
	const filePath = filePathFromMarkdownHref(href);
	const linkClassName = cn(
		"wrap-anywhere font-medium text-primary underline",
		className,
	);

	if (!fileLink || !filePath) {
		return (
			<a
				className={linkClassName}
				href={href}
				onClick={onClick}
				rel="noreferrer"
				target="_blank"
				{...props}
			>
				{children}
			</a>
		);
	}

	const anchor = (
		<a
			className={cn(linkClassName, "cursor-pointer")}
			href={href}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				event.preventDefault();
				void fileLink.open(filePath, event);
			}}
			{...props}
		>
			{children}
		</a>
	);

	return <ClickHint hint={fileLink.hint}>{anchor}</ClickHint>;
}
