import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface CreatePRDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	worktreePath: string;
	baseBranch?: string;
	onSuccess: () => void;
}

export function CreatePRDialog({
	open,
	onOpenChange,
	worktreePath,
	baseBranch,
	onSuccess,
}: CreatePRDialogProps) {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [isDraft, setIsDraft] = useState(false);

	const { data: prSuggestion, isLoading: isSuggestionLoading } =
		electronTrpc.changes.generatePRBody.useQuery(
			{ worktreePath, baseBranch },
			{ enabled: open && !!worktreePath },
		);

	useEffect(() => {
		if (prSuggestion && open) {
			if (!title) setTitle(prSuggestion.title);
			if (!body) setBody(prSuggestion.body);
		}
	}, [prSuggestion, open, body, title]);

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setTitle("");
			setBody("");
			setIsDraft(false);
		}
	}, [open]);

	const createPRMutation = electronTrpc.changes.createPR.useMutation({
		onSuccess: (data) => {
			toast.success(`PR #${data.number} created`, {
				action: {
					label: "Open",
					onClick: () => window.open(data.url, "_blank"),
				},
			});
			onOpenChange(false);
			onSuccess();
		},
		onError: (error) => toast.error(`Failed to create PR: ${error.message}`),
	});

	const handleCreate = () => {
		if (!title.trim()) {
			toast.error("PR title is required");
			return;
		}
		createPRMutation.mutate({
			worktreePath,
			title: title.trim(),
			body: body.trim(),
			draft: isDraft,
			baseBranch,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[480px] gap-3 p-4">
				<DialogHeader className="pb-0">
					<DialogTitle className="text-sm font-medium">
						Create Pull Request
					</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pr-title" className="text-xs">
							Title
						</Label>
						<Input
							id="pr-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder={isSuggestionLoading ? "Generating..." : "PR title"}
							className="text-xs h-8"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									handleCreate();
								}
							}}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pr-body" className="text-xs">
							Description
						</Label>
						<Textarea
							id="pr-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							placeholder={
								isSuggestionLoading
									? "Generating..."
									: "Describe your changes..."
							}
							className="min-h-[120px] text-xs resize-none"
						/>
					</div>

					<div className="flex items-center gap-2">
						<Checkbox
							id="pr-draft"
							checked={isDraft}
							onCheckedChange={(checked) => setIsDraft(checked === true)}
						/>
						<Label htmlFor="pr-draft" className="text-xs cursor-pointer">
							Create as draft
						</Label>
					</div>
				</div>

				<DialogFooter className="pt-0 gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={handleCreate}
						disabled={!title.trim() || createPRMutation.isPending}
					>
						{createPRMutation.isPending
							? "Creating..."
							: isDraft
								? "Create Draft PR"
								: "Create PR"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
