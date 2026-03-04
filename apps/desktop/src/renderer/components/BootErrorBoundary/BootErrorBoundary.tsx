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
					background: "#0f0f0f",
					color: "#e5e5e5",
					fontFamily: "system-ui, sans-serif",
					padding: "24px",
					textAlign: "center",
				}}
			>
				<div style={{ maxWidth: "520px" }}>
					<h1 style={{ fontSize: "18px", marginBottom: "8px" }}>
						Superset failed to start
					</h1>
					<p style={{ fontSize: "14px", opacity: 0.8 }}>
						The renderer crashed during startup. Please check logs for details.
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
						Reload
					</button>
				</div>
			</div>
		);
	}
}
