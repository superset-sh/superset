import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import { agentIconSource } from "@/lib/agent-icons";

/**
 * Local file URI for an agent's brand mark — SwiftUI's `Image uiImage` can't
 * read Metro asset references, so the bundled PNG is resolved to a file path
 * (downloadAsync is a no-op copy in release, a cache fetch in dev).
 */
export function useAgentIconUri(agentId: string | null): string | null {
	const [uri, setUri] = useState<string | null>(null);
	useEffect(() => {
		const source = agentId ? agentIconSource(agentId) : undefined;
		if (source === undefined) {
			setUri(null);
			return;
		}
		let cancelled = false;
		void Asset.fromModule(source)
			.downloadAsync()
			.then((asset) => {
				if (!cancelled) setUri(asset.localUri ?? null);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [agentId]);
	return uri;
}
