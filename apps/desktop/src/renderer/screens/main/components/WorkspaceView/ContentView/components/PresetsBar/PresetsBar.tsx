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
import { useMemo } from "react";
import { HiMiniCog6Tooth, HiMiniCommandLine } from "react-icons/hi2";
import { LuCirclePlus, LuPin } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent/HotkeyTooltipContent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import { PRESET_HOTKEY_IDS } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";

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

export function PresetsBar() {
	const { workspaceId } = useParams({ strict: false });
	const navigate = useNavigate();
	const { presets, createPreset, updatePreset } = usePresets();
	const isDark = useIsDarkTheme();
	const { openPreset } = useTabsWithPresets();
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
	const pinnedPresets = useMemo(
		() =>
			presets.flatMap((preset, index) =>
				isPresetPinnedToBar(preset.pinnedToBar) ? [{ preset, index }] : [],
			),
		[presets],
	);
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
						onClick={() => navigate({ to: "/settings/presets" })}
					>
						<HiMiniCog6Tooth className="size-4" />
						<span>Manage Presets</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="h-4 w-px bg-border mx-1 shrink-0" />
			{pinnedPresets.map(({ preset, index }) => {
				const icon = getPresetIcon(preset.name, isDark);
				const hotkeyId = PRESET_HOTKEY_IDS[index];
				const label = preset.description || preset.name || "default";
				return (
					<Tooltip key={preset.id}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 gap-1.5 text-xs shrink-0"
								onClick={() => {
									if (workspaceId) {
										openPreset(workspaceId, preset, {
											target: "active-tab",
										});
									}
								}}
							>
								{icon ? (
									<img src={icon} alt="" className="size-3.5 object-contain" />
								) : (
									<HiMiniCommandLine className="size-3.5" />
								)}
								<span className="truncate max-w-[120px]">
									{preset.name || "default"}
								</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={4}>
							<HotkeyTooltipContent label={label} hotkeyId={hotkeyId} />
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
