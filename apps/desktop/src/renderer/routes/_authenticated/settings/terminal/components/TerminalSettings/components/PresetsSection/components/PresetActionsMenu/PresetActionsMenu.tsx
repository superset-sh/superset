import type { TerminalPreset } from "@superset/local-db";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	HiChevronDown,
	HiOutlineArrowDownTray,
	HiOutlineArrowUpTray,
	HiOutlinePlus,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface PresetActionsMenuProps {
	onAddPreset: () => void;
	isCreatePending: boolean;
}

function formatSkippedSuffix(skipped: number): string {
	return skipped > 0 ? `, ${skipped} skipped` : "";
}

function clonePresetsSnapshot(presets: TerminalPreset[]): TerminalPreset[] {
	return presets.map((preset) => ({
		...preset,
		commands: [...preset.commands],
	}));
}

function actionBadgeVariant(action: "create" | "update" | "unchanged") {
	switch (action) {
		case "create":
			return "default" as const;
		case "update":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
}

export function PresetActionsMenu({
	onAddPreset,
	isCreatePending,
}: PresetActionsMenuProps) {
	const utils = electronTrpc.useUtils();
	const { data: presets = [] } =
		electronTrpc.settings.getTerminalPresets.useQuery();
	const { data: presetsFileStatus } =
		electronTrpc.config.getPresetsFileStatus.useQuery();

	const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);

	const exportPresets = electronTrpc.config.exportPresets.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.config.getPresetsFileStatus.invalidate(),
				utils.config.previewImportPresets.invalidate(),
			]);
		},
	});

	const previewImportPresets =
		electronTrpc.config.previewImportPresets.useQuery(undefined, {
			enabled: isImportDialogOpen,
		});

	const importPresets = electronTrpc.config.importPresets.useMutation({
		onSuccess: async () => {
			await Promise.all([
				utils.config.getPresetsFileStatus.invalidate(),
				utils.config.previewImportPresets.invalidate(),
				utils.settings.getTerminalPresets.invalidate(),
				utils.settings.getWorkspaceCreationPresets.invalidate(),
				utils.settings.getNewTabPresets.invalidate(),
			]);
		},
	});

	const replaceTerminalPresets =
		electronTrpc.settings.replaceTerminalPresets.useMutation({
			onSuccess: async () => {
				await Promise.all([
					utils.settings.getTerminalPresets.invalidate(),
					utils.settings.getWorkspaceCreationPresets.invalidate(),
					utils.settings.getNewTabPresets.invalidate(),
				]);
			},
		});

	useEffect(() => {
		if (!isImportDialogOpen || !previewImportPresets.data) {
			return;
		}
		const defaultSelected = previewImportPresets.data.items
			.filter((item) => item.action !== "unchanged")
			.map((item) => item.index);
		setSelectedIndices(new Set(defaultSelected));
	}, [isImportDialogOpen, previewImportPresets.data]);

	const selectedCount = selectedIndices.size;
	const totalCount = previewImportPresets.data?.items.length ?? 0;
	const allSelected = totalCount > 0 && selectedCount === totalCount;
	const hasPreviewData = !!previewImportPresets.data;
	const canImportSelected =
		hasPreviewData &&
		selectedCount > 0 &&
		!previewImportPresets.isFetching &&
		!importPresets.isPending;

	const selectedIndicesArray = useMemo(
		() => [...selectedIndices].sort((left, right) => left - right),
		[selectedIndices],
	);

	const handleUndoImport = useCallback(
		async (snapshot: TerminalPreset[]) => {
			try {
				await replaceTerminalPresets.mutateAsync({ presets: snapshot });
				toast.success("Import undone", {
					description:
						"Terminal presets were restored to their previous state.",
				});
			} catch (error) {
				toast.error("Failed to undo import", {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		},
		[replaceTerminalPresets],
	);

	const handleImportConfirm = useCallback(async () => {
		if (selectedIndicesArray.length === 0) {
			toast.error("No presets selected", {
				description: "Select at least one preset to import.",
			});
			return;
		}

		const snapshot = clonePresetsSnapshot(presets);
		try {
			const result = await importPresets.mutateAsync({
				selectedIndices: selectedIndicesArray,
			});
			setIsImportDialogOpen(false);
			toast.success("Presets imported", {
				description: `${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged${formatSkippedSuffix(result.skipped)}\n${result.path}`,
				action: {
					label: "Undo",
					onClick: () => {
						void handleUndoImport(snapshot);
					},
				},
			});
		} catch (error) {
			toast.error("Failed to import presets", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	}, [handleUndoImport, importPresets, presets, selectedIndicesArray]);

	const handleExport = useCallback(async () => {
		try {
			const result = await exportPresets.mutateAsync();
			toast.success("Presets exported", {
				description: `${result.exported} exported${formatSkippedSuffix(result.skipped)}\n${result.path}`,
			});
		} catch (error) {
			toast.error("Failed to export presets", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	}, [exportPresets]);

	const toggleIndex = useCallback((index: number, checked: boolean) => {
		setSelectedIndices((previous) => {
			const next = new Set(previous);
			if (checked) {
				next.add(index);
			} else {
				next.delete(index);
			}
			return next;
		});
	}, []);

	const toggleAll = useCallback(() => {
		setSelectedIndices((previous) => {
			const items = previewImportPresets.data?.items ?? [];
			if (items.length === 0) {
				return previous;
			}

			if (previous.size === items.length) {
				return new Set();
			}

			return new Set(items.map((item) => item.index));
		});
	}, [previewImportPresets.data]);

	return (
		<>
			<div className="flex items-center">
				<Button
					variant="default"
					size="sm"
					className="gap-2 rounded-r-none"
					onClick={onAddPreset}
					disabled={isCreatePending}
				>
					<HiOutlinePlus className="h-4 w-4" />
					Add Preset
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="default"
							size="sm"
							className="rounded-l-none px-2 border-l border-white/15"
							aria-label="More preset actions"
						>
							<HiChevronDown className="h-4 w-4 text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuItem
							onClick={() => setIsImportDialogOpen(true)}
							disabled={!presetsFileStatus?.exists}
						>
							<HiOutlineArrowDownTray className="h-4 w-4" />
							Import from file
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleExport}
							disabled={exportPresets.isPending}
						>
							<HiOutlineArrowUpTray className="h-4 w-4" />
							{exportPresets.isPending ? "Exporting..." : "Export to file"}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground break-all">
							{presetsFileStatus?.path ?? "Loading presets path..."}
						</DropdownMenuLabel>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<Dialog
				modal
				open={isImportDialogOpen}
				onOpenChange={setIsImportDialogOpen}
			>
				<DialogContent className="sm:max-w-2xl gap-0 p-0" showCloseButton>
					<DialogHeader className="px-4 pt-4 pb-3 border-b">
						<DialogTitle className="text-base">
							Review Preset Import
						</DialogTitle>
						<DialogDescription>
							Review changes from <code>{presetsFileStatus?.path}</code> before
							importing.
						</DialogDescription>
					</DialogHeader>

					<div className="px-4 py-3 space-y-3">
						{previewImportPresets.isLoading ||
						previewImportPresets.isFetching ? (
							<p className="text-sm text-muted-foreground">
								Loading import preview...
							</p>
						) : previewImportPresets.error ? (
							<p className="text-sm text-destructive">
								{previewImportPresets.error.message}
							</p>
						) : previewImportPresets.data ? (
							<>
								<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
									<div className="rounded-md border p-2">
										<p className="text-[11px] text-muted-foreground">Created</p>
										<p className="text-sm font-medium">
											{previewImportPresets.data.created}
										</p>
									</div>
									<div className="rounded-md border p-2">
										<p className="text-[11px] text-muted-foreground">Updated</p>
										<p className="text-sm font-medium">
											{previewImportPresets.data.updated}
										</p>
									</div>
									<div className="rounded-md border p-2">
										<p className="text-[11px] text-muted-foreground">
											Unchanged
										</p>
										<p className="text-sm font-medium">
											{previewImportPresets.data.unchanged}
										</p>
									</div>
									<div className="rounded-md border p-2">
										<p className="text-[11px] text-muted-foreground">Skipped</p>
										<p className="text-sm font-medium">
											{previewImportPresets.data.skipped}
										</p>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<Button variant="ghost" size="sm" onClick={toggleAll}>
										{allSelected ? "Clear all" : "Select all"}
									</Button>
									<p className="text-xs text-muted-foreground">
										{selectedCount} selected of {totalCount}
									</p>
								</div>

								<div className="max-h-[320px] overflow-auto rounded-md border">
									{previewImportPresets.data.items.length === 0 ? (
										<p className="px-3 py-4 text-sm text-muted-foreground">
											No presets found in the import file.
										</p>
									) : (
										previewImportPresets.data.items.map((item) => (
											<div
												key={item.index}
												className="flex items-start gap-3 px-3 py-2 border-b last:border-b-0"
											>
												<Checkbox
													className="mt-0.5"
													checked={selectedIndices.has(item.index)}
													onCheckedChange={(checked) =>
														toggleIndex(item.index, checked === true)
													}
												/>
												<div className="min-w-0 flex-1 space-y-1">
													<div className="flex items-center gap-2">
														<p className="text-sm font-medium truncate">
															{item.name}
														</p>
														<Badge
															variant={actionBadgeVariant(item.action)}
															className="text-[10px] uppercase"
														>
															{item.action}
														</Badge>
													</div>
													{item.action === "update" &&
														item.changedFields.length > 0 && (
															<p className="text-xs text-muted-foreground">
																Changes: {item.changedFields.join(", ")}
															</p>
														)}
													{item.action === "unchanged" && (
														<p className="text-xs text-muted-foreground">
															No changes.
														</p>
													)}
												</div>
											</div>
										))
									)}
								</div>
							</>
						) : null}
					</div>

					<DialogFooter className="border-t px-4 pb-4 pt-3">
						<Button
							variant="outline"
							onClick={() => setIsImportDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button onClick={handleImportConfirm} disabled={!canImportSelected}>
							{importPresets.isPending
								? "Importing..."
								: `Import ${selectedCount} preset${selectedCount === 1 ? "" : "s"}`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
