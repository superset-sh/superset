import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@superset/ui/ai-elements/message";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { Badge } from "@superset/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { ExploringGroup } from "@superset/ui/ai-elements/exploring-group";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
	type ToolDisplayState,
} from "@superset/ui/ai-elements/tool";
import { ToolCall } from "@superset/ui/ai-elements/tool-call";
import {
	ChevronDownIcon,
	FileIcon,
	FileSearchIcon,
	FolderIcon,
	FolderTreeIcon,
	SearchIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiMiniChatBubbleLeftRight, HiMiniPaperClip } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FileMentionAnchor,
	FileMentionProvider,
	FileMentionTrigger,
} from "./components/FileMentionPopover";
import { ModelPicker } from "./components/ModelPicker";
import { PermissionModePicker } from "./components/PermissionModePicker";
import { SlashCommandInput } from "./components/SlashCommandInput";
import { DEFAULT_MODEL } from "./constants";
import type { SlashCommand } from "./hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "./types";

interface ChatInterfaceProps {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

// --- Token usage tracking ---
interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

// --- Tool approval request ---
interface ToolApprovalRequest {
	runId: string;
	toolCallId: string;
	toolName: string;
	args: unknown;
}

// --- Message part types ---

interface TextPart {
	type: "text";
	text: string;
}

interface ToolCallPart {
	type: "tool-call";
	toolCallId: string;
	toolName: string;
	args: unknown;
	status: "streaming" | "calling" | "done";
	result?: unknown;
	isError?: boolean;
}

interface AgentCallPart {
	type: "agent-call";
	toolCallId: string;
	agentName: string;
	prompt: string;
	status: "running" | "done";
	parts: MessagePart[];
	result?: string;
}

type MessagePart = TextPart | ToolCallPart | AgentCallPart;

interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	parts: MessagePart[];
}

// --- Map our status to the ai-elements ToolDisplayState ---

function toToolDisplayState(part: ToolCallPart): ToolDisplayState {
	if (part.status === "streaming") return "input-streaming";
	if (part.status === "calling") return "input-complete";
	if (part.isError) return "output-error";
	if (part.result != null) return "output-available";
	return "input-available";
}

// --- Helper to safely extract args as Record ---
function getArgs(part: ToolCallPart): Record<string, unknown> {
	if (typeof part.args === "object" && part.args !== null) {
		return part.args as Record<string, unknown>;
	}
	if (typeof part.args === "string") {
		try {
			return JSON.parse(part.args);
		} catch {
			return {};
		}
	}
	return {};
}

function getResult(part: ToolCallPart): Record<string, unknown> {
	if (typeof part.result === "object" && part.result !== null) {
		return part.result as Record<string, unknown>;
	}
	if (typeof part.result === "string") {
		try {
			return JSON.parse(part.result);
		} catch {
			return { text: part.result };
		}
	}
	return {};
}

// --- Workspace tool state mapping ---
type WsToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

function toWsToolState(part: ToolCallPart): WsToolState {
	if (part.status === "streaming") return "input-streaming";
	if (part.status === "calling") return "input-available";
	if (part.isError) return "output-error";
	if (part.result != null) return "output-available";
	return "input-available";
}

// --- Read-only exploration tool (compact inline) ---
function ReadOnlyToolCall({ part }: { part: ToolCallPart }) {
	const args = getArgs(part);
	const isPending = part.status !== "done";

	// Build title + subtitle based on tool type
	let title = "Read file";
	let subtitle = String(args.path ?? args.filePath ?? args.query ?? "");
	let icon = FileIcon;

	switch (part.toolName) {
		case "mastra_workspace_read_file":
			title = isPending ? "Reading" : "Read";
			subtitle = String(args.path ?? args.filePath ?? "");
			icon = FileIcon;
			break;
		case "mastra_workspace_list_files":
			title = isPending ? "Listing files" : "Listed files";
			subtitle = String(args.path ?? args.directory ?? "");
			icon = FolderTreeIcon;
			break;
		case "mastra_workspace_file_stat":
			title = isPending ? "Checking" : "Checked";
			subtitle = String(args.path ?? "");
			icon = FileSearchIcon;
			break;
		case "mastra_workspace_search":
			title = isPending ? "Searching" : "Searched";
			subtitle = String(args.query ?? args.pattern ?? "");
			icon = SearchIcon;
			break;
		case "mastra_workspace_index":
			title = isPending ? "Indexing" : "Indexed";
			icon = SearchIcon;
			break;
		case "mastra_workspace_mkdir":
			title = isPending ? "Creating directory" : "Created directory";
			subtitle = String(args.path ?? "");
			icon = FolderIcon;
			break;
		case "mastra_workspace_delete":
			title = isPending ? "Deleting" : "Deleted";
			subtitle = String(args.path ?? "");
			icon = FileIcon;
			break;
	}

	// Show just the filename for paths
	if (subtitle.includes("/")) {
		subtitle = subtitle.split("/").pop() ?? subtitle;
	}

	return (
		<ToolCall
			icon={icon}
			title={title}
			subtitle={subtitle}
			isPending={isPending}
			isError={!!part.isError}
		/>
	);
}

// --- Workspace-aware ToolCallBlock ---
const READ_ONLY_TOOLS = new Set([
	"mastra_workspace_read_file",
	"mastra_workspace_list_files",
	"mastra_workspace_file_stat",
	"mastra_workspace_search",
	"mastra_workspace_index",
	"mastra_workspace_mkdir",
	"mastra_workspace_delete",
]);

function ToolCallBlock({ part }: { part: ToolCallPart }) {
	const args = getArgs(part);
	const result = getResult(part);
	const state = toWsToolState(part);

	// --- Execute command → BashTool ---
	if (part.toolName === "mastra_workspace_execute_command") {
		const command = String(args.command ?? args.cmd ?? "");
		const stdout = result.stdout != null ? String(result.stdout) : undefined;
		const stderr = result.stderr != null ? String(result.stderr) : undefined;
		const exitCode =
			result.exitCode != null ? Number(result.exitCode) : undefined;
		return (
			<BashTool
				command={command}
				stdout={stdout}
				stderr={stderr}
				exitCode={exitCode}
				state={state}
			/>
		);
	}

	// --- Write file → FileDiffTool (write mode) ---
	if (part.toolName === "mastra_workspace_write_file") {
		const filePath = String(args.path ?? args.filePath ?? "");
		const content = String(args.content ?? args.data ?? "");
		return (
			<FileDiffTool
				filePath={filePath}
				content={content}
				isWriteMode
				state={state}
			/>
		);
	}

	// --- Edit file → FileDiffTool (diff mode) ---
	if (part.toolName === "mastra_workspace_edit_file") {
		const filePath = String(args.path ?? args.filePath ?? "");
		const oldString = String(args.oldString ?? args.old_string ?? "");
		const newString = String(args.newString ?? args.new_string ?? "");
		return (
			<FileDiffTool
				filePath={filePath}
				oldString={oldString}
				newString={newString}
				state={state}
			/>
		);
	}

	// --- Read-only exploration tools → compact ToolCall ---
	if (READ_ONLY_TOOLS.has(part.toolName)) {
		return <ReadOnlyToolCall part={part} />;
	}

	// --- Fallback: generic tool UI ---
	return (
		<Tool>
			<ToolHeader
				title={part.toolName}
				state={toToolDisplayState(part)}
			/>
			<ToolContent>
				{part.args != null && <ToolInput input={part.args} />}
				{(part.result != null || part.isError) && (
					<ToolOutput
						output={part.isError ? undefined : part.result}
						errorText={
							part.isError
								? typeof part.result === "string"
									? part.result
									: JSON.stringify(part.result)
								: undefined
						}
					/>
				)}
			</ToolContent>
		</Tool>
	);
}

function AgentCallBlock({
	part,
	isStreaming,
	renderParts,
}: {
	part: AgentCallPart;
	isStreaming: boolean;
	renderParts: (opts: {
		parts: MessagePart[];
		isLastAssistant: boolean;
	}) => React.ReactNode[];
}) {
	const isRunning = part.status === "running";
	return (
		<Collapsible
			defaultOpen
			className="not-prose my-3 w-full rounded-md border border-border/60 bg-muted/20"
		>
			<CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3">
				<div className="flex items-center gap-2">
					<HiMiniChatBubbleLeftRight className="size-4 text-muted-foreground" />
					<span className="font-medium text-sm capitalize">
						{part.agentName}
					</span>
					<Badge
						className="gap-1.5 rounded-full text-xs"
						variant="secondary"
					>
						{isRunning ? (
							<span className="size-2 animate-pulse rounded-full bg-blue-500" />
						) : (
							<span className="size-2 rounded-full bg-green-500" />
						)}
						{isRunning ? "Running" : "Done"}
					</Badge>
				</div>
				<ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			{part.prompt && (
				<div className="border-t px-3 py-2 text-muted-foreground text-xs italic">
					{part.prompt}
				</div>
			)}
			<CollapsibleContent className="border-t px-3 py-2">
				{part.parts.length > 0 ? (
					renderParts({
						parts: part.parts,
						isLastAssistant: isRunning && isStreaming,
					})
				) : (
					// Fallback for DB-hydrated agent calls: render result as markdown
					part.result && !isRunning && (
						<MessageResponse isAnimating={false}>
							{part.result}
						</MessageResponse>
					)
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

// --- Chunk types from Mastra fullStream ---

interface MastraChunk {
	type: string;
	payload?: {
		text?: string;
		toolCallId?: string;
		toolName?: string;
		args?: unknown;
		argsTextDelta?: string;
		result?: unknown;
		isError?: boolean;
		output?: unknown;
		error?: unknown;
	};
}

export function ChatInterface({
	sessionId,
	cwd,
}: ChatInterfaceProps) {
	const [selectedModel, setSelectedModel] = useState<ModelOption>(DEFAULT_MODEL);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [thinkingEnabled, setThinkingEnabled] = useState(false);
	const [permissionMode, setPermissionMode] =
		useState<PermissionMode>("bypassPermissions");
	const [isStreaming, setIsStreaming] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [error, setError] = useState<string | null>(null);

	// Token usage tracking (accumulated across steps in the current turn)
	const [turnUsage, setTurnUsage] = useState<TokenUsage>({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
	const [sessionUsage, setSessionUsage] = useState<TokenUsage>({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });

	// Tool approval state
	const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);
	const runIdRef = useRef<string | null>(null);

	// Track the active sub-agent call so we can route its chunks into the nested parts
	const activeAgentCallIdRef = useRef<string | null>(null);

	// Load conversation history from Mastra Memory
	const { data: historyMessages } = electronTrpc.aiChat.getMessages.useQuery(
		{ threadId: sessionId },
		{ enabled: !!sessionId },
	);

	useEffect(() => {
		if (!historyMessages || historyMessages.length === 0) return;

		// Debug: log the raw shape from the server to verify toAISdkV5Messages output
		console.log(
			"[hydrate] raw historyMessages sample:",
			JSON.stringify(
				(historyMessages as Array<Record<string, unknown>>).slice(0, 2).map((m) => ({
					id: m.id,
					role: m.role,
					hasTopLevelParts: Array.isArray(m.parts),
					hasContentParts: !!(m as Record<string, unknown>).content &&
						Array.isArray(
							((m as Record<string, unknown>).content as Record<string, unknown>)?.parts,
						),
					partTypes: (
						(m.parts as Array<Record<string, unknown>>) ??
						(((m as Record<string, unknown>).content as Record<string, unknown>)
							?.parts as Array<Record<string, unknown>>) ??
						[]
					).map((p) => ({ type: p.type, toolName: p.toolName })),
				})),
				null,
				2,
			),
		);

		// historyMessages are AI SDK V5 UIMessages (converted via toAISdkV5Messages on the server)
		// Shape: { id, role, parts: [{ type: "text", text } | { type: "tool-invocation", toolInvocationId, toolName, args, result, state }] }
		// Fallback: if parts are nested under content (Mastra DB format), try that too
		const hydrated: ChatMessage[] = (
			historyMessages as Array<{
				id: string;
				role: string;
				parts?: Array<Record<string, unknown>>;
				content?: { parts?: Array<Record<string, unknown>>; content?: unknown };
			}>
		)
			.filter(
				(msg) => msg.role === "user" || msg.role === "assistant",
			)
			.map((msg) => {
				const parts: MessagePart[] = [];

				// Try top-level parts first (AI SDK V5 UIMessage), fall back to content.parts (Mastra DB)
				const rawParts: Array<Record<string, unknown>> =
					msg.parts ?? msg.content?.parts ?? [];

				if (rawParts.length > 0) {
					for (const part of rawParts) {
						const partType = String(part.type ?? "");
						if (partType === "text" && typeof part.text === "string" && part.text) {
							parts.push({ type: "text", text: part.text });
						} else if (
							partType.startsWith("tool-")
						) {
							// AI SDK V5: type is "tool-{toolName}" (e.g. "tool-agent-planner", "tool-read_file")
							//   fields: toolCallId, input (args), output (result), state
							// AI SDK V4 / Mastra DB: type is "tool-invocation", "tool-call", or "tool-result"
							//   fields: toolCallId/toolInvocationId, args, result
							const tName = String(
								part.toolName ??
								(partType !== "tool-invocation" &&
									partType !== "tool-call" &&
									partType !== "tool-result"
									? partType.replace(/^tool-/, "")
									: "unknown"),
							);
							const tCallId = String(
								part.toolCallId ??
								part.toolInvocationId ??
								crypto.randomUUID(),
							);
							// V5 uses "input"/"output", V4/DB uses "args"/"result"
							const toolArgs = part.input ?? part.args;
							const toolResult = part.output ?? part.result;

							if (tName.startsWith("agent-")) {
								const agentName = tName.replace(/^agent-/, "");
								const prompt =
									typeof toolArgs === "object" &&
										toolArgs !== null
										? ((toolArgs as Record<string, unknown>)
											.prompt as string) ?? ""
										: "";
								const resultText =
									typeof toolResult === "object" &&
										toolResult !== null
										? ((toolResult as Record<string, unknown>)
											.text as string) ??
										JSON.stringify(toolResult)
										: String(toolResult ?? "");
								parts.push({
									type: "agent-call",
									toolCallId: tCallId,
									agentName,
									prompt,
									status: "done",
									parts: [],
									result: resultText,
								});
							} else {
								parts.push({
									type: "tool-call",
									toolCallId: tCallId,
									toolName: tName,
									args: toolArgs,
									status: "done",
									result: toolResult,
								});
							}
						}
						// Ignore step-start, reasoning, source, file and other V5 part types
					}
				}

				return {
					id: String(msg.id ?? crypto.randomUUID()),
					role: msg.role as "user" | "assistant",
					parts,
				};
			});

		setMessages(hydrated);
	}, [historyMessages]);

	const triggerAgent = electronTrpc.aiChat.superagent.useMutation({
		onError: (err) => {
			console.error("[chat] Agent trigger failed:", err);
			setIsStreaming(false);
		},
	});

	const abortAgent = electronTrpc.aiChat.abortSuperagent.useMutation();
	const approveToolCallMutation = electronTrpc.aiChat.approveToolCall.useMutation();

	// Helper: update the last assistant message's parts
	const updateLastAssistant = useCallback(
		(updater: (parts: MessagePart[]) => MessagePart[]) => {
			setMessages((prev) => {
				const last = prev[prev.length - 1];
				if (!last || last.role !== "assistant") return prev;
				return [
					...prev.slice(0, -1),
					{ ...last, parts: updater(last.parts) },
				];
			});
		},
		[],
	);

	// Helper: update the active agent-call's nested parts
	const updateActiveAgentParts = useCallback(
		(
			agentCallId: string,
			updater: (parts: MessagePart[]) => MessagePart[],
		) => {
			setMessages((prev) => {
				const last = prev[prev.length - 1];
				if (!last || last.role !== "assistant") return prev;
				return [
					...prev.slice(0, -1),
					{
						...last,
						parts: last.parts.map((part) =>
							part.type === "agent-call" &&
								part.toolCallId === agentCallId
								? { ...part, parts: updater(part.parts) }
								: part,
						),
					},
				];
			});
		},
		[],
	);

	// Subscribe to superagent stream chunks
	electronTrpc.aiChat.superagentStream.useSubscription(
		{ sessionId },
		{
			onData: (event) => {
				if (event.type === "done") {
					console.log("[chat] stream done");
					activeAgentCallIdRef.current = null;
					setIsStreaming(false);
					return;
				}
				if (event.type === "error") {
					console.error("[chat] stream error:", event.error);
					activeAgentCallIdRef.current = null;
					setIsStreaming(false);
					setError(typeof event.error === "string" ? event.error : "An error occurred");
					return;
				}
				if (event.type === "chunk") {
					const chunk = event.chunk as MastraChunk;
					const p = chunk.payload;

					// Extract tool name from various possible locations
					const raw = chunk as unknown as Record<string, unknown>;
					const chunkToolName =
						p?.toolName ?? raw.toolName ?? "unknown";
					const chunkToolCallId =
						p?.toolCallId ?? raw.toolCallId;

					// --- Sub-agent chunk routing ---
					// If a sub-agent is active, route chunks into its nested parts
					const activeId = activeAgentCallIdRef.current;

					// Check if this tool-result closes the active agent call
					if (
						activeId &&
						chunk.type === "tool-result" &&
						String(chunkToolCallId) === activeId
					) {
						// Close the agent call
						activeAgentCallIdRef.current = null;
						const resultText =
							typeof p?.result === "object" && p?.result !== null
								? (p.result as Record<string, unknown>).text ??
								JSON.stringify(p.result)
								: String(p?.result ?? "");
						setMessages((prev) => {
							const last = prev[prev.length - 1];
							if (!last || last.role !== "assistant") return prev;
							return [
								...prev.slice(0, -1),
								{
									...last,
									parts: last.parts.map((part) =>
										part.type === "agent-call" &&
											part.toolCallId === activeId
											? {
												...part,
												status: "done" as const,
												result: String(resultText),
											}
											: part,
									),
								},
							];
						});
						return;
					}

					// If a sub-agent is active, route text/tool chunks into its nested parts
					if (activeId) {
						switch (chunk.type) {
							case "text-delta": {
								if (!p?.text) break;
								updateActiveAgentParts(activeId, (parts) => {
									const lastPart = parts[parts.length - 1];
									if (lastPart?.type === "text") {
										return [
											...parts.slice(0, -1),
											{
												...lastPart,
												text: lastPart.text + p.text,
											},
										];
									}
									return [
										...parts,
										{ type: "text", text: p.text! },
									];
								});
								break;
							}

							case "tool-call": {
								if (!chunkToolCallId) break;
								updateActiveAgentParts(activeId, (parts) => {
									// Update existing entry or add new
									const existing = parts.find(
										(pt) =>
											pt.type === "tool-call" &&
											pt.toolCallId === String(chunkToolCallId),
									);
									if (existing) {
										return parts.map((pt) =>
											pt.type === "tool-call" &&
												pt.toolCallId === String(chunkToolCallId)
												? {
													...pt,
													toolName:
														pt.toolName === "unknown"
															? String(chunkToolName)
															: pt.toolName,
													args: p?.args ?? pt.args,
													status: "calling" as const,
												}
												: pt,
										);
									}
									return [
										...parts,
										{
											type: "tool-call" as const,
											toolCallId: String(chunkToolCallId),
											toolName: String(chunkToolName),
											args: p?.args,
											status: "calling" as const,
										},
									];
								});
								break;
							}

							case "tool-call-input-streaming-start": {
								if (!chunkToolCallId) break;
								updateActiveAgentParts(activeId, (parts) => [
									...parts,
									{
										type: "tool-call" as const,
										toolCallId: String(chunkToolCallId),
										toolName: String(chunkToolName),
										args: "",
										status: "streaming" as const,
									},
								]);
								break;
							}

							case "tool-call-delta": {
								if (!chunkToolCallId || !p?.argsTextDelta) break;
								const delta = p.argsTextDelta;
								updateActiveAgentParts(activeId, (parts) =>
									parts.map((part) =>
										part.type === "tool-call" &&
											part.toolCallId === String(chunkToolCallId)
											? {
												...part,
												args:
													typeof part.args === "string"
														? part.args + delta
														: delta,
											}
											: part,
									),
								);
								break;
							}

							case "tool-call-input-streaming-end": {
								if (!chunkToolCallId) break;
								updateActiveAgentParts(activeId, (parts) =>
									parts.map((part) => {
										if (
											part.type === "tool-call" &&
											part.toolCallId === String(chunkToolCallId)
										) {
											let parsedArgs = part.args;
											if (typeof part.args === "string") {
												try {
													parsedArgs = JSON.parse(part.args);
												} catch {
													// keep as string
												}
											}
											return {
												...part,
												args: parsedArgs,
												status: "calling" as const,
											};
										}
										return part;
									}),
								);
								break;
							}

							case "tool-result": {
								if (!chunkToolCallId) break;
								updateActiveAgentParts(activeId, (parts) =>
									parts.map((part) =>
										part.type === "tool-call" &&
											part.toolCallId ===
											String(chunkToolCallId)
											? {
												...part,
												result: p?.result,
												isError: p?.isError,
												status: "done" as const,
											}
											: part,
									),
								);
								break;
							}

							case "tool-output": {
								if (!chunkToolCallId) break;
								updateActiveAgentParts(activeId, (parts) =>
									parts.map((part) =>
										part.type === "tool-call" &&
											part.toolCallId ===
											String(chunkToolCallId)
											? {
												...part,
												result:
													p?.output ??
													(
														raw as Record<
															string,
															unknown
														>
													).output,
											}
											: part,
									),
								);
								break;
							}

							case "tool-error": {
								if (!chunkToolCallId) break;
								updateActiveAgentParts(activeId, (parts) =>
									parts.map((part) =>
										part.type === "tool-call" &&
											part.toolCallId === String(chunkToolCallId)
											? {
												...part,
												result: p?.error ?? "Tool execution failed",
												isError: true,
												status: "done" as const,
											}
											: part,
									),
								);
								break;
							}

							default:
								// Ignore other chunk types inside agent call (finish, step-start, etc.)
								break;
						}
						return;
					}

					// --- Top-level chunk routing ---
					switch (chunk.type) {
						case "text-delta": {
							if (!p?.text) break;
							updateLastAssistant((parts) => {
								const lastPart = parts[parts.length - 1];
								if (lastPart?.type === "text") {
									return [
										...parts.slice(0, -1),
										{ ...lastPart, text: lastPart.text + p.text },
									];
								}
								return [...parts, { type: "text", text: p.text! }];
							});
							break;
						}

						case "tool-call": {
							if (!chunkToolCallId) break;

							// Check if this is a sub-agent call
							if (
								String(chunkToolName).startsWith("agent-")
							) {
								const agentName = String(chunkToolName).replace(
									/^agent-/,
									"",
								);
								const prompt =
									typeof p?.args === "object" &&
										p?.args !== null
										? ((p.args as Record<string, unknown>)
											.prompt as string) ?? ""
										: "";
								activeAgentCallIdRef.current =
									String(chunkToolCallId);
								updateLastAssistant((parts) => [
									// Filter out any stale ToolCallPart created by
									// tool-call-input-streaming-start before we knew the name
									...parts.filter(
										(pt) =>
											!(
												pt.type === "tool-call" &&
												pt.toolCallId ===
												String(chunkToolCallId)
											),
									),
									{
										type: "agent-call" as const,
										toolCallId: String(chunkToolCallId),
										agentName,
										prompt,
										status: "running" as const,
										parts: [],
									},
								]);
								break;
							}

							// Regular tool call
							updateLastAssistant((parts) => {
								const existing = parts.find(
									(pt) =>
										pt.type === "tool-call" &&
										pt.toolCallId === chunkToolCallId,
								);
								if (existing) {
									return parts.map((pt) =>
										pt.type === "tool-call" &&
											pt.toolCallId === chunkToolCallId
											? {
												...pt,
												toolName:
													pt.toolName === "unknown"
														? String(chunkToolName)
														: pt.toolName,
												args: p?.args ?? pt.args,
												status: "calling" as const,
											}
											: pt,
									);
								}
								return [
									...parts,
									{
										type: "tool-call" as const,
										toolCallId: String(chunkToolCallId),
										toolName: String(chunkToolName),
										args: p?.args,
										status: "calling" as const,
									},
								];
							});
							break;
						}

						case "tool-call-input-streaming-start": {
							if (!chunkToolCallId) break;
							// Skip creating a ToolCallPart for sub-agent tools;
							// the tool-call chunk will create an AgentCallPart instead
							if (String(chunkToolName).startsWith("agent-")) break;
							updateLastAssistant((parts) => [
								...parts,
								{
									type: "tool-call" as const,
									toolCallId: String(chunkToolCallId),
									toolName: String(chunkToolName),
									args: "",
									status: "streaming" as const,
								},
							]);
							break;
						}

						case "tool-call-delta": {
							if (!chunkToolCallId || !p?.argsTextDelta) break;
							// Skip arg streaming for sub-agent tools
							if (String(chunkToolName).startsWith("agent-")) break;
							const delta = p.argsTextDelta;
							updateLastAssistant((parts) =>
								parts.map((part) =>
									part.type === "tool-call" &&
										part.toolCallId === chunkToolCallId
										? {
											...part,
											args:
												typeof part.args === "string"
													? part.args + delta
													: delta,
										}
										: part,
								),
							);
							break;
						}

						case "tool-call-input-streaming-end": {
							if (!chunkToolCallId) break;
							// Skip for sub-agent tools
							if (String(chunkToolName).startsWith("agent-")) break;
							updateLastAssistant((parts) =>
								parts.map((part) => {
									if (
										part.type === "tool-call" &&
										part.toolCallId === chunkToolCallId
									) {
										let parsedArgs = part.args;
										if (typeof part.args === "string") {
											try {
												parsedArgs = JSON.parse(part.args);
											} catch {
												// keep as string
											}
										}
										return {
											...part,
											args: parsedArgs,
											status: "calling" as const,
										};
									}
									return part;
								}),
							);
							break;
						}

						case "tool-result": {
							if (!chunkToolCallId) break;
							updateLastAssistant((parts) =>
								parts.map((part) =>
									part.type === "tool-call" &&
										part.toolCallId === chunkToolCallId
										? {
											...part,
											result: p?.result,
											isError: p?.isError,
											status: "done" as const,
										}
										: part,
								),
							);
							break;
						}

						case "tool-output": {
							if (!chunkToolCallId) break;
							updateLastAssistant((parts) =>
								parts.map((part) =>
									part.type === "tool-call" &&
										part.toolCallId === chunkToolCallId
										? {
											...part,
											result: p?.output ?? (raw as Record<string, unknown>).output,
										}
										: part,
								),
							);
							break;
						}

						case "tool-error": {
							if (!chunkToolCallId) break;
							updateLastAssistant((parts) =>
								parts.map((part) =>
									part.type === "tool-call" &&
										part.toolCallId === chunkToolCallId
										? {
											...part,
											result: p?.error ?? "Tool execution failed",
											isError: true,
											status: "done" as const,
										}
										: part,
								),
							);
							break;
						}

						// --- Custom chunk types ---
						case "usage": {
							const usage = p as unknown as { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
							if (usage) {
								setTurnUsage((prev) => ({
									promptTokens: prev.promptTokens + (usage.promptTokens ?? 0),
									completionTokens: prev.completionTokens + (usage.completionTokens ?? 0),
									totalTokens: prev.totalTokens + (usage.totalTokens ?? 0),
								}));
								setSessionUsage((prev) => ({
									promptTokens: prev.promptTokens + (usage.promptTokens ?? 0),
									completionTokens: prev.completionTokens + (usage.completionTokens ?? 0),
									totalTokens: prev.totalTokens + (usage.totalTokens ?? 0),
								}));
							}
							break;
						}

						case "run-id": {
							const rid = p as unknown as { runId?: string } | undefined;
							if (rid?.runId) {
								runIdRef.current = rid.runId;
							}
							break;
						}

						case "tool-call-approval": {
							// Mastra emits this when a tool requires approval.
							// The chunk structure may vary — check payload and top-level fields.
							console.log("[chat] tool-call-approval chunk:", JSON.stringify(chunk).slice(0, 500));
							const approvalData = {
								toolCallId: String(p?.toolCallId ?? raw.toolCallId ?? chunkToolCallId ?? ""),
								toolName: String(p?.toolName ?? raw.toolName ?? chunkToolName ?? "unknown"),
								args: p?.args ?? raw.args,
							};
							if (runIdRef.current) {
								setPendingApproval({
									runId: runIdRef.current,
									toolCallId: approvalData.toolCallId,
									toolName: approvalData.toolName,
									args: approvalData.args,
								});
							} else {
								console.warn("[chat] tool-call-approval received but no runId available");
							}
							break;
						}

						default:
							break;
					}
				}
			},
			onError: (err) => {
				console.error("[chat] Subscription error:", err);
			},
		},
	);

	const handleSend = useCallback(
		(message: { text: string }) => {
			const text = message.text.trim();
			if (!text) return;

			setError(null);
			setTurnUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
			setPendingApproval(null);
			runIdRef.current = null;

			setMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					role: "user",
					parts: [{ type: "text", text }],
				},
				{
					id: crypto.randomUUID(),
					role: "assistant",
					parts: [],
				},
			]);

			activeAgentCallIdRef.current = null;
			setIsStreaming(true);
			triggerAgent.mutate({
				sessionId,
				text,
				modelId: selectedModel.id,
				cwd,
				permissionMode,
			});
		},
		[triggerAgent, sessionId, selectedModel.id, cwd, permissionMode],
	);

	const handleModelSelect = useCallback((model: ModelOption) => {
		setSelectedModel(model);
	}, []);

	const handlePermissionModeSelect = useCallback((mode: PermissionMode) => {
		setPermissionMode(mode);
	}, []);

	const handleStop = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			abortAgent.mutate({ sessionId });
			setIsStreaming(false);
		},
		[abortAgent, sessionId],
	);

	const handleApprove = useCallback(() => {
		if (!pendingApproval) return;
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: true,
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleDecline = useCallback(() => {
		if (!pendingApproval) return;
		approveToolCallMutation.mutate({
			sessionId,
			runId: pendingApproval.runId,
			approved: false,
		});
		setPendingApproval(null);
	}, [pendingApproval, approveToolCallMutation, sessionId]);

	const handleSlashCommandSend = useCallback(
		(command: SlashCommand) => {
			handleSend({ text: `/${command.name}` });
		},
		[handleSend],
	);

	const renderMessageParts = ({
		parts,
		isLastAssistant,
	}: {
		parts: MessagePart[];
		isLastAssistant: boolean;
	}): React.ReactNode[] => {
		const nodes: React.ReactNode[] = [];
		let i = 0;

		while (i < parts.length) {
			const part = parts[i];

			if (part.type === "text") {
				nodes.push(
					<MessageResponse
						key={i}
						isAnimating={isLastAssistant && isStreaming}
					>
						{part.text}
					</MessageResponse>,
				);
				i++;
				continue;
			}

			if (part.type === "agent-call") {
				nodes.push(
					<AgentCallBlock
						key={part.toolCallId}
						part={part}
						isStreaming={isStreaming}
						renderParts={renderMessageParts}
					/>,
				);
				i++;
				continue;
			}

			if (part.type === "tool-call") {
				// Group consecutive read-only tools into ExploringGroup
				if (READ_ONLY_TOOLS.has(part.toolName)) {
					const groupStart = i;
					const groupParts: ToolCallPart[] = [];
					while (
						i < parts.length &&
						parts[i].type === "tool-call" &&
						READ_ONLY_TOOLS.has((parts[i] as ToolCallPart).toolName)
					) {
						groupParts.push(parts[i] as ToolCallPart);
						i++;
					}

					// Single read-only tool: render inline without group wrapper
					if (groupParts.length === 1) {
						nodes.push(
							<ReadOnlyToolCall
								key={groupParts[0].toolCallId}
								part={groupParts[0]}
							/>,
						);
						continue;
					}

					// Multiple consecutive read-only tools: group them
					const anyPending = groupParts.some(
						(p) => p.status !== "done",
					);
					const exploringItems = groupParts.map((p) => {
						const args = getArgs(p);
						let title = "Read";
						let subtitle = "";
						let icon = FileIcon;
						switch (p.toolName) {
							case "mastra_workspace_read_file":
								title = p.status !== "done" ? "Reading" : "Read";
								subtitle = String(args.path ?? args.filePath ?? "");
								icon = FileIcon;
								break;
							case "mastra_workspace_list_files":
								title = p.status !== "done" ? "Listing" : "Listed";
								subtitle = String(args.path ?? args.directory ?? "");
								icon = FolderTreeIcon;
								break;
							case "mastra_workspace_file_stat":
								title = p.status !== "done" ? "Checking" : "Checked";
								subtitle = String(args.path ?? "");
								icon = FileSearchIcon;
								break;
							case "mastra_workspace_search":
								title = p.status !== "done" ? "Searching" : "Searched";
								subtitle = String(args.query ?? args.pattern ?? "");
								icon = SearchIcon;
								break;
							case "mastra_workspace_index":
								title = p.status !== "done" ? "Indexing" : "Indexed";
								icon = SearchIcon;
								break;
							default:
								title = p.toolName.replace("mastra_workspace_", "");
								icon = FileIcon;
								break;
						}
						// Show just filename for long paths
						if (subtitle.includes("/")) {
							subtitle = subtitle.split("/").pop() ?? subtitle;
						}
						return {
							icon,
							title,
							subtitle,
							isPending: p.status !== "done",
							isError: !!p.isError,
						};
					});

					nodes.push(
						<ExploringGroup
							key={`explore-${groupStart}`}
							items={exploringItems}
							isStreaming={anyPending && isLastAssistant && isStreaming}
						/>,
					);
					continue;
				}

				// Non-read-only tool: render as BashTool/FileDiffTool/generic
				nodes.push(
					<ToolCallBlock key={part.toolCallId} part={part} />,
				);
				i++;
				continue;
			}

			// Unknown part type
			i++;
		}

		return nodes;
	};

	return (
		<div className="flex h-full flex-col bg-background">
			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
					{messages.length === 0 ? (
						<ConversationEmptyState
							title="Start a conversation"
							description="Ask anything to get started"
							icon={<HiMiniChatBubbleLeftRight className="size-8" />}
						/>
					) : (
						messages.map((msg, index) => {
							const isLastAssistant =
								msg.role === "assistant" &&
								index === messages.length - 1;

							if (msg.role === "user") {
								return (
									<div key={msg.id} className="flex justify-end">
										<div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
											{msg.parts.map((part, i) =>
												part.type === "text" ? (
													<span key={i}>{part.text}</span>
												) : null,
											)}
										</div>
									</div>
								);
							}

							return (
								<Message key={msg.id} from={msg.role}>
									<MessageContent>
										{isLastAssistant &&
											isStreaming &&
											msg.parts.length === 0 ? (
											<Shimmer
												className="text-sm text-muted-foreground"
												duration={1}
											>
												Thinking...
											</Shimmer>
										) : (
											renderMessageParts({
												parts: msg.parts,
												isLastAssistant,
											})
										)}
									</MessageContent>
								</Message>
							);
						})
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			{/* --- Tool Approval Dialog --- */}
			{pendingApproval && (
				<div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
					<div className="mx-auto w-full max-w-3xl space-y-2">
						<div className="flex items-center gap-3">
							<div className="flex-1">
								<p className="text-sm font-medium text-amber-600 dark:text-amber-400">
									Tool approval required
								</p>
								<p className="text-xs text-muted-foreground">
									<span className="font-mono">{pendingApproval.toolName.replace("mastra_workspace_", "")}</span>
									{" wants to execute"}
								</p>
							</div>
							<button
								type="button"
								onClick={handleDecline}
								className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
							>
								Decline
							</button>
							<button
								type="button"
								onClick={handleApprove}
								className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
							>
								Approve
							</button>
						</div>
						{pendingApproval.args != null && (
							<pre className="max-h-32 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
								{typeof pendingApproval.args === "string"
									? pendingApproval.args
									: JSON.stringify(pendingApproval.args, null, 2) as string}
							</pre>
						)}
					</div>
				</div>
			)}

			<div className="border-t bg-background px-4 py-3">
				<div className="mx-auto w-full max-w-3xl">
					{error && (
						<div className="select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive mb-3">
							{error}
						</div>
					)}
					<PromptInputProvider>
						<FileMentionProvider cwd={cwd}>
							<SlashCommandInput
								onCommandSend={handleSlashCommandSend}
								cwd={cwd}
							>
								<FileMentionAnchor>
									<PromptInput onSubmit={handleSend}>
										<PromptInputTextarea placeholder="Ask anything..." />
										<PromptInputFooter>
											<PromptInputTools>
												<PromptInputButton>
													<HiMiniPaperClip className="size-4" />
												</PromptInputButton>
												<FileMentionTrigger />
												<ThinkingToggle
													enabled={thinkingEnabled}
													onToggle={setThinkingEnabled}
												/>
												<ModelPicker
													selectedModel={selectedModel}
													onSelectModel={handleModelSelect}
													open={modelSelectorOpen}
													onOpenChange={setModelSelectorOpen}
												/>
												<PermissionModePicker
													selectedMode={permissionMode}
													onSelectMode={handlePermissionModeSelect}
												/>
											</PromptInputTools>
											<div className="flex items-center gap-2">
												{/* Token usage indicator */}
												{sessionUsage.totalTokens > 0 && (
													<span className="text-[10px] tabular-nums text-muted-foreground" title={`Turn: ${turnUsage.totalTokens.toLocaleString()} tokens | Session: ${sessionUsage.totalTokens.toLocaleString()} tokens`}>
														{turnUsage.totalTokens > 0 && isStreaming
															? `${turnUsage.totalTokens.toLocaleString()} tok`
															: `${sessionUsage.totalTokens.toLocaleString()} tok`}
													</span>
												)}
												<PromptInputSubmit
													status={isStreaming ? "streaming" : undefined}
													onClick={isStreaming ? handleStop : undefined}
												/>
											</div>
										</PromptInputFooter>
									</PromptInput>
								</FileMentionAnchor>
							</SlashCommandInput>
						</FileMentionProvider>
					</PromptInputProvider>
				</div>
			</div>
		</div>
	);
}
