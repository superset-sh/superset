import type { WorkspaceStore } from "@superset/panes";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiMiniCog6Tooth, HiMiniCommandLine } from "react-icons/hi2";
import { LuCirclePlus, LuPin } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import type { HotkeyId } from "renderer/hotkeys";
import { useMigrateV1PresetsToV2 } from "renderer/routes/_authenticated/hooks/useMigrateV1PresetsToV2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { V2PresetBarItem } from "./components/V2PresetBarItem";

interface V2PresetsBarProps {
	workspaceId: string;
	projectId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

// Co-located to keep v2 self-contained. Mirrors the v1 array in
// renderer/hotkeys/registry.ts; order matches the registry OPEN_PRESET_{n}
// definitions so PRESET_HOTKEY_IDS[i] targets the i-th pinned preset.
const PRESET_HOTKEY_IDS: HotkeyId[] = [
	"OPEN_PRESET_1",
	"OPEN_PRESET_2",
	"OPEN_PRESET_3",
	"OPEN_PRESET_4",
	"OPEN_PRESET_5",
	"OPEN_PRESET_6",
	"OPEN_PRESET_7",
	"OPEN_PRESET_8",
	"OPEN_PRESET_9",
];

interface PresetTemplate {
	name: string;
	description: string;
	cwd: string;
	commands: string[];
}

const QUICK_ADD_PRESET_TEMPLATES: PresetTemplate[] = AGENT_TYPES.map(
	(agent) => ({
		name: agent,
		description: AGENT_PRESET_DESCRIPTIONS[agent],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[agent],
	}),
);

function isPresetPinnedToBar(pinnedToBar: boolean | undefined): boolean {
	// Backward-compatibility rule mirroring v1: undefined defaults to pinned.
	return pinnedToBar !== false;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function getPinnedPresetOrder(
	presets: ReadonlyArray<{ id: string; pinnedToBar?: boolean }>,
): string[] {
	return presets.flatMap((preset) =>
		isPresetPinnedToBar(preset.pinnedToBar) ? [preset.id] : [],
	);
}

export function V2PresetsBar({
	workspaceId,
	projectId,
	store,
}: V2PresetsBarProps) {
	const navigate = useNavigate();
	const isDark = useIsDarkTheme();
	const collections = useCollections();
	useMigrateV1PresetsToV2();

	const { data: allPresets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);

	const matchedPresets = useMemo(
		() => filterMatchingPresetsForProject(allPresets, projectId),
		[allPresets, projectId],
	);

	const [localPinnedPresetIds, setLocalPinnedPresetIds] = useState<string[]>(
		() => getPinnedPresetOrder(matchedPresets),
	);

	useEffect(() => {
		const serverPinnedPresetIds = getPinnedPresetOrder(matchedPresets);
		setLocalPinnedPresetIds((current) =>
			areStringArraysEqual(current, serverPinnedPresetIds)
				? current
				: serverPinnedPresetIds,
		);
	}, [matchedPresets]);

	const presetsByName = useMemo(() => {
		const map = new Map<string, V2TerminalPresetRow[]>();
		for (const preset of matchedPresets) {
			const existing = map.get(preset.name);
			if (existing) {
				existing.push(preset);
				continue;
			}
			map.set(preset.name, [preset]);
		}
		return map;
	}, [matchedPresets]);

	const pinnedPresets = useMemo(() => {
		const presetById = new Map(
			matchedPresets.map((preset, index) => [preset.id, { preset, index }]),
		);
		const orderedPinnedPresets: Array<{
			preset: V2TerminalPresetRow;
			index: number;
		}> = [];
		const seenIds = new Set<string>();

		for (const presetId of localPinnedPresetIds) {
			const item = presetById.get(presetId);
			if (!item) continue;
			if (!isPresetPinnedToBar(item.preset.pinnedToBar)) continue;
			orderedPinnedPresets.push(item);
			seenIds.add(presetId);
		}

		for (const [index, preset] of matchedPresets.entries()) {
			if (!isPresetPinnedToBar(preset.pinnedToBar)) continue;
			if (seenIds.has(preset.id)) continue;
			orderedPinnedPresets.push({ preset, index });
		}

		return orderedPinnedPresets;
	}, [matchedPresets, localPinnedPresetIds]);

	const presetIndexById = useMemo(
		() => new Map(matchedPresets.map((preset, index) => [preset.id, index])),
		[matchedPresets],
	);

	const managedPresets = useMemo(() => {
		const templateNames = new Set(
			QUICK_ADD_PRESET_TEMPLATES.map((t) => t.name),
		);
		const primaryTemplatePresetIds = new Set(
			QUICK_ADD_PRESET_TEMPLATES.flatMap((template) => {
				const match = presetsByName.get(template.name)?.[0];
				return match ? [match.id] : [];
			}),
		);
		const fromTemplates = QUICK_ADD_PRESET_TEMPLATES.map((template) => ({
			key: `template:${template.name}`,
			name: template.name,
			preset: presetsByName.get(template.name)?.[0],
			template,
			iconName: template.name,
		}));
		const customExisting = matchedPresets
			.filter(
				(preset) =>
					!templateNames.has(preset.name) ||
					!primaryTemplatePresetIds.has(preset.id),
			)
			.map((preset) => ({
				key: `preset:${preset.id}`,
				name: preset.name || "default",
				preset: preset as V2TerminalPresetRow | undefined,
				template: null as PresetTemplate | null,
				iconName: preset.name,
			}));
		return [...fromTemplates, ...customExisting];
	}, [matchedPresets, presetsByName]);

	const openPresetInNewTab = useCallback(
		(preset: V2TerminalPresetRow) => {
			if (!workspaceId) return;
			const initialCommand =
				preset.commands.length > 0 ? preset.commands.join(" && ") : undefined;
			store.getState().addTab({
				titleOverride: preset.name || "Terminal",
				panes: [
					{
						kind: "terminal",
						data: {
							terminalId: crypto.randomUUID(),
							initialCommand,
						} as TerminalPaneData,
					},
				],
			});
		},
		[workspaceId, store],
	);

	const handleEditPreset = useCallback(
		(presetId: string) => {
			navigate({
				to: "/settings/terminal",
				search: { editPresetId: presetId },
			});
		},
		[navigate],
	);

	const handleLocalPinnedReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			setLocalPinnedPresetIds((current) => {
				if (
					fromIndex < 0 ||
					fromIndex >= current.length ||
					toIndex < 0 ||
					toIndex >= current.length
				) {
					return current;
				}
				const next = [...current];
				const [moved] = next.splice(fromIndex, 1);
				next.splice(toIndex, 0, moved);
				return next;
			});
		},
		[],
	);

	const handlePersistPinnedReorder = useCallback(
		(presetId: string, targetPinnedIndex: number) => {
			const reorderedPinnedPresetIds = [...localPinnedPresetIds];
			const currentPinnedIndex = reorderedPinnedPresetIds.indexOf(presetId);
			if (currentPinnedIndex === -1) return;
			const [moved] = reorderedPinnedPresetIds.splice(currentPinnedIndex, 1);
			reorderedPinnedPresetIds.splice(targetPinnedIndex, 0, moved);

			const pinnedSet = new Set(reorderedPinnedPresetIds);
			const unpinned = matchedPresets
				.filter((preset) => !pinnedSet.has(preset.id))
				.map((preset) => preset.id);
			const finalOrder = [...reorderedPinnedPresetIds, ...unpinned];

			for (const [index, id] of finalOrder.entries()) {
				collections.v2TerminalPresets.update(id, (draft) => {
					draft.tabOrder = index;
				});
			}
		},
		[collections.v2TerminalPresets, localPinnedPresetIds, matchedPresets],
	);

	const handleTogglePinned = useCallback(
		(presetId: string, nextPinned: boolean) => {
			collections.v2TerminalPresets.update(presetId, (draft) => {
				draft.pinnedToBar = nextPinned;
			});
		},
		[collections.v2TerminalPresets],
	);

	const handleCreateFromTemplate = useCallback(
		(template: PresetTemplate) => {
			const maxTabOrder = matchedPresets.reduce(
				(max, preset) => Math.max(max, preset.tabOrder),
				-1,
			);
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: template.name,
				description: template.description,
				cwd: template.cwd,
				commands: template.commands,
				projectIds: null,
				pinnedToBar: true,
				executionMode: "new-tab",
				tabOrder: maxTabOrder + 1,
				createdAt: new Date(),
			});
		},
		[collections.v2TerminalPresets, matchedPresets],
	);

	return (
		<div
			className="flex items-center h-8 border-b border-border bg-background px-2 gap-0.5 overflow-x-auto shrink-0"
			style={{ scrollbarWidth: "none" }}
		>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-6 shrink-0">
								<HiMiniCog6Tooth className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom" sideOffset={4}>
						Manage Presets
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="start" className="w-56">
					{managedPresets.map((item) => {
						const icon = getPresetIcon(item.iconName, isDark);
						const isPinned = item.preset
							? isPresetPinnedToBar(item.preset.pinnedToBar)
							: false;
						const hasPreset = !!item.preset;
						const presetIndex = item.preset
							? presetIndexById.get(item.preset.id)
							: undefined;
						const hotkeyId =
							typeof presetIndex === "number"
								? PRESET_HOTKEY_IDS[presetIndex]
								: undefined;
						return (
							<DropdownMenuItem
								key={item.key}
								className="gap-2"
								onSelect={(event) => {
									event.preventDefault();
									if (hasPreset && item.preset) {
										handleTogglePinned(item.preset.id, !isPinned);
										return;
									}
									if (!item.template) return;
									handleCreateFromTemplate(item.template);
								}}
							>
								{icon ? (
									<img src={icon} alt="" className="size-4 object-contain" />
								) : (
									<HiMiniCommandLine className="size-4" />
								)}
								<span className="truncate">{item.name || "default"}</span>
								<div className="ml-auto flex items-center gap-2">
									{hotkeyId ? <HotkeyMenuShortcut hotkeyId={hotkeyId} /> : null}
									{hasPreset ? (
										<LuPin
											className={`size-3.5 ${
												isPinned
													? "text-foreground"
													: "text-muted-foreground/60"
											}`}
										/>
									) : (
										<LuCirclePlus className="size-3.5 text-muted-foreground" />
									)}
								</div>
							</DropdownMenuItem>
						);
					})}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="gap-2"
						onClick={() => navigate({ to: "/settings/terminal" })}
					>
						<HiMiniCog6Tooth className="size-4" />
						<span>Manage Presets</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="h-4 w-px bg-border mx-1 shrink-0" />
			{pinnedPresets.map(({ preset, index }, pinnedIndex) => {
				const hotkeyId = PRESET_HOTKEY_IDS[index];
				return (
					<V2PresetBarItem
						key={preset.id}
						preset={preset}
						pinnedIndex={pinnedIndex}
						hotkeyId={hotkeyId}
						isDark={isDark}
						onOpenInNewTab={openPresetInNewTab}
						onEdit={(presetToEdit) => handleEditPreset(presetToEdit.id)}
						onLocalReorder={handleLocalPinnedReorder}
						onPersistReorder={handlePersistPinnedReorder}
					/>
				);
			})}
		</div>
	);
}
