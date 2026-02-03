interface PRBadgeProps {
	url: string;
}

export function PRBadge({ url }: PRBadgeProps) {
	const prNumber = url.match(/\/pull\/(\d+)/)?.[1];

	return (
		<a
			href={url}
			className="text-xs font-mono text-muted-foreground no-underline bg-muted px-1.5 py-0.5 rounded opacity-70 hover:opacity-100 transition-opacity"
		>
			#{prNumber}
		</a>
	);
}
