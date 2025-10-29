import React, { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		this.setState({
			error,
			errorInfo,
		});
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-screen w-screen items-center justify-center bg-background p-8">
					<div className="w-full max-w-4xl space-y-4">
						<div className="space-y-2">
							<h1 className="text-2xl font-bold text-destructive">
								Something went wrong
							</h1>
							<p className="text-muted-foreground">
								An error occurred in the application. You can copy the error
								details below:
							</p>
						</div>

						<div className="space-y-4">
							<div className="space-y-2">
								<h2 className="text-lg font-semibold">Error Message</h2>
								<pre className="overflow-auto rounded-lg bg-muted p-4 text-sm">
									<code className="select-all">
										{this.state.error?.toString()}
									</code>
								</pre>
							</div>

							{this.state.errorInfo && (
								<div className="space-y-2">
									<h2 className="text-lg font-semibold">Stack Trace</h2>
									<pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-sm">
										<code className="select-all">
											{this.state.errorInfo.componentStack}
										</code>
									</pre>
								</div>
							)}

							{this.state.error?.stack && (
								<div className="space-y-2">
									<h2 className="text-lg font-semibold">Full Stack</h2>
									<pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-sm">
										<code className="select-all">{this.state.error.stack}</code>
									</pre>
								</div>
							)}
						</div>

						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => window.location.reload()}
								className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
							>
								Reload App
							</button>
							<button
								type="button"
								onClick={() => {
									const errorText = `Error: ${this.state.error?.toString()}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}\n\nFull Stack:\n${this.state.error?.stack}`;
									navigator.clipboard.writeText(errorText);
								}}
								className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
							>
								Copy Error Details
							</button>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
