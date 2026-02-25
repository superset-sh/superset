import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface PresetSharingProps {
	projectId: string;
}

function formatSkippedSuffix(skipped: number): string {
	return skipped > 0 ? `, ${skipped} skipped` : "";
}

export function PresetSharing({ projectId }: PresetSharingProps) {
	const utils = electronTrpc.useUtils();
	const { data: presetsFileStatus } =
		electronTrpc.config.getPresetsFileStatus.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);

	const exportPresets = electronTrpc.config.exportPresets.useMutation({
		onSuccess: async () => {
			await utils.config.getPresetsFileStatus.invalidate({ projectId });
		},
	});
	const importPresets = electronTrpc.config.importPresets.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.config.getPresetsFileStatus.invalidate({ projectId }),
				utils.settings.getTerminalPresets.invalidate(),
				utils.settings.getWorkspaceCreationPresets.invalidate(),
				utils.settings.getNewTabPresets.invalidate(),
			]);
		},
	});

	const handleExport = useCallback(async () => {
		try {
			const result = await exportPresets.mutateAsync({ projectId });
			toast.success("Presets exported", {
				description: `${result.exported} exported${formatSkippedSuffix(result.skipped)}\n${result.path}`,
			});
		} catch (error) {
			toast.error("Failed to export presets", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	}, [exportPresets, projectId]);

	const handleImport = useCallback(async () => {
		try {
			const result = await importPresets.mutateAsync({ projectId });
			toast.success("Presets imported", {
				description: `${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged${formatSkippedSuffix(result.skipped)}\n${result.path}`,
			});
		} catch (error) {
			toast.error("Failed to import presets", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	}, [importPresets, projectId]);

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h3 className="text-base font-semibold text-foreground">Presets</h3>
				<p className="text-sm text-muted-foreground">
					Share terminal presets in your repository through{" "}
					<code>{".superset/presets.json"}</code>. Commit the file so teammates
					can import the same presets.
				</p>
			</div>

			<div className="rounded-lg border border-border p-3 space-y-1.5">
				<p className="text-xs font-medium text-muted-foreground">
					Shared file path
				</p>
				<p className="text-xs font-mono break-all">
					{presetsFileStatus?.path ?? ".superset/presets.json"}
				</p>
				<p className="text-xs text-muted-foreground">
					{presetsFileStatus?.exists
						? "File found in this repository."
						: "File not found yet. Export to create it."}
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={handleImport}
					disabled={importPresets.isPending || !presetsFileStatus?.exists}
				>
					{importPresets.isPending ? "Importing..." : "Import from file"}
				</Button>
				<Button
					size="sm"
					onClick={handleExport}
					disabled={exportPresets.isPending}
				>
					{exportPresets.isPending ? "Exporting..." : "Export to file"}
				</Button>
			</div>
		</div>
	);
}
