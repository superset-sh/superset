import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Component, type ErrorInfo, type ReactNode } from "react";
import type { PaneErrorHandler } from "../../../../../../../../types";
import { PaneFallback } from "../PaneFallback";

interface PaneErrorBoundaryProps {
	resetKey: unknown;
	onClose: () => void;
	onError?: PaneErrorHandler;
	children: ReactNode;
}

type PaneErrorBoundaryState =
	| { failed: false }
	| { failed: true; error: unknown };

export class PaneErrorBoundary extends Component<
	PaneErrorBoundaryProps,
	PaneErrorBoundaryState
> {
	state: PaneErrorBoundaryState = { failed: false };

	static getDerivedStateFromError(error: unknown): PaneErrorBoundaryState {
		return { failed: true, error };
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		this.props.onError?.(error, info.componentStack ?? null);
	}

	componentDidUpdate(previous: PaneErrorBoundaryProps) {
		if (this.state.failed && previous.resetKey !== this.props.resetKey) {
			this.setState({ failed: false });
		}
	}

	render() {
		if (!this.state.failed) return this.props.children;
		const { error } = this.state;
		return (
			<PaneFallback
				title={<Trans>This pane hit an error</Trans>}
				detail={error instanceof Error ? error.message : String(error)}
			>
				<Button
					variant="outline"
					size="sm"
					onClick={() => this.setState({ failed: false })}
				>
					<Trans>Retry</Trans>
				</Button>
				<Button variant="outline" size="sm" onClick={this.props.onClose}>
					<Trans>Close pane</Trans>
				</Button>
			</PaneFallback>
		);
	}
}
