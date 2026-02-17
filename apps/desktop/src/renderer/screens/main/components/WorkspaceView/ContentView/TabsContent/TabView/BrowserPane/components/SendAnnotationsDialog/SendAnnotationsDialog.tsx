import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { AgentType } from "lib/trpc/routers/annotation/utils/formatAnnotationPrompt";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

interface SendAnnotationsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	annotationData: {
		annotations: unknown[];
		output: string;
		pageUrl: string;
	} | null;
	workspaceId: string;
	agent: AgentType;
	onAgentChange: (agent: AgentType) => void;
}

export function SendAnnotationsDialog({
	open,
	onOpenChange,
	annotationData,
	workspaceId,
	agent,
	onAgentChange,
}: SendAnnotationsDialogProps) {
	const [additionalContext, setAdditionalContext] = useState("");
	const [isPending, setIsPending] = useState(false);

	const addTab = useTabsStore((s) => s.addTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);

	const { mutateAsync: formatPrompt } =
		electronTrpc.annotation.formatPrompt.useMutation();

	const handleSend = useCallback(async () => {
		if (!annotationData) return;

		setIsPending(true);
		try {
			const { command } = await formatPrompt({
				output: annotationData.output,
				pageUrl: annotationData.pageUrl,
				additionalContext: additionalContext.trim() || undefined,
				agent,
			});

			const { tabId: newTabId } = addTab(workspaceId, {
				initialCommands: [command],
			});
			setActiveTab(workspaceId, newTabId);

			onOpenChange(false);
			setAdditionalContext("");
		} finally {
			setIsPending(false);
		}
	}, [
		annotationData,
		additionalContext,
		workspaceId,
		agent,
		addTab,
		setActiveTab,
		formatPrompt,
		onOpenChange,
	]);

	const annotationCount = annotationData?.annotations.length ?? 0;
	const agentLabel = agent === "claude" ? "Claude Code" : "Codex";

	return (
		<Dialog
			modal
			open={open}
			onOpenChange={(o) => {
				if (!o && !isPending) onOpenChange(false);
			}}
		>
			<DialogContent
				className="sm:max-w-[480px] gap-0 p-0 flex flex-col"
				onEscapeKeyDown={(e) => {
					if (isPending) e.preventDefault();
				}}
				onPointerDownOutside={(e) => {
					if (isPending) e.preventDefault();
				}}
			>
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle className="text-base">
						Send Annotations to Agent
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						{annotationCount} annotation
						{annotationCount !== 1 ? "s" : ""} from{" "}
						{annotationData?.pageUrl
							? new URL(annotationData.pageUrl).pathname
							: "page"}
					</DialogDescription>
				</DialogHeader>

				<div className="px-4 pb-3 space-y-3">
					<div>
						<label
							htmlFor="agent-selector"
							className="text-xs font-medium text-muted-foreground mb-1.5 block"
						>
							Agent
						</label>
						<div className="flex gap-2" id="agent-selector">
							<button
								type="button"
								onClick={() => onAgentChange("claude")}
								className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
									agent === "claude"
										? "border-primary bg-primary/10 text-primary"
										: "border-input text-muted-foreground hover:text-foreground hover:border-foreground/30"
								}`}
							>
								Claude Code
							</button>
							<button
								type="button"
								onClick={() => onAgentChange("codex")}
								className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
									agent === "codex"
										? "border-primary bg-primary/10 text-primary"
										: "border-input text-muted-foreground hover:text-foreground hover:border-foreground/30"
								}`}
							>
								Codex
							</button>
						</div>
					</div>

					<div>
						<label
							htmlFor="additional-context"
							className="text-xs font-medium text-muted-foreground mb-1 block"
						>
							Additional context (optional)
						</label>
						<textarea
							id="additional-context"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
							rows={3}
							placeholder="Add any additional instructions or context..."
							value={additionalContext}
							onChange={(e) => setAdditionalContext(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter className="px-4 pb-4 pt-0">
					<Button
						onClick={handleSend}
						disabled={isPending || !annotationData}
						className="w-full"
					>
						{isPending ? "Sending..." : `Send to ${agentLabel}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
