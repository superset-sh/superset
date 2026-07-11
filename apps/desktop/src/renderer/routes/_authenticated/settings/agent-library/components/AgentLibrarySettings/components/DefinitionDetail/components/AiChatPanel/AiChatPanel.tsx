import {
	ChatRuntimeServiceProvider,
	type UseChatDisplayReturn,
	useChatDisplay,
} from "@superset/chat/client";
import type { DefinitionSummary } from "@superset/shared/agent-library";
import { MessageResponse } from "@superset/ui/ai-elements/message";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { createChatRuntimeServiceIpcClient } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/utils/chat-runtime-service-client";

const chatClient = createChatRuntimeServiceIpcClient();

// One persistent chat session per definition for the lifetime of the app —
// reopening the panel reattaches to the same runtime/thread in the Electron
// main process. Not persisted across app restarts (v1 boundary).
const sessionIdsByDefinition = new Map<string, string>();

function getSessionId(definitionKey: string): string {
	let id = sessionIdsByDefinition.get(definitionKey);
	if (!id) {
		id = crypto.randomUUID();
		sessionIdsByDefinition.set(definitionKey, id);
	}
	return id;
}

interface AiChatPanelProps {
	summary: DefinitionSummary;
	/** Scope root directory the agent session runs in (its cwd). */
	scopeRootPath: string;
	/** Called when an agent turn finishes — the file may have changed on disk. */
	onAgentTurnEnd: () => void;
}

export function AiChatPanel(props: AiChatPanelProps) {
	return (
		<ChatRuntimeServiceProvider
			client={chatClient}
			queryClient={electronQueryClient}
		>
			<AiChatPanelInner {...props} />
		</ChatRuntimeServiceProvider>
	);
}

function buildContextPreamble(
	summary: DefinitionSummary,
	scopeRootPath: string,
): string {
	return [
		`You are editing a Claude Code ${summary.kind} definition file.`,
		`File: ${summary.relativePath} (relative to your working directory, ${scopeRootPath}).`,
		summary.kind === "agent"
			? "Frontmatter reference: `model` accepts inherit | sonnet | opus | haiku | fable or a full model id; `effort` accepts low | medium | high | xhigh | max; the markdown body is the agent's instructions."
			: "The frontmatter `description` tells the model when to invoke the skill; the markdown body is the skill's instructions.",
		"When the user asks for changes, apply them by editing that file directly with your edit tools, preserving frontmatter keys you weren't asked to change. You may read sibling definitions or project files for context, but do not modify any other file unless explicitly asked.",
	].join("\n");
}

function AiChatPanelInner({
	summary,
	scopeRootPath,
	onAgentTurnEnd,
}: AiChatPanelProps) {
	const definitionKey = `${summary.scopeKey} ${summary.kind} ${summary.name}`;
	const sessionId = getSessionId(definitionKey);
	const chat = useChatDisplay({ sessionId, cwd: scopeRootPath });

	const [draft, setDraft] = useState("");
	const hasSentRef = useRef(false);
	const wasRunningRef = useRef(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const messages = chat.messages ?? [];
	const isRunning = chat.isRunning === true;

	// The file on disk may change on every completed turn — tell the detail
	// view to reload. (Claude Code sessions elsewhere pick the change up on
	// their own; this is just our own editor staying honest.)
	useEffect(() => {
		if (wasRunningRef.current && !isRunning) onAgentTurnEnd();
		wasRunningRef.current = isRunning;
	}, [isRunning, onAgentTurnEnd]);

	useEffect(() => {
		if (messages.length > 0) hasSentRef.current = true;
	}, [messages.length]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [messages.length, isRunning]);

	const send = () => {
		const content = draft.trim();
		if (!content || isRunning) return;
		const payloadContent = hasSentRef.current
			? content
			: `${buildContextPreamble(summary, scopeRootPath)}\n\n---\n\n${content}`;
		hasSentRef.current = true;
		setDraft("");
		void chat.commands.sendMessage({ payload: { content: payloadContent } });
	};

	const pendingApproval = chat.pendingApproval ?? null;
	const pendingQuestion = chat.pendingQuestion ?? null;

	return (
		<div className="flex flex-col h-full min-h-0">
			<div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
				{messages.length === 0 && !isRunning && (
					<p className="text-xs text-muted-foreground p-2">
						Discuss this {summary.kind} with an AI agent. It can read your other
						definitions for context and edits the file directly — the editor on
						the left reloads when it finishes.
					</p>
				)}
				{messages.map((message) => (
					<ChatMessageBubble key={message.id} message={message} />
				))}
				{isRunning && (
					<p className="text-xs text-muted-foreground animate-pulse px-2">
						Working…
					</p>
				)}
				{chat.error !== null && chat.error !== undefined && (
					<p className="text-xs text-destructive select-text cursor-text px-2">
						{chat.error instanceof Error
							? chat.error.message
							: String(chat.error)}
					</p>
				)}
			</div>

			{pendingApproval !== null && pendingApproval !== undefined && (
				<div className="border-t p-3 space-y-2">
					<p className="text-xs">The agent wants to run a tool.</p>
					<div className="flex gap-2">
						<Button
							size="sm"
							onClick={() =>
								void chat.commands.respondToApproval({
									payload: { decision: "approve" },
								})
							}
						>
							Approve
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								void chat.commands.respondToApproval({
									payload: { decision: "decline" },
								})
							}
						>
							Decline
						</Button>
					</div>
				</div>
			)}

			{pendingQuestion !== null && pendingQuestion !== undefined && (
				<PendingQuestionBar
					pendingQuestion={pendingQuestion}
					onAnswer={(questionId, answer) =>
						void chat.commands.respondToQuestion({
							payload: { questionId, answer },
						})
					}
				/>
			)}

			<div className="border-t p-3 space-y-2">
				<Textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							send();
						}
					}}
					placeholder={`Ask for changes to ${summary.name}…`}
					rows={3}
					className="resize-none"
				/>
				<div className="flex justify-end gap-2">
					{isRunning ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => void chat.commands.stop()}
						>
							<Square className="size-3 mr-1" />
							Stop
						</Button>
					) : (
						<Button size="sm" disabled={!draft.trim()} onClick={send}>
							<Send className="size-3 mr-1" />
							Send
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];

function ChatMessageBubble({ message }: { message: ChatMessage }) {
	const parts = Array.isArray(message.content) ? message.content : [];
	const isUser = message.role === "user";

	return (
		<div
			className={cn(
				"rounded-md text-sm",
				isUser ? "bg-accent/60 p-2.5" : "px-1",
			)}
		>
			<div className="space-y-1.5">
				{parts.map((part, index) => {
					const key = `${message.id}-${index}`;
					if (part.type === "text") {
						const text = stripContextPreamble(part.text, isUser);
						if (!text.trim()) return null;
						return isUser ? (
							<p
								key={key}
								className="whitespace-pre-wrap select-text cursor-text"
							>
								{text}
							</p>
						) : (
							<MessageResponse key={key}>{text}</MessageResponse>
						);
					}
					if (part.type === "tool_call") {
						return (
							<p
								key={key}
								className="text-xs text-muted-foreground font-mono truncate"
								title={part.name}
							>
								⚒ {part.name}
							</p>
						);
					}
					return null;
				})}
			</div>
		</div>
	);
}

/** Hide the injected context preamble from the first user bubble. */
function stripContextPreamble(text: string, isUser: boolean): string {
	if (!isUser) return text;
	if (!text.startsWith("You are editing a Claude Code ")) return text;
	const separatorIndex = text.indexOf("\n\n---\n\n");
	return separatorIndex === -1 ? text : text.slice(separatorIndex + 7);
}

function PendingQuestionBar({
	pendingQuestion,
	onAnswer,
}: {
	pendingQuestion: NonNullable<UseChatDisplayReturn["pendingQuestion"]>;
	onAnswer: (questionId: string, answer: string) => void;
}) {
	const record = pendingQuestion as Record<string, unknown>;
	const questionId =
		typeof record.questionId === "string" ? record.questionId : null;
	const questionText =
		typeof record.question === "string"
			? record.question
			: typeof record.text === "string"
				? record.text
				: "The agent asked a question.";
	const options = Array.isArray(record.options)
		? record.options.filter((option): option is string => {
				return typeof option === "string";
			})
		: [];
	const [custom, setCustom] = useState("");

	if (!questionId) return null;

	return (
		<div className="border-t p-3 space-y-2">
			<p className="text-xs select-text cursor-text">{questionText}</p>
			{options.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{options.map((option) => (
						<Button
							key={option}
							size="sm"
							variant="outline"
							onClick={() => onAnswer(questionId, option)}
						>
							{option}
						</Button>
					))}
				</div>
			)}
			<div className="flex gap-2">
				<Textarea
					value={custom}
					onChange={(event) => setCustom(event.target.value)}
					rows={1}
					placeholder="Answer…"
					className="resize-none"
				/>
				<Button
					size="sm"
					disabled={!custom.trim()}
					onClick={() => onAnswer(questionId, custom.trim())}
				>
					Reply
				</Button>
			</div>
		</div>
	);
}
