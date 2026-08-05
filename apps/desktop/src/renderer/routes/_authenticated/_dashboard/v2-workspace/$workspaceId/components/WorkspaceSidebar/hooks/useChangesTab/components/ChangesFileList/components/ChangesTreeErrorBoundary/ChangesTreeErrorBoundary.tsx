import { Component, type ReactNode } from "react";

interface ChangesTreeErrorBoundaryProps {
	children: ReactNode;
	/** Rendered instead of the tree once it has thrown. */
	fallback: ReactNode;
	/** Changing this clears the error so a transient changeset can recover. */
	resetKey: string;
	/** Section the tree belongs to; logged for diagnosis. */
	sectionKind: string;
}

interface ChangesTreeErrorBoundaryState {
	error?: Error;
}

/**
 * Keeps a tree-render failure inside the Changes panel.
 *
 * The only boundary above this is the router's root `errorComponent`, so an
 * uncaught throw here replaces the entire app UI — sidebar, panes and all — and
 * survives a reload, because the view mode is persisted and the repository state
 * that triggered it is still on disk. Falling back to the flat folders view
 * keeps the workspace usable.
 */
export class ChangesTreeErrorBoundary extends Component<
	ChangesTreeErrorBoundaryProps,
	ChangesTreeErrorBoundaryState
> {
	state: ChangesTreeErrorBoundaryState = {};

	static getDerivedStateFromError(error: Error): ChangesTreeErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error): void {
		console.error(
			`[changes-tree] tree render failed in the ${this.props.sectionKind} section; falling back to the folders view:`,
			error,
		);
	}

	componentDidUpdate(previous: ChangesTreeErrorBoundaryProps): void {
		if (this.state.error && previous.resetKey !== this.props.resetKey) {
			this.setState({ error: undefined });
		}
	}

	render() {
		return this.state.error ? this.props.fallback : this.props.children;
	}
}
