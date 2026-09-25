interface PageViewerMessageProps {
	title: string;
	description?: string;
}

export function PageViewerMessage({
	title,
	description,
}: PageViewerMessageProps) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
			<p className="font-medium text-sm">{title}</p>
			{description ? (
				<p className="max-w-xs text-balance text-muted-foreground text-xs">
					{description}
				</p>
			) : null}
		</div>
	);
}
