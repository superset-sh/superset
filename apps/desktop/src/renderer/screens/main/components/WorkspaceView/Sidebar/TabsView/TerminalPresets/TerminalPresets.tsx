import { Button } from "@superset/ui/button";
import { motion } from "framer-motion";
import { HiMiniCommandLine, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenPresetModal } from "renderer/stores/preset-modal";
import { useWindowsStore } from "renderer/stores/tabs/store";
import type { TerminalPreset } from "shared/types";
import { PresetContextMenu } from "./PresetContextMenu";

interface TerminalPresetsProps {
	projectId: string;
	workspaceId: string;
	isResizing: boolean;
}

export function TerminalPresets({
	projectId,
	workspaceId,
	isResizing,
}: TerminalPresetsProps) {
	const { data: presets = [] } = trpc.config.getTerminalPresets.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);

	const { data: workspace } = trpc.workspaces.getActive.useQuery();
	const worktreePath = workspace?.worktreePath;

	const addWindow = useWindowsStore((s) => s.addWindow);
	const openPresetModal = useOpenPresetModal();
	const utils = trpc.useUtils();

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const deletePresetMutation = trpc.config.deleteTerminalPreset.useMutation({
		onSuccess: () => {
			utils.config.getTerminalPresets.invalidate();
		},
	});

	const handlePresetClick = async (preset: TerminalPreset) => {
		if (!workspaceId) return;

		// Create new window with pane
		const { paneId } = addWindow(workspaceId);

		// Resolve cwd - join with worktree path if relative
		let cwd: string | undefined;
		if (preset.cwd) {
			const isAbsolute = preset.cwd.startsWith("/");
			cwd = isAbsolute ? preset.cwd : `${worktreePath}/${preset.cwd}`;
		}

		// Normalize commands to array
		const commands = Array.isArray(preset.commands)
			? preset.commands
			: [preset.commands];

		// Create terminal with preset settings
		await createOrAttachMutation.mutateAsync({
			tabId: paneId,
			workspaceId,
			tabTitle: preset.name,
			cwd,
			initialCommands: commands,
		});
	};

	const handleDeletePreset = (presetName: string) => {
		deletePresetMutation.mutate({ projectId, presetName });
	};

	const handleNewPreset = () => {
		openPresetModal(projectId);
	};

	return (
		<div className="space-y-1 mt-2 pt-2 border-t border-border">
			<div className="px-3 py-1 text-xs text-muted-foreground font-medium">
				Presets
			</div>

			{presets.map((preset) => (
				<motion.div
					key={preset.name}
					layout={!isResizing}
					transition={{ layout: { duration: 0.2, ease: "easeInOut" } }}
				>
					<PresetContextMenu onDelete={() => handleDeletePreset(preset.name)}>
						<Button
							variant="ghost"
							onClick={() => handlePresetClick(preset)}
							className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center gap-2"
						>
							<HiMiniCommandLine className="size-4 shrink-0" />
							<span className="truncate flex-1">{preset.name}</span>
						</Button>
					</PresetContextMenu>
				</motion.div>
			))}

			<motion.div
				layout={!isResizing}
				transition={{ layout: { duration: 0.2, ease: "easeInOut" } }}
			>
				<Button
					variant="ghost"
					onClick={handleNewPreset}
					className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground"
				>
					<HiMiniPlus className="size-4 shrink-0" />
					<span className="truncate flex-1">New Preset</span>
				</Button>
			</motion.div>
		</div>
	);
}
