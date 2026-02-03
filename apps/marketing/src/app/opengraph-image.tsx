import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Superset - The Terminal for Coding Agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
	return new ImageResponse(
		<div
			style={{
				background: "#0a0a0a",
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				fontFamily: "Inter, system-ui, sans-serif",
			}}
		>
			<div
				style={{
					fontSize: 80,
					fontWeight: 700,
					color: "#ffffff",
					marginBottom: 24,
				}}
			>
				Superset
			</div>
			<div
				style={{
					fontSize: 36,
					color: "#a0a0a0",
					textAlign: "center",
					maxWidth: 800,
					lineHeight: 1.4,
				}}
			>
				Run 10+ parallel coding agents on your machine
			</div>
			<div
				style={{
					display: "flex",
					gap: 16,
					marginTop: 48,
				}}
			>
				<div
					style={{
						background: "#ffffff",
						color: "#0a0a0a",
						padding: "12px 24px",
						borderRadius: 8,
						fontSize: 20,
						fontWeight: 600,
					}}
				>
					Claude
				</div>
				<div
					style={{
						background: "#ffffff",
						color: "#0a0a0a",
						padding: "12px 24px",
						borderRadius: 8,
						fontSize: 20,
						fontWeight: 600,
					}}
				>
					Codex
				</div>
				<div
					style={{
						background: "#ffffff",
						color: "#0a0a0a",
						padding: "12px 24px",
						borderRadius: 8,
						fontSize: 20,
						fontWeight: 600,
					}}
				>
					Gemini
				</div>
			</div>
		</div>,
		{ ...size },
	);
}
