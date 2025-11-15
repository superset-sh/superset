import { Button } from "@superset/ui/button";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";
import { Input } from "renderer/components/ui/input";
import { Label } from "renderer/components/ui/label";

interface CloneFromUrlDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onClone: (url: string, destinationPath: string) => Promise<void>;
}

export function CloneFromUrlDialog({
	open,
	onOpenChange,
	onClone,
}: CloneFromUrlDialogProps) {
	const [url, setUrl] = useState("");
	const [destinationName, setDestinationName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Extract repo name from URL
	const extractRepoName = (gitUrl: string): string => {
		try {
			// Handle GitHub URLs like https://github.com/user/repo or git@github.com:user/repo.git
			const match = gitUrl.match(/\/([^/]+?)(\.git)?$/);
			if (match) {
				return match[1];
			}
			return "";
		} catch {
			return "";
		}
	};

	const handleUrlChange = (newUrl: string) => {
		setUrl(newUrl);
		setError(null);

		// Auto-populate destination name from URL
		const repoName = extractRepoName(newUrl);
		if (repoName && !destinationName) {
			setDestinationName(repoName);
		}
	};

	const handleBrowse = async () => {
		try {
			const result = await window.ipcRenderer.invoke(
				"workspace-select-directory",
			);

			if (!result.canceled && result.filePath) {
				// Get the repo name from URL if available
				const repoName = extractRepoName(url);
				// Append repo name to selected directory path
				const fullPath = repoName
					? `${result.filePath}/${repoName}`
					: result.filePath;
				setDestinationName(fullPath);
			}
		} catch (err) {
			console.error("Failed to open directory picker:", err);
		}
	};

	const handleClone = async () => {
		if (!url || !destinationName) {
			setError("Please provide both URL and destination name");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			await onClone(url, destinationName);

			// Reset form
			setUrl("");
			setDestinationName("");
			onOpenChange(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to clone repository",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px] bg-[#1e1e1e] border border-neutral-800">
				<DialogHeader>
					<DialogTitle className="text-white">Clone from URL</DialogTitle>
					<DialogDescription className="text-neutral-400">
						Clone a Git repository from a URL
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="url" className="text-neutral-300">
							Repository URL
						</Label>
						<Input
							id="url"
							type="text"
							placeholder="https://github.com/username/repository.git"
							value={url}
							onChange={(e) => handleUrlChange(e.target.value)}
							className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
							disabled={isLoading}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="destination" className="text-neutral-300">
							Destination path
						</Label>
						<div className="flex gap-2">
							<Input
								id="destination"
								type="text"
								placeholder="/Users/username/Developer/my-project"
								value={destinationName}
								onChange={(e) => setDestinationName(e.target.value)}
								className="flex-1 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
								disabled={isLoading}
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={handleBrowse}
								disabled={isLoading}
								className="bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
							>
								<FolderOpen className="h-4 w-4" />
							</Button>
						</div>
						<p className="text-xs text-neutral-500">
							Full path where the repository will be cloned
						</p>
					</div>

					{error && (
						<div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-3">
							{error}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isLoading}
						className="bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700"
					>
						Cancel
					</Button>
					<Button
						onClick={handleClone}
						disabled={isLoading || !url || !destinationName}
						className="bg-blue-600 hover:bg-blue-700 text-white"
					>
						{isLoading ? "Cloning..." : "Clone"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
