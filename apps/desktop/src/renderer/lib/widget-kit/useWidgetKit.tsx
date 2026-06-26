import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { colors, tokens } from "./tokens";
import type {
	WidgetBadgeProps,
	WidgetButtonProps,
	WidgetCommandState,
	WidgetContext,
	WidgetKit,
	WidgetLinkProps,
	WidgetRowProps,
	WidgetRunResult,
	WidgetTextProps,
} from "./types";

// --- Module-level primitives (no hooks, stable identities) ---

function Row({ children, className, title }: WidgetRowProps) {
	return (
		<div
			className={cn("flex min-w-0 items-center gap-1.5", className)}
			title={title}
		>
			{children}
		</div>
	);
}

function Text({
	children,
	muted = true,
	truncate = true,
	className,
	title,
}: WidgetTextProps) {
	return (
		<span
			className={cn(
				truncate && "truncate",
				muted ? "text-muted-foreground" : "text-foreground",
				className,
			)}
			title={title}
		>
			{children}
		</span>
	);
}

function Badge({ children, color, className, title }: WidgetBadgeProps) {
	const token = color ? colors[color] : null;
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center rounded-sm px-1 py-px",
				"text-[10px] leading-tight",
				token ? null : "bg-muted text-muted-foreground",
				className,
			)}
			style={
				token
					? {
							color: token.cssVar,
							// 18% tint of the chart color as the chip background.
							backgroundColor: `color-mix(in oklch, ${token.cssVar} 18%, transparent)`,
						}
					: undefined
			}
			title={title}
		>
			{children}
		</span>
	);
}

function Button({
	children,
	onClick,
	disabled,
	className,
	title,
}: WidgetButtonProps) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick?.();
			}}
			disabled={disabled}
			title={title}
			className={cn(
				"inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-px",
				"text-[11px] leading-tight",
				"bg-primary/10 text-primary transition-colors hover:bg-primary/20",
				"disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
		>
			{children}
		</button>
	);
}

/**
 * Link primitive. Plain click opens in-app (browser pane); cmd/meta+click opens
 * the external browser (also the fallback when the in-app setting is off). It is
 * its own component so it can use the tabs store + settings hooks without making
 * the widget itself depend on them. `workspaceId` is bound by the kit factory.
 */
function makeLink(workspaceId: string) {
	return function Link({ children, href, className, title }: WidgetLinkProps) {
		const openInBrowserPane = useTabsStore((s) => s.openInBrowserPane);
		const { data: openLinksInApp } =
			electronTrpc.settings.getOpenLinksInApp.useQuery();
		const openUrl = electronTrpc.external.openUrl.useMutation();
		return (
			<button
				type="button"
				onClick={(e) => {
					// Card rows are clickable; never let a link click select the card.
					e.stopPropagation();
					const external = e.metaKey || e.ctrlKey || !openLinksInApp;
					if (external) {
						openUrl.mutate(href);
						return;
					}
					openInBrowserPane(workspaceId, href);
				}}
				title={title ?? href}
				className={cn(
					"inline-flex min-w-0 items-center gap-1 truncate text-left",
					"text-[11px] leading-tight text-primary hover:underline",
					className,
				)}
			>
				{children}
			</button>
		);
	};
}

/**
 * Builds the `useCommand` hook bound to a widget's workspace + lineId. The
 * returned function IS a hook (the widget calls it at its top level), so it may
 * call useQuery — the server resolves the command against the trusted widget
 * line for this workspace (see card-lines.ts).
 */
function makeUseCommand(workspaceId: string, lineId: string) {
	return function useCommand(
		command: string,
		options?: { refetchInterval?: number },
	): WidgetCommandState {
		const query = electronTrpc.workspaces.getWidgetCommandOutput.useQuery(
			{ workspaceId, lineId, command },
			{ staleTime: 30_000, refetchInterval: options?.refetchInterval },
		);
		return {
			output: query.data?.output ?? null,
			error: query.data?.error ?? null,
			isLoading: query.isLoading,
		};
	};
}

/**
 * Builds the kit handed to a widget. Bound to the widget's ctx + lineId so the
 * command hooks resolve server-side by lineId (the renderer never sends a raw
 * command string that the server trusts blindly — see card-lines.ts). All
 * primitives match workspace-card styling conventions (11px, tight leading,
 * muted-foreground, 1.5 gap, truncation).
 */
export function useWidgetKit(ctx: WidgetContext, lineId: string): WidgetKit {
	const runWidgetCommand =
		electronTrpc.workspaces.runWidgetCommand.useMutation();

	return useMemo<WidgetKit>(() => {
		const runCommand = async (command: string): Promise<WidgetRunResult> => {
			try {
				const result = await runWidgetCommand.mutateAsync({
					workspaceId: ctx.workspaceId,
					lineId,
					command,
				});
				if (result.error || (result.exitCode ?? 0) !== 0) {
					toast.error(
						result.stderr ||
							result.error ||
							`Command exited ${result.exitCode}`,
					);
				} else {
					const firstLine = result.stdout.split("\n").find((l) => l.trim());
					toast.success(firstLine?.trim() || "Done");
				}
				return result;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Command failed";
				toast.error(message);
				return { stdout: "", stderr: "", exitCode: null, error: message };
			}
		};

		return {
			Row,
			Text,
			Badge,
			Button,
			Link: makeLink(ctx.workspaceId),
			useCommand: makeUseCommand(ctx.workspaceId, lineId),
			runCommand,
			tokens,
		};
	}, [ctx.workspaceId, lineId, runWidgetCommand]);
}
