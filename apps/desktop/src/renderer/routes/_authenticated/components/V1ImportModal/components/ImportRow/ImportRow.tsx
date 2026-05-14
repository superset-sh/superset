import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuCheck, LuChevronDown, LuTriangle } from "react-icons/lu";

export interface PickCandidate {
	id: string;
	name: string;
	repoCloneUrl?: string | null;
	matchesExpected?: boolean;
}

export type RowAction =
	| { kind: "ready"; label: string; onClick: () => void; disabled?: boolean }
	| { kind: "running"; label?: string }
	| { kind: "imported"; label?: string }
	| { kind: "blocked"; reason: string }
	| { kind: "error"; message: string; onRetry: () => void }
	| {
			kind: "pick";
			label: string;
			candidates: ReadonlyArray<PickCandidate>;
			onPick: (id: string) => void;
	  }
	| {
			kind: "confirm";
			message: string;
			confirmLabel: string;
			cancelLabel?: string;
			onConfirm: () => void;
			onCancel: () => void;
	  };

interface ImportRowProps {
	icon?: ReactNode;
	primary: string;
	secondary?: string;
	action: RowAction;
}

export function ImportRow({
	icon,
	primary,
	secondary,
	action,
}: ImportRowProps) {
	return (
		<div className="group flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent/40">
			{icon && (
				<div className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
					{icon}
				</div>
			)}
			<div className="flex min-w-0 flex-1 flex-col">
				<span
					className="truncate text-[13px] font-medium leading-tight text-foreground"
					title={primary}
				>
					{primary}
				</span>
				{secondary && (
					<span
						className="mt-0.5 truncate font-mono text-[11px] leading-tight text-muted-foreground"
						title={secondary}
					>
						{secondary}
					</span>
				)}
				{action.kind === "error" && (
					<span
						className="mt-0.5 select-text cursor-text truncate text-[11px] leading-tight text-destructive"
						title={action.message}
					>
						{action.message}
					</span>
				)}
				{action.kind === "blocked" && (
					<span
						className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground"
						title={action.reason}
					>
						{action.reason}
					</span>
				)}
				{action.kind === "confirm" && (
					<span className="mt-0.5 select-text cursor-text text-[11px] leading-tight text-muted-foreground [overflow-wrap:anywhere]">
						{action.message}
					</span>
				)}
			</div>
			<RowActionView action={action} />
		</div>
	);
}

function RowActionView({ action }: { action: RowAction }) {
	switch (action.kind) {
		case "ready":
			return (
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={action.onClick}
					disabled={action.disabled}
					className="h-7 shrink-0 px-2.5 text-[12px] font-medium"
				>
					{action.label}
				</Button>
			);
		case "running":
			return (
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled
					className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium"
				>
					<Spinner className="size-3" />
					{action.label}
				</Button>
			);
		case "imported":
			return (
				<div
					className={cn(
						"flex shrink-0 items-center gap-1 text-[12px] font-medium",
						"text-emerald-600 dark:text-emerald-400",
					)}
				>
					<LuCheck className="size-3.5" strokeWidth={2.5} />
					{action.label ?? "Imported"}
				</div>
			);
		case "blocked":
			return (
				<div className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
					Blocked
				</div>
			);
		case "error":
			return (
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={action.onRetry}
					className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium"
				>
					<LuTriangle className="size-3 text-destructive" strokeWidth={2.5} />
					Retry
				</Button>
			);
		case "confirm":
			return (
				<div className="flex shrink-0 items-center gap-1.5">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={action.onCancel}
						className="h-7 px-2.5 text-[12px] font-medium"
					>
						{action.cancelLabel ?? "Cancel"}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="default"
						onClick={action.onConfirm}
						className="h-7 px-2.5 text-[12px] font-medium"
					>
						{action.confirmLabel}
					</Button>
				</div>
			);
		case "pick":
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium"
						>
							{action.label}
							<LuChevronDown className="size-3" strokeWidth={2} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="max-w-80">
						{action.candidates.map((candidate) => (
							<DropdownMenuItem
								key={candidate.id}
								onSelect={() => action.onPick(candidate.id)}
								className="flex flex-col items-start gap-0.5"
							>
								<div className="flex w-full items-center gap-2">
									<span className="truncate text-[13px]">{candidate.name}</span>
									{candidate.matchesExpected && (
										<span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
											matches v1
										</span>
									)}
								</div>
								{candidate.repoCloneUrl && (
									<span className="truncate font-mono text-[10px] text-muted-foreground">
										{candidate.repoCloneUrl}
									</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			);
	}
}
