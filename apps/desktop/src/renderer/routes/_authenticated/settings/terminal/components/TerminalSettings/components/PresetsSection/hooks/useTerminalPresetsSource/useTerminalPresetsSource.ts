import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES,
} from "@superset/shared/agent-command";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AutoApplyField } from "../../constants";
import type { PresetProjectOption } from "../../preset-project-options";

/** Unified mutation shape that both v1 (React Query) and v2 (collection) adapters satisfy. */
interface SourceMutation<TInput> {
	mutate: (input: TInput) => void;
	isPending: boolean;
}

interface CreatePresetInput {
	name: string;
	description?: string;
	cwd: string;
	commands: string[];
	projectIds?: string[] | null;
	pinnedToBar?: boolean;
	executionMode?: ExecutionMode;
}

interface UpdatePresetPatch {
	name?: string;
	description?: string;
	cwd?: string;
	commands?: string[];
	projectIds?: string[] | null;
	pinnedToBar?: boolean;
	executionMode?: ExecutionMode;
}

interface UpdatePresetInput {
	id: string;
	patch: UpdatePresetPatch;
}

interface DeletePresetInput {
	id: string;
}

interface SetAutoApplyInput {
	id: string;
	field: AutoApplyField;
	enabled: boolean;
}

interface ReorderPresetsInput {
	presetId: string;
	targetIndex: number;
}

export interface TerminalPresetsSource {
	presets: TerminalPreset[];
	isLoading: boolean;
	projectOptions: PresetProjectOption[];
	createPreset: SourceMutation<CreatePresetInput>;
	updatePreset: SourceMutation<UpdatePresetInput>;
	deletePreset: SourceMutation<DeletePresetInput>;
	setPresetAutoApply: SourceMutation<SetAutoApplyInput>;
	reorderPresets: SourceMutation<ReorderPresetsInput>;
}

const V2_SEED_MARKER_KEY = "v2-terminal-presets-seeded";

function useV1TerminalPresetsSource(enabled: boolean): TerminalPresetsSource {
	const { data: groupedProjects = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery(undefined, { enabled });
	const {
		presets,
		isLoading,
		createPreset,
		updatePreset,
		deletePreset,
		setPresetAutoApply,
		reorderPresets,
	} = usePresets();

	const projectOptions = useMemo<PresetProjectOption[]>(
		() =>
			groupedProjects.map((group) => ({
				id: group.project.id,
				name: group.project.name,
				color: group.project.color,
				mainRepoPath: group.project.mainRepoPath,
			})),
		[groupedProjects],
	);

	return {
		presets,
		isLoading,
		projectOptions,
		createPreset: {
			mutate: (input) => createPreset.mutate(input),
			isPending: createPreset.isPending,
		},
		updatePreset: {
			mutate: (input) => updatePreset.mutate(input),
			isPending: updatePreset.isPending,
		},
		deletePreset: {
			mutate: (input) => deletePreset.mutate(input),
			isPending: deletePreset.isPending,
		},
		setPresetAutoApply: {
			mutate: (input) => setPresetAutoApply.mutate(input),
			isPending: setPresetAutoApply.isPending,
		},
		reorderPresets: {
			mutate: (input) => reorderPresets.mutate(input),
			isPending: reorderPresets.isPending,
		},
	};
}

/**
 * Seeds default terminal presets into the v2 collection exactly once per
 * device (gated on localStorage). Kept inside the source hook so both the
 * settings page and the presets bar reuse the same seeding path.
 */
function useSeedV2Defaults() {
	const collections = useCollections();
	const seededRef = useRef(false);

	useEffect(() => {
		if (seededRef.current) return;
		if (localStorage.getItem(V2_SEED_MARKER_KEY) === "1") {
			seededRef.current = true;
			return;
		}

		for (const [
			index,
			agent,
		] of DEFAULT_TERMINAL_PRESET_AGENT_TYPES.entries()) {
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: agent,
				description: AGENT_PRESET_DESCRIPTIONS[agent],
				cwd: "",
				commands: AGENT_PRESET_COMMANDS[agent],
				projectIds: null,
				pinnedToBar: true,
				executionMode: "new-tab",
				tabOrder: index,
				createdAt: new Date(),
			});
		}

		localStorage.setItem(V2_SEED_MARKER_KEY, "1");
		seededRef.current = true;
	}, [collections.v2TerminalPresets]);
}

function useV2TerminalPresetsSource(): TerminalPresetsSource {
	const collections = useCollections();
	useSeedV2Defaults();

	const { data: v2Presets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);

	const { data: v2Projects = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2Projects: collections.v2Projects })
				.orderBy(({ v2Projects }) => v2Projects.name),
		[collections],
	);

	const presets = useMemo<TerminalPreset[]>(
		() => v2Presets as unknown as TerminalPreset[],
		[v2Presets],
	);

	const projectOptions = useMemo<PresetProjectOption[]>(
		() =>
			v2Projects.map((project) => ({
				id: project.id,
				name: project.name,
				// v2 projects don't carry color/mainRepoPath in the client schema; the
				// ProjectTargetingField renders these as optional adornments, so empty
				// strings degrade gracefully.
				color: "",
				mainRepoPath: "",
			})),
		[v2Projects],
	);

	const createPreset: SourceMutation<CreatePresetInput> = {
		mutate: (input) => {
			const maxTabOrder = v2Presets.reduce(
				(max, preset) => Math.max(max, preset.tabOrder),
				-1,
			);
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: input.name,
				description: input.description,
				cwd: input.cwd,
				commands: input.commands,
				projectIds: input.projectIds ?? null,
				pinnedToBar: input.pinnedToBar,
				executionMode: input.executionMode ?? "new-tab",
				tabOrder: maxTabOrder + 1,
				createdAt: new Date(),
			});
		},
		isPending: false,
	};

	const updatePreset: SourceMutation<UpdatePresetInput> = {
		mutate: ({ id, patch }) => {
			collections.v2TerminalPresets.update(id, (draft) => {
				if (patch.name !== undefined) draft.name = patch.name;
				if (patch.description !== undefined)
					draft.description = patch.description;
				if (patch.cwd !== undefined) draft.cwd = patch.cwd;
				if (patch.commands !== undefined) draft.commands = patch.commands;
				if (patch.projectIds !== undefined) draft.projectIds = patch.projectIds;
				if (patch.pinnedToBar !== undefined)
					draft.pinnedToBar = patch.pinnedToBar;
				if (patch.executionMode !== undefined)
					draft.executionMode = patch.executionMode;
			});
		},
		isPending: false,
	};

	const deletePreset: SourceMutation<DeletePresetInput> = {
		mutate: ({ id }) => {
			collections.v2TerminalPresets.delete(id);
		},
		isPending: false,
	};

	const setPresetAutoApply: SourceMutation<SetAutoApplyInput> = {
		mutate: ({ id, field, enabled }) => {
			collections.v2TerminalPresets.update(id, (draft) => {
				// Match v1 server behavior: `true` when enabled, `undefined` when off,
				// so `isProjectTargetedPreset` / auto-apply queries behave identically.
				draft[field] = enabled ? true : undefined;
			});
		},
		isPending: false,
	};

	const reorderPresets: SourceMutation<ReorderPresetsInput> = {
		mutate: ({ presetId, targetIndex }) => {
			const orderedIds = v2Presets.map((preset) => preset.id);
			const currentIndex = orderedIds.indexOf(presetId);
			if (currentIndex === -1) return;
			if (targetIndex < 0 || targetIndex >= orderedIds.length) return;

			const [moved] = orderedIds.splice(currentIndex, 1);
			orderedIds.splice(targetIndex, 0, moved);

			for (const [index, id] of orderedIds.entries()) {
				collections.v2TerminalPresets.update(id, (draft) => {
					draft.tabOrder = index;
				});
			}
		},
		isPending: false,
	};

	return {
		presets,
		isLoading: false,
		projectOptions,
		createPreset,
		updatePreset,
		deletePreset,
		setPresetAutoApply,
		reorderPresets,
	};
}

export type TerminalPresetsVariant = "v1" | "v2";

/**
 * Returns a unified terminal-preset data/mutation interface backed by either
 * the v1 main-process tRPC router or the v2 renderer-side collection.
 *
 * Both variants are hook-wired unconditionally (React's rules require a
 * stable hook tree across renders). The unused variant is cheap: tRPC
 * queries are disabled in v2 mode, and the collection is always live, so
 * the overhead is effectively a subscription handle.
 */
export function useTerminalPresetsSource(
	variant: TerminalPresetsVariant,
): TerminalPresetsSource {
	const v1 = useV1TerminalPresetsSource(variant === "v1");
	const v2 = useV2TerminalPresetsSource();
	return variant === "v2" ? v2 : v1;
}
