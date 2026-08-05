import type { HostAgentConfig } from "@superset/host-service/settings";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type PresetIconSource,
	resolvePresetCommandExecutable,
	resolveV2PresetIconKey,
} from "renderer/lib/preset-icon-key";

/**
 * macOS app-bundle icons for presets whose commands launch GUI tools (e.g.
 * `fork .`, `zed .`) and match no agent icon. Returns a lookup from preset to
 * data-URI icon; presets with an agent icon, ambiguous commands or non-app
 * executables resolve to undefined.
 */
export function useCommandAppIcons(
	presets: readonly PresetIconSource[],
	agents: HostAgentConfig[] | undefined,
): (preset: PresetIconSource) => string | undefined {
	const executables = useMemo(() => {
		const unique = new Set<string>();
		for (const preset of presets) {
			if (resolveV2PresetIconKey(preset, agents)) continue;
			const executable = resolvePresetCommandExecutable(preset);
			if (executable) unique.add(executable);
		}
		return [...unique].sort();
	}, [presets, agents]);

	const { data: iconsByExecutable } =
		electronTrpc.external.getCommandAppIcons.useQuery(
			{ executables },
			{
				enabled: executables.length > 0,
				staleTime: Number.POSITIVE_INFINITY,
				refetchOnWindowFocus: false,
			},
		);

	return useCallback(
		(preset: PresetIconSource) => {
			if (!iconsByExecutable) return undefined;
			const executable = resolvePresetCommandExecutable(preset);
			if (!executable) return undefined;
			return iconsByExecutable[executable] ?? undefined;
		},
		[iconsByExecutable],
	);
}
