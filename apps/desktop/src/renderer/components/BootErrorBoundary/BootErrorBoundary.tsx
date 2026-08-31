import { i18n } from "@superset/i18n";
import type { ReactNode } from "react";
import { Component } from "react";

export interface BootErrorBoundaryProps {
	children: ReactNode;
	onError?: (error: Error) => void;
}

interface BootErrorBoundaryState {
	hasError: boolean;
	error?: Error;
}

export class BootErrorBoundary extends Component<
	BootErrorBoundaryProps,
	BootErrorBoundaryState
> {
	state: BootErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(error: Error): BootErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error): void {
		console.error("[renderer] Boot error boundary caught:", error);
		this.props.onError?.(error);
	}

	render() {
		if (!this.state.hasError) {
			return this.props.children;
		}

		return (
			<div
				style={{
					display: "flex",
					height: "100vh",
					alignItems: "center",
					justifyContent: "center",
					background: "var(--background)",
					color: "var(--foreground)",
					fontFamily: "system-ui, sans-serif",
					padding: "24px",
					textAlign: "center",
				}}
			>
				<div className="select-text" style={{ maxWidth: "520px" }}>
					{/* This boundary mounts outside I18nProvider, so it uses the
					    non-React i18n._ path; descriptors fall back to the English
					    message when no catalog is active. */}
					<h1 style={{ fontSize: "var(--text-lg)", marginBottom: "8px" }}>
						{i18n._({
							id: "components.bootError.title",
							message: "Superset failed to start",
						})}
					</h1>
					<p style={{ fontSize: "var(--text-base)", opacity: 0.8 }}>
						{i18n._({
							id: "components.bootError.description",
							message:
								"The renderer crashed during startup. Please check logs for details.",
						})}
					</p>
					{this.state.error?.message && (
						<pre
							className="select-text cursor-text"
							style={{
								marginTop: "12px",
								padding: "10px 12px",
								fontSize: "var(--text-xs)",
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
								background: "var(--background-2)",
								border: "1px solid var(--border)",
								borderRadius: "var(--radius)",
								color: "var(--destructive)",
								textAlign: "left",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}
						>
							{this.state.error.message}
						</pre>
					)}

					<button
						type="button"
						onClick={() => window.location.reload()}
						style={{
							marginTop: "16px",
							padding: "8px 20px",
							fontSize: "var(--text-base)",
							background: "var(--secondary)",
							color: "var(--foreground)",
							border: "1px solid var(--border)",
							borderRadius: "var(--radius)",
							cursor: "pointer",
						}}
					>
						{i18n._({ id: "components.bootError.reload", message: "Reload" })}
					</button>
				</div>
			</div>
		);
	}
}
