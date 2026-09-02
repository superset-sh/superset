import { OG_DIM } from "../../constants";

export function OgStat({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			<div style={{ fontSize: 52, color: "#ffffff", lineHeight: 1 }}>
				{value}
			</div>
			<div style={{ fontSize: 20, color: OG_DIM, letterSpacing: 2 }}>
				{label.toUpperCase()}
			</div>
		</div>
	);
}
