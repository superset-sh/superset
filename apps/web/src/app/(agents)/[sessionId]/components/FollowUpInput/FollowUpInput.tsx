"use client";

import type { PromptInputMessage } from "@superset/ui/ai-elements/prompt-input";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { ArrowUpIcon } from "lucide-react";
import { useCallback } from "react";
import { PlusMenu } from "../../../components/PlusMenu";
import { MAX_FILE_SIZE, MAX_FILES } from "../../../constants";

export function FollowUpInput() {
	const handleSubmit = useCallback((_message: PromptInputMessage) => {
		// TODO: Wire to backend
	}, []);

	return (
		<div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<PromptInput
				onSubmit={handleSubmit}
				className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
				multiple
				maxFiles={MAX_FILES}
				maxFileSize={MAX_FILE_SIZE}
			>
				<PromptInputAttachments>
					{(file) => <PromptInputAttachment key={file.id} data={file} />}
				</PromptInputAttachments>
				<PromptInputTextarea
					placeholder="Add a follow up..."
					className="min-h-10"
				/>
				<PromptInputFooter>
					<PromptInputTools>
						<span className="text-xs text-muted-foreground">
							Claude Sonnet 4.5
						</span>
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu />
						<PromptInputSubmit className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20">
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
