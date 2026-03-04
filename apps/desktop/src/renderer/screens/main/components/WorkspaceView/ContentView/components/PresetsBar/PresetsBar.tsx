import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiMiniCog6Tooth, HiMiniCommandLine } from "react-icons/hi2";
import { LuCirclePlus, LuPin } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import { PRESET_HOTKEY_IDS } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { PresetBarItem } from "./components/PresetBarItem";

interface PresetTemplate {
	name: string;
	preset: {
		name: string;
		description: string;
		cwd: string;
		commands: string[];
	};
}

const QUICK_ADD_PRESET_TEMPLATES: PresetTemplate[] = AGENT_TYPES.map(
	(agent) => ({
		name: agent,
		preset: {
			name: agent,
			description: AGENT_PRESET_DESCRIPTIONS[agent],
			cwd: "",
			commands: AGENT_PRESET_COMMANDS[agent],
		},
	}),
);

function isPresetPinnedToBar(pinnedToBar: boolean | undefined): boolean {
	// Backward-compatibility rule:
	// Existing presets created before `pinnedToBar` was introduced have
	// `pinnedToBar === undefined` and should remain visible in the presets bar.
	// Only an explicit `false` means "not pinned".
	return pinnedToBar !== false;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((value, index) => value === right[index]);
}

function getPinnedPresetOrder(
	presets: Array<{ id: string; pinnedToBar?: boolean }>,
): string[] {
	return presets.flatMap((preset) =>
		isPresetPinnedToBar(preset.pinnedToBar) ? [preset.id] : [],
	);
}

function getTargetIndexForPinnedReorder({
	presets,
	pinnedPresetIds,
	presetId,
	targetPinnedIndex,
}: {
	presets: Array<{ id: string }>;
	pinnedPresetIds: string[];
	presetId: string;
	targetPinnedIndex: number;
}): number | null {
	const currentIndex = presets.findIndex((preset) => preset.id === presetId);
	if (currentIndex < 0) {
		return null;
	}

	const previousPinnedId =
		targetPinnedIndex > 0 ? pinnedPresetIds[targetPinnedIndex - 1] : undefined;
	const nextPinnedId =
		targetPinnedIndex < pinnedPresetIds.length - 1
			? pinnedPresetIds[targetPinnedIndex + 1]
			: undefined;

	if (nextPinnedId) {
		const nextIndex = presets.findIndex((preset) => preset.id === nextPinnedId);
		if (nextIndex < 0) {
			return null;
		}
		return currentIndex < nextIndex ? nextIndex - 1 : nextIndex;
	}

	if (previousPinnedId) {
		const previousIndex = presets.findIndex(
			(preset) => preset.id === previousPinnedId,
		);
		if (previousIndex < 0) {
			return null;
		}
		const adjustedPreviousIndex =
			currentIndex < previousIndex ? previousIndex - 1 : previousIndex;
		return adjustedPreviousIndex + 1;
	}

	return currentIndex;
}

export function PresetsBar() {
	const { workspaceId } = useParams({ strict: false });
	const navigate = useNavigate();
	const { presets, createPreset, updatePreset, reorderPresets } = usePresets();
	const isDark = useIsDarkTheme();
	const { openPreset } = useTabsWithPresets();
	const [localPinnedPresetIds, setLocalPinnedPresetIds] = useState<string[]>(
		() => getPinnedPresetOrder(presets),
	);
	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const setShowPresetsBar = electronTrpc.settings.setShowPresetsBar.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowPresetsBar.cancel();
				const previous = utils.settings.getShowPresetsBar.getData();
				utils.settings.getShowPresetsBar.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowPresetsBar.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getShowPresetsBar.invalidate();
			},
		},
	);
	const presetsByName = useMemo(() => {
		const map = new Map<string, typeof presets>();
		for (const preset of presets) {
			const existing = map.get(preset.name);
			if (existing) {
				existing.push(preset);
				continue;
			}
			map.set(preset.name, [preset]);
		}
		return map;
	}, [presets]);
	const pinnedPresets = useMemo(() => {
		const presetById = new Map(
			presets.map((preset, index) => [preset.id, { preset, index }]),
		);
		const orderedPinnedPresets: Array<{
			preset: (typeof presets)[number];
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

		for (const [index, preset] of presets.entries()) {
			if (!isPresetPinnedToBar(preset.pinnedToBar)) continue;
			if (seenIds.has(preset.id)) continue;
			orderedPinnedPresets.push({ preset, index });
		}

		return orderedPinnedPresets;
	}, [presets, localPinnedPresetIds]);
	const presetIndexById = useMemo(
		() => new Map(presets.map((preset, index) => [preset.id, index])),
		[presets],
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
		const customExisting = presets
			.filter(
				(preset) =>
					!templateNames.has(preset.name) ||
					!primaryTemplatePresetIds.has(preset.id),
			)
			.map((preset) => ({
				key: `preset:${preset.id}`,
				name: preset.name || "default",
				preset,
				template: null,
				iconName: preset.name,
			}));
		return [...fromTemplates, ...customExisting];
	}, [presetsByName, presets]);

	useEffect(() => {
		const serverPinnedPresetIds = getPinnedPresetOrder(presets);
		setLocalPinnedPresetIds((current) =>
			areStringArraysEqual(current, serverPinnedPresetIds)
				? current
				: serverPinnedPresetIds,
		);
	}, [presets]);

	const handleOpenPresetDefault = useCallback(
		(preset: (typeof presets)[number]) => {
			if (!workspaceId) return;
			openPreset(workspaceId, preset, { target: "active-tab" });
		},
		[workspaceId, openPreset],
	);

	const handleOpenPresetInNewTab = useCallback(
		(preset: (typeof presets)[number]) => {
			if (!workspaceId) return;
			openPreset(workspaceId, preset, {
				target: "new-tab",
			});
		},
		[workspaceId, openPreset],
	);

	const handleOpenPresetInPane = useCallback(
		(preset: (typeof presets)[number]) => {
			if (!workspaceId) return;
			openPreset(workspaceId, preset, {
				target: "active-tab",
				modeOverride: "split-pane",
			});
		},
		[workspaceId, openPreset],
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
			if (currentPinnedIndex === -1) {
				return;
			}
			const [moved] = reorderedPinnedPresetIds.splice(currentPinnedIndex, 1);
			reorderedPinnedPresetIds.splice(targetPinnedIndex, 0, moved);

			const targetIndex = getTargetIndexForPinnedReorder({
				presets,
				pinnedPresetIds: reorderedPinnedPresetIds,
				presetId,
				targetPinnedIndex,
			});
			if (targetIndex === null) return;

			reorderPresets.mutate({ presetId, targetIndex });
		},
		[presets, localPinnedPresetIds, reorderPresets],
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
								disabled={createPreset.isPending}
								onClick={() => {
									if (hasPreset && item.preset) {
										updatePreset.mutate({
											id: item.preset.id,
											patch: { pinnedToBar: !isPinned },
										});
										return;
									}
									if (!item.template) return;
									createPreset.mutate({
										...item.template.preset,
										pinnedToBar: true,
									});
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
					<DropdownMenuCheckboxItem
						checked={showPresetsBar ?? false}
						onCheckedChange={(checked) =>
							setShowPresetsBar.mutate({ enabled: checked })
						}
						onSelect={(e) => e.preventDefault()}
					>
						Show Preset Bar
					</DropdownMenuCheckboxItem>
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
					<PresetBarItem
						key={preset.id}
						preset={preset}
						pinnedIndex={pinnedIndex}
						hotkeyId={hotkeyId}
						isDark={isDark}
						canOpen={!!workspaceId}
						onOpenDefault={handleOpenPresetDefault}
						onOpenInNewTab={handleOpenPresetInNewTab}
						onOpenInPane={handleOpenPresetInPane}
						onEdit={(presetToEdit) => handleEditPreset(presetToEdit.id)}
						onLocalReorder={handleLocalPinnedReorder}
						onPersistReorder={handlePersistPinnedReorder}
					/>
				);
			})}
		</div>
	);
}
