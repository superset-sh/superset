import type { AppRouter } from "@superset/host-service";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";
import { ReasoningBlock } from "renderer/components/Chat/ChatInterface/components/ReasoningBlock";
import { SessionSelector } from "./components/SessionSelector";
import { useWorkspaceChat } from "./hooks/useWorkspaceChat";

type HostServiceOutputs = inferRouterOutputs<AppRouter>;
type WorkspaceChatMessage = HostServiceOutputs["chat"]["listMessages"][number];

function MessageContent({
	message,
}: {
	message: WorkspaceChatMessage;
}) {
	return (
		<div className="space-y-3">
			{message.content.map((part, index) => {
				if (part.type === "text") {
					return (
						<div
							key={`${message.id}-${index}`}
							className="whitespace-pre-wrap break-words text-sm"
						>
							{part.text}
						</div>
					);
				}

				if (part.type === "thinking") {
					return (
						<ReasoningBlock
							key={`${message.id}-${index}`}
							reasoning={part.thinking}
						/>
					);
				}

				const rawPart = part as {
					type?: string;
					filename?: string;
					mediaType?: string;
					data?: string;
				};

				if (part.type === "image") {
					return (
						<img
							key={`${message.id}-${index}`}
							alt="Generated"
							className="max-h-72 rounded-lg border"
							src={`data:${part.mimeType};base64,${part.data}`}
						/>
					);
				}

				if (rawPart.type === "file") {
					return (
						<div
							key={`${message.id}-${index}`}
							className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
						>
							{rawPart.filename ?? "Attachment"}
						</div>
					);
				}

				return (
					<pre
						key={`${message.id}-${index}`}
						className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
					>
						{JSON.stringify(part, null, 2)}
					</pre>
				);
			})}
		</div>
	);
}

function PendingQuestion({
	question,
	onRespond,
}: {
	question: NonNullable<
		HostServiceOutputs["chat"]["getDisplayState"]["pendingQuestion"]
	>;
	onRespond: (questionId: string, answer: string) => Promise<void>;
}) {
	const optionLabels = useMemo(
		() => (question.options ?? []).map((option) => option.label),
		[question.options],
	);

	return (
		<div className="rounded-lg border border-border bg-muted/30 p-4">
			<p className="mb-3 text-sm font-medium">{question.question}</p>
			<div className="flex gap-2">
				{optionLabels.map((label) => (
					<Button
						key={label}
						size="sm"
						variant="outline"
						onClick={() => void onRespond(question.questionId, label)}
					>
						{label}
					</Button>
				))}
			</div>
		</div>
	);
}

export function WorkspaceChat({
	workspaceId,
	workspaceName,
}: {
	workspaceId: string;
	workspaceName: string;
}) {
	const [input, setInput] = useState("");
	const chat = useWorkspaceChat({ workspaceId });
	const currentAssistantMessage =
		chat.displayState?.currentMessage?.role === "assistant"
			? (chat.displayState.currentMessage as WorkspaceChatMessage)
			: null;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
				<div className="min-w-0 flex-1">
					<SessionSelector
						currentSessionId={chat.sessionId}
						sessions={chat.sessionItems}
						fallbackTitle={workspaceName}
						isSessionInitializing={chat.isSessionInitializing}
						onSelectSession={chat.setSessionId}
						onNewChat={chat.handleNewChat}
						onDeleteSession={chat.handleDeleteSession}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Select
						onValueChange={chat.setSelectedModelId}
						value={chat.selectedModel?.id ?? ""}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Model" />
						</SelectTrigger>
						<SelectContent>
							{chat.availableModels.map((model) => (
								<SelectItem key={model.id} value={model.id}>
									{model.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{chat.isRunning ? (
						<Button variant="outline" onClick={() => void chat.handleStop()}>
							Stop
						</Button>
					) : null}
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 py-6">
					{chat.errorMessage ? (
						<div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
							{chat.errorMessage}
						</div>
					) : null}

					{chat.isConversationLoading && chat.messages.length === 0 ? (
						<div className="text-sm text-muted-foreground">Loading chat…</div>
					) : null}

					{chat.messages.map((message) => (
						<div
							key={message.id}
							className={
								message.role === "user"
									? "ml-auto w-full max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground"
									: "w-full max-w-[85%] rounded-2xl border border-border bg-background px-4 py-3"
							}
						>
							<MessageContent message={message} />
						</div>
					))}

					{currentAssistantMessage ? (
						<div className="w-full max-w-[85%] rounded-2xl border border-border bg-background px-4 py-3">
							<MessageContent message={currentAssistantMessage} />
						</div>
					) : null}

					{chat.displayState?.pendingQuestion ? (
						<PendingQuestion
							question={chat.displayState.pendingQuestion}
							onRespond={chat.handleQuestionResponse}
						/>
					) : null}

					{chat.displayState?.pendingApproval ? (
						<div className="rounded-lg border border-border bg-muted/30 p-4">
							<p className="mb-3 text-sm font-medium">
								Tool approval required
							</p>
							<div className="flex gap-2">
								<Button
									size="sm"
									onClick={() => void chat.handleApprovalResponse("approve")}
								>
									Approve
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void chat.handleApprovalResponse("decline")}
								>
									Decline
								</Button>
							</div>
						</div>
					) : null}

					{chat.displayState?.pendingPlanApproval ? (
						<div className="rounded-lg border border-border bg-muted/30 p-4">
							<p className="mb-3 text-sm font-medium">
								Plan approval required
							</p>
							<pre className="mb-3 overflow-x-auto text-xs text-muted-foreground">
								{JSON.stringify(chat.displayState.pendingPlanApproval, null, 2)}
							</pre>
							<div className="flex gap-2">
								<Button
									size="sm"
									onClick={() =>
										void chat.handlePlanResponse({ action: "approved" })
									}
								>
									Approve
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										void chat.handlePlanResponse({ action: "rejected" })
									}
								>
									Reject
								</Button>
							</div>
						</div>
					) : null}

					{!chat.isConversationLoading &&
					chat.messages.length === 0 &&
					!currentAssistantMessage ? (
						<div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
							Start a conversation for this workspace.
						</div>
					) : null}
				</div>
			</ScrollArea>

			<div className="border-t border-border px-4 py-4">
				<div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
					<Textarea
						className="min-h-28"
						onChange={(event) => setInput(event.target.value)}
						placeholder="Ask to make changes in this workspace"
						value={input}
					/>
					<div className="flex justify-end gap-2">
						<Button
							disabled={chat.isSubmitting || input.trim().length === 0}
							onClick={() =>
								void chat.handleSendMessage(input).then(() => setInput(""))
							}
						>
							Send
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
