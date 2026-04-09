import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import {
	HiMiniCommandLine,
	HiOutlinePlus,
	HiOutlineTrash,
} from "react-icons/hi2";
import { LuPin, LuPinOff } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

interface V2PresetsSectionProps {
	showPresets: boolean;
	showQuickAdd: boolean;
}

interface Template {
	name: string;
	description: string;
	cwd: string;
	commands: string[];
}

const TEMPLATES: Template[] = AGENT_TYPES.map((agent) => ({
	name: agent,
	description: AGENT_PRESET_DESCRIPTIONS[agent],
	cwd: "",
	commands: AGENT_PRESET_COMMANDS[agent],
}));

function isPinned(preset: V2TerminalPresetRow): boolean {
	return preset.pinnedToBar !== false;
}

export function V2PresetsSection({
	showPresets,
	showQuickAdd,
}: V2PresetsSectionProps) {
	const collections = useCollections();
	const isDark = useIsDarkTheme();

	const { data: presets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);

	const existingNames = useMemo(
		() => new Set(presets.map((p) => p.name)),
		[presets],
	);

	const handleCreateFromTemplate = (template: Template) => {
		const maxTabOrder = presets.reduce(
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
	};

	const handleDelete = (presetId: string) => {
		collections.v2TerminalPresets.delete(presetId);
	};

	const handleTogglePin = (preset: V2TerminalPresetRow) => {
		collections.v2TerminalPresets.update(preset.id, (draft) => {
			draft.pinnedToBar = !isPinned(preset);
		});
	};

	return (
		<div className="space-y-6">
			{showPresets && (
				<section>
					<div className="mb-4">
						<h3 className="text-base font-semibold">Terminal Presets (v2)</h3>
						<p className="text-sm text-muted-foreground mt-1">
							Presets are stored locally in your browser profile and filtered by
							workspace project.
						</p>
					</div>
					{presets.length === 0 ? (
						<div className="text-sm text-muted-foreground border rounded-md p-4">
							No presets yet. Use the quick-add buttons below to create one from
							a template.
						</div>
					) : (
						<ul className="border rounded-md divide-y">
							{presets.map((preset) => {
								const icon = getPresetIcon(preset.name, isDark);
								const pinned = isPinned(preset);
								return (
									<li
										key={preset.id}
										className="flex items-center gap-3 px-3 py-2"
									>
										{icon ? (
											<img
												src={icon}
												alt=""
												className="size-4 object-contain shrink-0"
											/>
										) : (
											<HiMiniCommandLine className="size-4 shrink-0 text-muted-foreground" />
										)}
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium truncate">
												{preset.name || "default"}
											</div>
											{preset.description && (
												<div className="text-xs text-muted-foreground truncate">
													{preset.description}
												</div>
											)}
										</div>
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => handleTogglePin(preset)}
											title={pinned ? "Unpin from bar" : "Pin to bar"}
										>
											{pinned ? (
												<LuPin className="size-3.5" />
											) : (
												<LuPinOff className="size-3.5 text-muted-foreground" />
											)}
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => handleDelete(preset.id)}
											title="Delete preset"
										>
											<HiOutlineTrash className="size-3.5" />
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</section>
			)}

			{showQuickAdd && (
				<section>
					<div className="mb-4">
						<h3 className="text-base font-semibold">Quick Add</h3>
						<p className="text-sm text-muted-foreground mt-1">
							Add a preset from a built-in agent template.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{TEMPLATES.map((template) => {
							const icon = getPresetIcon(template.name, isDark);
							const alreadyExists = existingNames.has(template.name);
							return (
								<Button
									key={template.name}
									variant="outline"
									size="sm"
									disabled={alreadyExists}
									onClick={() => handleCreateFromTemplate(template)}
									className="gap-2"
								>
									{icon ? (
										<img src={icon} alt="" className="size-4 object-contain" />
									) : (
										<HiOutlinePlus className="size-4" />
									)}
									<span>{template.name}</span>
								</Button>
							);
						})}
					</div>
				</section>
			)}
		</div>
	);
}
