import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { failureDiagnostic } from "../../lib/failure-diagnostic/failure-diagnostic";
import { reportRendererError } from "../../lib/report-renderer-error";
import { FailureLayout } from "../FailureLayout";

export interface RendererErrorBoundaryProps {
	children: ReactNode;
}

interface RendererErrorBoundaryState {
	hasError: boolean;
	error?: unknown;
}

export class RendererErrorBoundary extends Component<
	RendererErrorBoundaryProps,
	RendererErrorBoundaryState
> {
	state: RendererErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(error: unknown): RendererErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: unknown, info: ErrorInfo): void {
		reportRendererError(error, info.componentStack);
	}

	render() {
		if (!this.state.hasError) {
			return this.props.children;
		}

		return (
			<FailureLayout>
				<div
					className="select-text"
					style={{
						maxWidth: "520px",
						margin: "10vh auto 0",
						textAlign: "center",
					}}
				>
					{/* This boundary mounts outside I18nProvider, so it uses the
					    non-React i18n._ path; descriptors fall back to the English
					    message when no catalog is active. */}
					<h1 style={{ fontSize: "18px", marginBottom: "8px" }}>
						{i18n._(
							msg({
								message: "Something went wrong",
							}),
						)}
					</h1>
					<p style={{ fontSize: "14px", opacity: 0.8 }}>
						{i18n._(
							msg({
								message:
									"Superset hit an unexpected error. Reload to try again.",
							}),
						)}
					</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						style={{
							marginTop: "16px",
							padding: "8px 20px",
							fontSize: "14px",
							background: "#333",
							color: "#e5e5e5",
							border: "1px solid #555",
							borderRadius: "6px",
							cursor: "pointer",
						}}
					>
						{i18n._(msg({ message: "Reload" }))}
					</button>

					{this.state.error !== undefined && (
						<pre
							className="select-text cursor-text"
							style={{
								marginTop: "12px",
								padding: "10px 12px",
								fontSize: "12px",
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
								background: "#1a1a1a",
								border: "1px solid #2a2a2a",
								borderRadius: "6px",
								color: "#f87171",
								textAlign: "left",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								maxHeight: "40vh",
								overflow: "auto",
							}}
						>
							{failureDiagnostic(this.state.error)}
						</pre>
					)}
				</div>
			</FailureLayout>
		);
	}
}
