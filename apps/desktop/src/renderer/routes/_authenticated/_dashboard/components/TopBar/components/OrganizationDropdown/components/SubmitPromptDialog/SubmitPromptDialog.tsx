import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
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
			toast.success(
				t({
					id: "dashboard.topBar.submitPromptDialog.submitted",
					message: "Prompt submitted — thanks!",
				}),
			);
			handleOpenChange(false);
		} catch (error) {
			console.error("[submit-prompt] failed", error);
			toast.error(
				t({
					id: "dashboard.topBar.submitPromptDialog.submitFailed",
					message: "Could not submit prompt. Try again.",
				}),
			);
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
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						<Trans id="dashboard.topBar.submitPromptDialog.title">
							Submit a prompt
						</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans id="dashboard.topBar.submitPromptDialog.description">
							Prompt a coding agent to build what you want to see in Superset.
							If we like your prompt, we'll run it and merge the result.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-text">
							<Trans id="dashboard.topBar.submitPromptDialog.promptLabel">
								Prompt
							</Trans>
						</Label>
						<Textarea
							id="submit-prompt-text"
							value={promptText}
							onChange={(e) => setPromptText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t({
								id: "dashboard.topBar.submitPromptDialog.promptPlaceholder",
								message: "Describe what you'd like to see built…",
							})}
							rows={6}
							autoFocus
							disabled={isSubmitting}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-name">
							<Trans id="dashboard.topBar.submitPromptDialog.nameLabel">
								Your name{" "}
								<span className="font-normal text-muted-foreground">
									(if we use your prompt, we'll credit you in the changelog)
								</span>
							</Trans>
						</Label>
						<Input
							id="submit-prompt-name"
							value={submitterName}
							onChange={(e) => setSubmitterName(e.target.value)}
							placeholder={t({
								id: "dashboard.topBar.submitPromptDialog.namePlaceholder",
								message: "Jane Doe",
							})}
							disabled={isSubmitting}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting ? (
							<Trans id="dashboard.topBar.submitPromptDialog.submitting">
								Submitting…
							</Trans>
						) : (
							<Trans id="dashboard.topBar.submitPromptDialog.submit">
								Submit prompt
							</Trans>
						)}
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
