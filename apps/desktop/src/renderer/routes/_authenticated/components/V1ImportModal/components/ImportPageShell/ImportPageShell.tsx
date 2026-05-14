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
	headerAction?: ReactNode;
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
	headerAction,
	children,
}: ImportPageShellProps) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
			<div className="flex items-center gap-3 border-b border-border/60 px-6 py-3.5 pr-16">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[14px] font-medium tracking-tight text-foreground">
						{title}
					</div>
					{description && (
						<p className="mt-0.5 truncate text-[12px] text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{headerAction}
					{onRefresh && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={onRefresh}
							disabled={isRefreshing}
							aria-label="Refresh"
							className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
						>
							<LuRefreshCw
								className={`size-3.5${isRefreshing ? " animate-spin" : ""}`}
								strokeWidth={2}
							/>
						</Button>
					)}
				</div>
			</div>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2">
				{isLoading ? (
					<div className="flex flex-1 items-center justify-center">
						<Spinner className="size-4 text-muted-foreground" />
					</div>
				) : itemCount === 0 ? (
					<div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
						{emptyMessage ?? "Nothing to import."}
					</div>
				) : (
					children
				)}
			</div>
		</div>
	);
}
