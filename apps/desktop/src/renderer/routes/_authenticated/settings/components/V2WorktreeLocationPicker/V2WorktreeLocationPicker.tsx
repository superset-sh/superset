import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuFolderOpen, LuRotateCcw } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface V2WorktreeLocationPickerProps {
	currentPath: string | null | undefined;
	fallbackPath: string | null | undefined;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	disabled?: boolean;
	browseTitle?: string;
	browseDescription?: string;
	onSelect: (path: string) => void | Promise<void>;
	onReset: () => void | Promise<void>;
}

export function V2WorktreeLocationPicker({
	currentPath,
	fallbackPath,
	hostUrl,
	hostName,
	isRemoteTarget,
	disabled,
	browseTitle = "Select worktree location",
	browseDescription,
	onSelect,
	onReset,
}: V2WorktreeLocationPickerProps) {
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const [remoteBrowseOpen, setRemoteBrowseOpen] = useState(false);

	const displayPath = currentPath ?? fallbackPath ?? "Host unavailable";
	const isBusy = disabled || selectDirectory.isPending;

	const handleBrowse = async () => {
		if (isBusy) return;
		if (isRemoteTarget) {
			setRemoteBrowseOpen(true);
			return;
		}
		const result = await selectDirectory.mutateAsync({
			title: browseTitle,
			defaultPath: currentPath ?? fallbackPath ?? undefined,
		});
		if (!result.canceled && result.path) {
			await onSelect(result.path);
		}
	};

	return (
		<>
			<div className="flex w-[28rem] max-w-full items-center gap-2">
				<div className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border bg-transparent px-3 dark:bg-input/30">
					<span
						className="font-mono text-sm text-foreground"
						title={displayPath}
					>
						{displayPath}
					</span>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-9 shrink-0"
							onClick={handleBrowse}
							disabled={isBusy || !hostUrl}
							aria-label="Change worktree location"
						>
							<LuFolderOpen className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Change location</TooltipContent>
				</Tooltip>
				{currentPath ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-9 shrink-0"
								onClick={onReset}
								disabled={disabled}
								aria-label="Reset worktree location"
							>
								<LuRotateCcw className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Reset location</TooltipContent>
					</Tooltip>
				) : null}
			</div>

			<RemotePathPicker
				open={remoteBrowseOpen}
				onOpenChange={setRemoteBrowseOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={currentPath ?? fallbackPath}
				title={browseTitle}
				description={
					browseDescription ?? `Pick the worktree folder on ${hostName}.`
				}
				confirmLabel="Use this folder"
				onPick={(path) => {
					void onSelect(path);
				}}
			/>
		</>
	);
}
