import type { PluginSlotProps } from "@superset/plugin-sdk/ui";
import { useEffect, useState } from "react";

export function HelloTab({ ctx }: PluginSlotProps) {
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		void ctx.invokeAction("get-count").then((result) => {
			const value = (result as { count?: number } | null)?.count;
			if (!cancelled && typeof value === "number") setCount(value);
		});
		const unsubscribe = ctx.onRealtime((payload) => {
			const value = (payload as { count?: number } | null)?.count;
			if (typeof value === "number") setCount(value);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [ctx]);

	return (
		<div
			data-testid="hello-plugin-tab"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 12,
				padding: 16,
				fontSize: 13,
				color: "var(--foreground, inherit)",
			}}
		>
			<div style={{ fontWeight: 600 }}>Hello from a Superset plugin</div>
			<div style={{ opacity: 0.7 }}>
				Workspace: <code>{ctx.workspaceId}</code>
			</div>
			<div data-testid="hello-plugin-count">
				Counter: {count === null ? "…" : count}
			</div>
			<button
				type="button"
				data-testid="hello-plugin-increment"
				onClick={() => {
					void ctx.invokeAction("increment");
				}}
				style={{
					alignSelf: "flex-start",
					padding: "6px 12px",
					borderRadius: 6,
					border: "1px solid var(--border, #8884)",
					background: "transparent",
					color: "inherit",
					cursor: "pointer",
				}}
			>
				Increment
			</button>
		</div>
	);
}
