import { Component, type ErrorInfo, type ReactNode } from "react";

interface WidgetErrorBoundaryProps {
	/** Short label (widget file/line id) included in the fallback message. */
	label: string;
	children: ReactNode;
}

interface WidgetErrorBoundaryState {
	message: string | null;
}

/**
 * Catches render-time errors thrown by an evaluated widget and shows a small,
 * selectable red error line instead of crashing the sidebar. Error text uses
 * `select-text cursor-text` so it can be copied into bug reports (the renderer
 * disables selection on body — see apps/desktop/AGENTS.md).
 */
export class WidgetErrorBoundary extends Component<
	WidgetErrorBoundaryProps,
	WidgetErrorBoundaryState
> {
	state: WidgetErrorBoundaryState = { message: null };

	static getDerivedStateFromError(error: unknown): WidgetErrorBoundaryState {
		return {
			message: error instanceof Error ? error.message : String(error),
		};
	}

	componentDidCatch(error: unknown, info: ErrorInfo): void {
		console.error(
			`[WidgetLine] widget "${this.props.label}" crashed:`,
			error,
			info.componentStack,
		);
	}

	render(): ReactNode {
		if (this.state.message !== null) {
			return (
				<span
					className="block select-text cursor-text truncate text-red-400/90"
					title={`${this.props.label}: ${this.state.message}`}
				>
					Widget error: {this.state.message}
				</span>
			);
		}
		return this.props.children;
	}
}
