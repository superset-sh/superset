import * as React from "react";
import { useMemo } from "react";
import * as ReactIconsLu from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { WidgetComponent, WidgetContext } from "renderer/lib/widget-kit";
import { useWidgetKit } from "renderer/lib/widget-kit";
import { evaluateWidgetModule } from "./evaluateWidgetModule";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

interface WidgetLineProps {
	projectId: string;
	lineId: string;
	/** Used in error messages and as the boundary reset key context. */
	label: string;
	ctx: WidgetContext;
}

/**
 * Renders one LLM-authored TSX widget card line. Fetches the compiled module by
 * lineId (the server only returns it when the project's widget set is trusted),
 * evaluates it through a sandboxed require shim, and re-evaluates whenever the
 * widget's content hash changes (file edits hot-reload via the config watcher,
 * which invalidates this query). All failures render as a small red, selectable
 * error line rather than crashing the sidebar.
 */
export function WidgetLine({ projectId, lineId, label, ctx }: WidgetLineProps) {
	const { data } = electronTrpc.config.getWidgetModule.useQuery(
		{ projectId, lineId },
		{ staleTime: 60_000 },
	);
	const kit = useWidgetKit(ctx, lineId);

	// Compile errors and not-permitted states surface inline; never throw.
	const { Widget, evalError, hash } = useMemo((): {
		Widget: WidgetComponent | null;
		evalError: string | null;
		hash: string | null;
	} => {
		if (!data) return { Widget: null, evalError: null, hash: null };
		if (!data.ok) {
			// "untrusted" is the normal gated state for unapproved widgets —
			// render nothing rather than a scary error.
			if (data.reason === "untrusted") {
				return { Widget: null, evalError: null, hash: null };
			}
			const message =
				data.reason === "not-found"
					? "Widget file not found"
					: (data.message ?? "Failed to compile widget");
			return { Widget: null, evalError: message, hash: null };
		}
		try {
			const Component = evaluateWidgetModule(data.code, {
				react: React,
				reactIconsLu: ReactIconsLu,
				kit,
			});
			return { Widget: Component, evalError: null, hash: data.hash };
		} catch (error) {
			return {
				Widget: null,
				evalError:
					error instanceof Error ? error.message : "Failed to load widget",
				hash: data.hash,
			};
		}
	}, [data, kit]);

	if (evalError) {
		return (
			<span
				className="block select-text cursor-text truncate text-red-400/90"
				title={`${label}: ${evalError}`}
			>
				Widget error: {evalError}
			</span>
		);
	}

	if (!Widget) return null;

	return (
		// Reset the boundary when the widget recompiles (hash change).
		<WidgetErrorBoundary key={hash ?? "widget"} label={label}>
			<Widget ctx={ctx} kit={kit} />
		</WidgetErrorBoundary>
	);
}
