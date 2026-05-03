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
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface SubmitPromptDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SubmitPromptDialog({
	open,
	onOpenChange,
}: SubmitPromptDialogProps) {
	const [promptText, setPromptText] = useState("");
	const [submitterName, setSubmitterName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const reset = () => {
		setPromptText("");
		setSubmitterName("");
		setIsSubmitting(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const canSubmit = promptText.trim().length > 0 && !isSubmitting;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.support.submitPrompt.mutate({
				promptText: promptText.trim(),
				submitterName: submitterName.trim() || undefined,
			});
			toast.success("Prompt submitted — thanks!");
			handleOpenChange(false);
		} catch (error) {
			console.error("[submit-prompt] failed", error);
			toast.error("Could not submit prompt. Try again.");
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSubmit();
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Submit a prompt</DialogTitle>
					<DialogDescription>
						Prompt a coding agent to build what you want to see in Superset. If
						we like your prompt, we'll run it and merge the result.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-text">Prompt</Label>
						<Textarea
							id="submit-prompt-text"
							value={promptText}
							onChange={(e) => setPromptText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Describe what you'd like to see built…"
							rows={6}
							autoFocus
							disabled={isSubmitting}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-name">
							Your name{" "}
							<span className="font-normal text-muted-foreground">
								(if we use your prompt, we'll credit you in the changelog)
							</span>
						</Label>
						<Input
							id="submit-prompt-name"
							value={submitterName}
							onChange={(e) => setSubmitterName(e.target.value)}
							placeholder="Jane Doe"
							disabled={isSubmitting}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting ? "Submitting…" : "Submit prompt"}
						<span className="ml-2 inline-flex items-center gap-1 text-base font-mono tabular-nums opacity-80">
							<span>⌘</span>
							<span>↵</span>
						</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
