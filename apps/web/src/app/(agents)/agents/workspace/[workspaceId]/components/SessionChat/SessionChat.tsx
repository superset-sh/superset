"use client";

import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import type { MockDiffFile, MockMessage } from "../../../../../mock-data";

type SessionChatProps = {
	diffFiles: MockDiffFile[];
	messages: MockMessage[];
};

export function SessionChat({ diffFiles, messages }: SessionChatProps) {
	return (
		<Conversation className="h-full">
			<ConversationContent className="gap-6 px-4 py-4">
				{messages.map((msg, index) => (
					<div key={msg.id} className="flex flex-col gap-3">
						{msg.role === "assistant" && index > 0 && (
							<p className="text-xs text-muted-foreground">Worked for 39s</p>
						)}
						<Message from={msg.role}>
							<MessageContent>
								{msg.role === "assistant" ? (
									<MessageResponse isAnimating={false}>
										{msg.content}
									</MessageResponse>
								) : (
									<p>{msg.content}</p>
								)}
							</MessageContent>
						</Message>
						{msg.role === "assistant" && index === messages.length - 1 && (
							<div className="flex flex-col gap-1">
								{diffFiles.map((file) => (
									<FileDiffTool
										key={file.filePath}
										filePath={file.filePath}
										oldString={file.oldString}
										newString={file.newString}
										state="output-available"
									/>
								))}
							</div>
						)}
					</div>
				))}
			</ConversationContent>
			<ConversationScrollButton />
		</Conversation>
	);
}
