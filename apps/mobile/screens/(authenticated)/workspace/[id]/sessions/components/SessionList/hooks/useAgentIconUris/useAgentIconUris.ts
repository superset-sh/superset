import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import { agentIconSource } from "@/lib/agent-icons";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";

/**
 * SwiftUI's Image can't take a bundled `require()` module — it wants a file
 * URI — so the agent marks are resolved to their cached local paths once and
 * reused. Rows fall back to an SF Symbol until (or unless) that resolves.
 */
export function useAgentIconUris(
	rows: TerminalRowData[],
): Record<string, string> {
	const [uris, setUris] = useState<Record<string, string>>({});
	const agentIds = rows
		.map((row) => row.agentId)
		.filter((agentId): agentId is string => agentId !== null)
		.sort()
		.join(",");

	useEffect(() => {
		let cancelled = false;
		const wanted = agentIds ? agentIds.split(",") : [];
		void Promise.all(
			wanted.map(async (agentId) => {
				const source = agentIconSource(agentId);
				if (source === undefined) return null;
				const [asset] = await Asset.loadAsync(source);
				return asset?.localUri ? ([agentId, asset.localUri] as const) : null;
			}),
		).then((resolved) => {
			if (cancelled) return;
			const next: Record<string, string> = {};
			for (const entry of resolved) {
				if (entry) next[entry[0]] = entry[1];
			}
			setUris((current) => ({ ...current, ...next }));
		});
		return () => {
			cancelled = true;
		};
	}, [agentIds]);

	return uris;
}
