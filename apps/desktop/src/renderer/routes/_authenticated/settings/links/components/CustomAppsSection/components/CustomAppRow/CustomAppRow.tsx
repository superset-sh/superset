import { Trans, useLingui } from "@lingui/react/macro";
import type { CustomApp } from "@superset/local-db";
import { Badge } from "@superset/ui/badge";
import { Trash2 } from "lucide-react";
import { LuAppWindow } from "react-icons/lu";

interface CustomAppRowProps {
	app: CustomApp;
	onEdit: () => void;
	onDelete: () => void;
}

export function CustomAppRow({ app, onEdit, onDelete }: CustomAppRowProps) {
	const { t } = useLingui();
	// The bundle id is what actually launches the app on macOS, so lead with
	// it; the display name is the fallback.
	const identifier = app.bundleId ?? app.appName ?? "";

	return (
		// biome-ignore lint/a11y/useSemanticElements: div needed to avoid invalid nested <button> elements
		<div
			role="button"
			tabIndex={0}
			onClick={onEdit}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onEdit();
				}
			}}
			className="group flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
		>
			<div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
				<LuAppWindow className="size-4 text-muted-foreground" />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium truncate">{app.label}</span>
					{app.bundleId && (
						<Badge
							variant="secondary"
							className="text-[10px] h-4 px-1.5 shrink-0"
						>
							<Trans>Bundle id</Trans>
						</Badge>
					)}
				</div>
				<div className="text-xs font-mono text-muted-foreground truncate">
					{identifier}
				</div>
			</div>

			{app.bundleId && app.appName && (
				<div className="shrink-0 hidden md:block text-xs text-muted-foreground truncate max-w-[18rem]">
					{app.appName}
				</div>
			)}

			<button
				type="button"
				aria-label={t({ message: `Remove ${app.label}` })}
				className="shrink-0 p-1.5 rounded transition-colors text-muted-foreground/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive"
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
			>
				<Trash2 className="size-4" />
			</button>
		</div>
	);
}
