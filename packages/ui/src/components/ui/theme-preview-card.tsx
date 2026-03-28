import type * as React from "react";
import { cn } from "../../lib/utils";

interface ThemePreviewCardProps extends React.ComponentProps<"div"> {
	name: string;
	subtitle?: string;
	backgroundColor: string;
	foregroundColor: string;
	promptColor: string;
	infoColor: string;
	readyColor: string;
	palette: string[];
	commandText?: string;
	infoText?: string;
	readyText?: string;
	footerRight?: React.ReactNode;
	paletteItemClassName?: string;
	previewClassName?: string;
	footerClassName?: string;
	titleClassName?: string;
	subtitleClassName?: string;
}

function ThemePreviewCard({
	name,
	subtitle,
	backgroundColor,
	foregroundColor,
	promptColor,
	infoColor,
	readyColor,
	palette,
	commandText = "npm run dev",
	infoText = "Starting development server...",
	readyText = "Ready on http://localhost:3000",
	footerRight,
	paletteItemClassName,
	previewClassName,
	footerClassName,
	titleClassName,
	subtitleClassName,
	className,
	...props
}: ThemePreviewCardProps) {
	const paletteCounts = new Map<string, number>();

	return (
		<div
			data-slot="theme-preview-card"
			className={cn(
				"relative flex flex-col overflow-hidden rounded-lg border bg-transparent",
				className,
			)}
			{...props}
		>
			<div
				className={cn(
					"flex h-28 flex-col justify-between p-3",
					previewClassName,
				)}
				style={{ backgroundColor }}
			>
				<div className="space-y-1">
					<div className="flex items-center gap-1">
						<span
							className="text-[11px] font-mono"
							style={{ color: promptColor }}
						>
							$
						</span>
						<span
							className="text-[11px] font-mono"
							style={{ color: foregroundColor }}
						>
							{commandText}
						</span>
					</div>
					<div className="text-[11px] font-mono" style={{ color: infoColor }}>
						{infoText}
					</div>
					<div className="text-[11px] font-mono" style={{ color: readyColor }}>
						{readyText}
					</div>
				</div>

				<div className="mt-2 flex gap-1">
					{palette.map((color) => {
						const occurrence = (paletteCounts.get(color) ?? 0) + 1;
						paletteCounts.set(color, occurrence);

						return (
							<div
								key={`${color}-${occurrence}`}
								className={cn("h-2 w-5 rounded-sm", paletteItemClassName)}
								style={{ backgroundColor: color }}
							/>
						);
					})}
				</div>
			</div>

			<div
				className={cn(
					"flex items-center justify-between gap-3 border-t bg-card p-3",
					footerClassName,
				)}
			>
				<div className="min-w-0">
					<div className={cn("truncate text-sm font-medium", titleClassName)}>
						{name}
					</div>
					{subtitle ? (
						<div
							className={cn(
								"truncate text-xs text-muted-foreground",
								subtitleClassName,
							)}
						>
							{subtitle}
						</div>
					) : null}
				</div>
				{footerRight ? <div className="shrink-0">{footerRight}</div> : null}
			</div>
		</div>
	);
}

export { ThemePreviewCard };
