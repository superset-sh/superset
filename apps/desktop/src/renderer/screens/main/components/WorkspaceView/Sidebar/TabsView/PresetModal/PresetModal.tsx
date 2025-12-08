import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	useClosePresetModal,
	usePresetModalOpen,
	usePresetModalPrefillCwd,
	usePresetModalProjectId,
} from "renderer/stores/preset-modal";

export function PresetModal() {
	const isOpen = usePresetModalOpen();
	const projectId = usePresetModalProjectId();
	const prefillCwd = usePresetModalPrefillCwd();
	const closeModal = useClosePresetModal();

	const [name, setName] = useState("");
	const [cwd, setCwd] = useState("");
	const [commands, setCommands] = useState("");

	const utils = trpc.useUtils();

	const savePresetMutation = trpc.config.saveTerminalPreset.useMutation({
		onSuccess: () => {
			utils.config.getTerminalPresets.invalidate();
			closeModal();
		},
	});

	// Reset form when modal opens/closes
	useEffect(() => {
		if (isOpen) {
			setName("");
			setCwd(prefillCwd || "");
			setCommands("");
		}
	}, [isOpen, prefillCwd]);

	const handleSave = () => {
		if (!projectId || !name.trim() || !commands.trim()) return;

		// Split commands by newline and filter empty lines
		const commandList = commands
			.split("\n")
			.map((c) => c.trim())
			.filter((c) => c.length > 0);

		savePresetMutation.mutate({
			projectId,
			preset: {
				name: name.trim(),
				cwd: cwd.trim() || undefined,
				commands: commandList.length === 1 ? commandList[0] : commandList,
			},
		});
	};

	const isValid = name.trim().length > 0 && commands.trim().length > 0;

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && closeModal()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create Terminal Preset</DialogTitle>
					<DialogDescription>
						Save a terminal configuration for quick access from the sidebar.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="preset-name">Name</Label>
						<Input
							id="preset-name"
							placeholder="e.g., Dev Server"
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="preset-cwd">
							Working Directory{" "}
							<span className="text-muted-foreground font-normal">
								(optional)
							</span>
						</Label>
						<Input
							id="preset-cwd"
							placeholder="e.g., ./apps/web"
							value={cwd}
							onChange={(e) => setCwd(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Relative to project root or absolute path
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="preset-commands">Commands</Label>
						<Textarea
							id="preset-commands"
							placeholder="One command per line"
							value={commands}
							onChange={(e) => setCommands(e.target.value)}
							rows={3}
						/>
						<p className="text-xs text-muted-foreground">
							Commands run sequentially when the preset is launched
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={!isValid || savePresetMutation.isPending}
					>
						{savePresetMutation.isPending ? "Saving..." : "Save Preset"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
