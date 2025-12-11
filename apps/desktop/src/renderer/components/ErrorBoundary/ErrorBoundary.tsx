import React, { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: (error: Error, resetError: () => void) => ReactNode;
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

/**
 * Error boundary component to catch and handle React rendering errors
 * 
 * @example
 * ```tsx
 * <ErrorBoundary fallback={(error, reset) => (
 *   <div>
 *     <h1>Something went wrong</h1>
 *     <p>{error.message}</p>
 *     <button onClick={reset}>Try again</button>
 *   </div>
 * )}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		console.error("[ErrorBoundary] Caught error:", error, errorInfo);
		this.props.onError?.(error, errorInfo);
	}

	resetError = (): void => {
		this.setState({ hasError: false, error: null });
	};

	render(): ReactNode {
		if (this.state.hasError && this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback(this.state.error, this.resetError);
			}

			// Default fallback UI
			return (
				<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
					<div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
						<h2 className="mb-2 text-lg font-semibold text-destructive">
							Something went wrong
						</h2>
						<p className="mb-4 text-sm text-muted-foreground">
							{this.state.error.message}
						</p>
						<button
							type="button"
							onClick={this.resetError}
							className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Try again
						</button>
					</div>
					{process.env.NODE_ENV === "development" && (
						<details className="max-w-2xl rounded-md border border-border bg-muted/50 p-4">
							<summary className="cursor-pointer font-medium text-foreground">
								Error details (development only)
							</summary>
							<pre className="mt-2 overflow-auto text-xs text-muted-foreground">
								{this.state.error.stack}
							</pre>
						</details>
					)}
				</div>
			);
		}

		return this.props.children;
	}
}
