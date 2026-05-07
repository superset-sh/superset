import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import type { ReactNode } from "react";
import { LuRefreshCw } from "react-icons/lu";

interface ImportPageShellProps {
	title: string;
	description?: string;
	isLoading?: boolean;
	emptyMessage?: string;
	itemCount: number;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	children: ReactNode;
}

export function ImportPageShell({
	title,
	description,
	isLoading,
	emptyMessage,
	itemCount,
	onRefresh,
	isRefreshing,
	children,
}: ImportPageShellProps) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
			<div className="flex items-start gap-3 border-b px-8 py-5 pr-20">
				<div className="min-w-0 flex-1">
					<div className="truncate text-lg font-semibold text-foreground">
						{title}
					</div>
					{description && (
						<p className="mt-1 truncate text-xs text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				{onRefresh && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onRefresh}
						disabled={isRefreshing}
						aria-label="Refresh"
						className="h-7 w-7 shrink-0"
					>
						<LuRefreshCw
							className={`size-3.5${isRefreshing ? " animate-spin" : ""}`}
							strokeWidth={2}
						/>
					</Button>
				)}
			</div>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
				{isLoading ? (
					<div className="flex flex-1 items-center justify-center">
						<Spinner className="size-5" />
					</div>
				) : itemCount === 0 ? (
					<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
						{emptyMessage ?? "Nothing to import."}
					</div>
				) : (
					children
				)}
			</div>
		</div>
	);
}
