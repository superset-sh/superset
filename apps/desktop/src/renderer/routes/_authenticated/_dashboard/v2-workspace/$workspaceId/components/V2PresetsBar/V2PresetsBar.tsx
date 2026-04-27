import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiMiniCommandLine } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import type { HotkeyId } from "renderer/hotkeys";
import { useMigrateV1PresetsToV2 } from "renderer/routes/_authenticated/hooks/useMigrateV1PresetsToV2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { V2PresetBarItem } from "./components/V2PresetBarItem";

interface V2PresetsBarProps {
	matchedPresets: V2TerminalPresetRow[];
	executePreset: (preset: V2TerminalPresetRow) => void;
}

// Co-located to keep v2 self-contained. Mirrors the v1 array in
// renderer/hotkeys/registry.ts; order matches the registry OPEN_PRESET_{n}
// definitions so PRESET_HOTKEY_IDS[i] targets the i-th visible preset.
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

function isPresetVisibleInBar(pinnedToBar: boolean | undefined): boolean {
	// The persisted field is legacy "pinned" wording; the v2 UI treats it as
	// show/hide visibility. Undefined defaults to visible for compatibility.
	return pinnedToBar !== false;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function getVisiblePresetOrder(
	presets: ReadonlyArray<{ id: string; pinnedToBar?: boolean }>,
): string[] {
	return presets.flatMap((preset) =>
		isPresetVisibleInBar(preset.pinnedToBar) ? [preset.id] : [],
	);
}

export function V2PresetsBar({
	matchedPresets,
	executePreset,
}: V2PresetsBarProps) {
	const navigate = useNavigate();
	const isDark = useIsDarkTheme();
	const collections = useCollections();
	useMigrateV1PresetsToV2();

	const [localVisiblePresetIds, setLocalVisiblePresetIds] = useState<string[]>(
		() => getVisiblePresetOrder(matchedPresets),
	);

	useEffect(() => {
		const serverVisiblePresetIds = getVisiblePresetOrder(matchedPresets);
		setLocalVisiblePresetIds((current) =>
			areStringArraysEqual(current, serverVisiblePresetIds)
				? current
				: serverVisiblePresetIds,
		);
	}, [matchedPresets]);

	const visiblePresets = useMemo(() => {
		const presetById = new Map(
			matchedPresets.map((preset, index) => [preset.id, { preset, index }]),
		);
		const orderedVisiblePresets: Array<{
			preset: V2TerminalPresetRow;
			index: number;
		}> = [];
		const seenIds = new Set<string>();

		for (const presetId of localVisiblePresetIds) {
			const item = presetById.get(presetId);
			if (!item) continue;
			if (!isPresetVisibleInBar(item.preset.pinnedToBar)) continue;
			orderedVisiblePresets.push(item);
			seenIds.add(presetId);
		}

		for (const [index, preset] of matchedPresets.entries()) {
			if (!isPresetVisibleInBar(preset.pinnedToBar)) continue;
			if (seenIds.has(preset.id)) continue;
			orderedVisiblePresets.push({ preset, index });
		}

		return orderedVisiblePresets;
	}, [matchedPresets, localVisiblePresetIds]);

	const visiblePresetIndexById = useMemo(
		() =>
			new Map(
				visiblePresets.map(({ preset }, visibleIndex) => [
					preset.id,
					visibleIndex,
				]),
			),
		[visiblePresets],
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

	const handleLocalVisibleReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			setLocalVisiblePresetIds((current) => {
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

	const handlePersistVisibleReorder = useCallback(
		(presetId: string, targetVisibleIndex: number) => {
			const reorderedVisiblePresetIds = [...localVisiblePresetIds];
			const currentVisibleIndex = reorderedVisiblePresetIds.indexOf(presetId);
			if (currentVisibleIndex === -1) return;
			const [moved] = reorderedVisiblePresetIds.splice(currentVisibleIndex, 1);
			reorderedVisiblePresetIds.splice(targetVisibleIndex, 0, moved);

			const visibleSet = new Set(reorderedVisiblePresetIds);
			const hidden = matchedPresets
				.filter((preset) => !visibleSet.has(preset.id))
				.map((preset) => preset.id);
			const finalOrder = [...reorderedVisiblePresetIds, ...hidden];
			const currentTabOrderById = new Map(
				matchedPresets.map((preset) => [preset.id, preset.tabOrder]),
			);

			for (const [index, id] of finalOrder.entries()) {
				if (currentTabOrderById.get(id) === index) continue;
				collections.v2TerminalPresets.update(id, (draft) => {
					draft.tabOrder = index;
				});
			}
		},
		[collections.v2TerminalPresets, localVisiblePresetIds, matchedPresets],
	);

	const handleTogglePresetVisibility = useCallback(
		(presetId: string, nextVisible: boolean) => {
			collections.v2TerminalPresets.update(presetId, (draft) => {
				draft.pinnedToBar = nextVisible;
			});
		},
		[collections.v2TerminalPresets],
	);

	return (
		<div
			className="flex h-8 min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border bg-background px-2"
			style={{ scrollbarWidth: "none" }}
		>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-6 shrink-0">
								<Settings className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom" sideOffset={4}>
						Manage Presets
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-56">
					{matchedPresets.map((preset) => {
						const icon = getPresetIcon(preset.name, isDark);
						const isVisible = isPresetVisibleInBar(preset.pinnedToBar);
						const visibleIndex = visiblePresetIndexById.get(preset.id);
						const hotkeyId =
							typeof visibleIndex === "number"
								? PRESET_HOTKEY_IDS[visibleIndex]
								: undefined;
						return (
							<DropdownMenuItem
								key={preset.id}
								className="gap-2"
								onSelect={(event) => {
									event.preventDefault();
									handleTogglePresetVisibility(preset.id, !isVisible);
								}}
							>
								{icon ? (
									<img src={icon} alt="" className="size-4 object-contain" />
								) : (
									<HiMiniCommandLine className="size-4" />
								)}
								<span className="min-w-0 flex-1 truncate">
									{preset.name || "default"}
								</span>
								<div className="ml-auto flex items-center gap-2">
									{isVisible && hotkeyId ? (
										<HotkeyMenuShortcut hotkeyId={hotkeyId} />
									) : null}
									{isVisible ? (
										<Eye className="size-3.5 text-foreground" />
									) : (
										<EyeOff className="size-3.5 text-muted-foreground/60" />
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
						<Settings className="size-4" />
						<span>Manage Presets</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{visiblePresets.map(({ preset }, visibleIndex) => {
				const hotkeyId = PRESET_HOTKEY_IDS[visibleIndex];
				return (
					<V2PresetBarItem
						key={preset.id}
						preset={preset}
						visibleIndex={visibleIndex}
						hotkeyId={hotkeyId}
						isDark={isDark}
						onExecutePreset={executePreset}
						onEdit={(presetToEdit) => handleEditPreset(presetToEdit.id)}
						onLocalReorder={handleLocalVisibleReorder}
						onPersistReorder={handlePersistVisibleReorder}
					/>
				);
			})}
		</div>
	);
}
