import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { ExternalLink, GitPullRequest, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

interface CreatePRModalProps {
	isOpen: boolean;
	onClose: () => void;
	workspaceId: string;
	worktreeId: string;
	defaultTitle?: string;
	defaultBody?: string;
	baseBranch?: string;
}

export const CreatePRModal: React.FC<CreatePRModalProps> = ({
	isOpen,
	onClose,
	workspaceId,
	worktreeId,
	defaultTitle = "",
	defaultBody = "",
	baseBranch = "main",
}) => {
	const [title, setTitle] = useState(defaultTitle);
	const [body, setBody] = useState(defaultBody);
	const [branch, setBranch] = useState(baseBranch);
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successUrl, setSuccessUrl] = useState<string | null>(null);

	// Reset form when modal opens with new defaults
	useEffect(() => {
		if (isOpen) {
			setTitle(defaultTitle);
			setBody(defaultBody);
			setBranch(baseBranch);
			setError(null);
			setSuccessUrl(null);
		}
	}, [isOpen, defaultTitle, defaultBody, baseBranch]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		setIsCreating(true);
		setError(null);

		try {
			const result = await window.ipcRenderer.invoke("worktree-create-pr", {
				workspaceId,
				worktreeId,
				title: title.trim(),
				body: body.trim(),
				baseBranch: branch,
			});

			if (result.success && result.prUrl) {
				setSuccessUrl(result.prUrl);
				// Auto-close after 2 seconds on success
				setTimeout(() => {
					onClose();
				}, 2000);
			} else {
				setError(result.error || "Failed to create PR");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "An unexpected error occurred");
		} finally {
			setIsCreating(false);
		}
	};

	const handleOpenPR = () => {
		if (successUrl) {
			window.ipcRenderer.invoke("open-external", successUrl);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="w-[600px]! max-w-[90vw]! max-h-[85vh]! p-0 gap-0 flex flex-col">
				{/* Header */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-800 shrink-0">
					<div className="flex items-center gap-2">
						<GitPullRequest size={20} className="text-neutral-400" />
						<DialogTitle className="text-xl">Create Pull Request</DialogTitle>
					</div>
				</DialogHeader>

				{/* Success state */}
				{successUrl ? (
					<div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
						<div className="rounded-full bg-green-500/10 p-4">
							<GitPullRequest size={32} className="text-green-500" />
						</div>
						<div className="text-center">
							<h3 className="text-lg font-medium text-neutral-100 mb-1">
								Pull Request Created!
							</h3>
							<p className="text-sm text-neutral-400">
								Your PR has been created successfully
							</p>
						</div>
						<Button onClick={handleOpenPR} className="gap-2">
							<ExternalLink size={16} />
							Open PR
						</Button>
					</div>
				) : (
					<>
						{/* Form */}
						<form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
							<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
								{/* Title */}
								<div className="space-y-2">
									<Label htmlFor="pr-title">Title *</Label>
									<Input
										id="pr-title"
										placeholder="PR title"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										autoFocus
										required
										disabled={isCreating}
									/>
								</div>

								{/* Body */}
								<div className="space-y-2 flex-1">
									<Label htmlFor="pr-body">Description</Label>
									<Textarea
										id="pr-body"
										placeholder="Describe your changes..."
										value={body}
										onChange={(e) => setBody(e.target.value)}
										className="min-h-[200px] resize-none"
										disabled={isCreating}
									/>
								</div>

								{/* Base branch */}
								<div className="space-y-2">
									<Label htmlFor="pr-branch">Base Branch</Label>
									<Input
										id="pr-branch"
										value={branch}
										onChange={(e) => setBranch(e.target.value)}
										disabled={isCreating}
									/>
								</div>

								{/* Error message */}
								{error && (
									<div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
										<p className="text-sm text-red-400">{error}</p>
									</div>
								)}
							</div>

							{/* Footer */}
							<div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-end gap-2 shrink-0">
								<Button
									type="button"
									variant="ghost"
									onClick={onClose}
									disabled={isCreating}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={!title.trim() || isCreating}
									className="gap-2"
								>
									{isCreating ? (
										<>
											<Loader2 size={16} className="animate-spin" />
											Creating...
										</>
									) : (
										<>
											<GitPullRequest size={16} />
											Create PR
										</>
									)}
								</Button>
							</div>
						</form>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
