import type { ComposerMenuOption } from "@superset/composer";
import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import { agentIconSource } from "@/lib/agent-icons";

/**
 * Stand-in model list for the preview screen. The real one comes from the
 * host's agent configs at cutover; the shape is already the shape the composer
 * takes, so only the source changes.
 *
 * Icons are resolved to local file URIs because SwiftUI cannot read Metro asset
 * references — the same reason `useAgentIconUri` exists.
 */
const MOCK_MODELS = [
	{ id: "claude", label: "Claude Sonnet 4.5" },
	{ id: "codex", label: "Codex" },
	{ id: "gemini", label: "Gemini" },
];

export function useMockModelOptions(): ComposerMenuOption[] {
	const [options, setOptions] = useState<ComposerMenuOption[]>(MOCK_MODELS);

	useEffect(() => {
		let cancelled = false;
		void Promise.all(
			MOCK_MODELS.map(async (model) => {
				const source = agentIconSource(model.id);
				if (source === undefined) return model;
				try {
					const asset = await Asset.fromModule(source).downloadAsync();
					return { ...model, iconUri: asset.localUri ?? undefined };
				} catch {
					return model;
				}
			}),
		).then((resolved) => {
			if (!cancelled) setOptions(resolved);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return options;
}
