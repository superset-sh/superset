import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
import {
	Confirmation,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRequest,
	ConfirmationTitle,
} from "@superset/ui/ai-elements/confirmation";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Loader } from "@superset/ui/ai-elements/loader";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import {
	Plan,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
} from "@superset/ui/ai-elements/plan";
import {
	PromptInput,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@superset/ui/ai-elements/reasoning";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import { useCallback, useState } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";

type MessageRole = "user" | "assistant" | "system";

interface ToolCall {
	id: string;
	name: string;
	state: "input-available" | "output-available" | "output-error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
	approval?: {
		id: string;
		approved?: boolean;
		reason?: string;
	};
}

interface PlanData {
	title: string;
	description: string;
	steps: Array<{ label: string; done: boolean }>;
}

interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	reasoning?: string;
	toolCalls?: ToolCall[];
	plan?: PlanData;
	codeBlock?: { code: string; language: string };
}

const MOCK_MESSAGES: ChatMessage[] = [
	{
		id: "1",
		role: "user",
		content: "Can you help me fix the authentication bug in the login flow?",
	},
	{
		id: "2",
		role: "assistant",
		content: "",
		plan: {
			title: "Fix authentication bug",
			description:
				"I'll investigate the login flow and fix the token validation issue.",
			steps: [
				{ label: "Search for auth-related files", done: true },
				{ label: "Identify the bug in validateCredentials", done: true },
				{ label: "Apply the fix", done: false },
			],
		},
	},
	{
		id: "3",
		role: "assistant",
		content:
			"I'll take a look at the authentication flow. Let me search for the relevant files first.",
		reasoning:
			"The user wants help with an authentication bug. I should look at the login-related files to understand the current implementation before suggesting fixes.",
		toolCalls: [
			{
				id: "tc-1",
				name: "bash",
				state: "output-available",
				input: { command: 'grep -r "login" src/auth/ --include="*.ts"' },
				output:
					"src/auth/login.ts:export async function login(credentials: Credentials) {\nsrc/auth/login.ts:  const token = await validateCredentials(credentials);\nsrc/auth/session.ts:  if (!session.isValid()) { return redirect('/login'); }",
			},
			{
				id: "tc-2",
				name: "edit",
				state: "output-available",
				input: {
					file: "src/auth/login.ts",
					operation: "replace",
				},
				output: "File updated successfully",
				approval: {
					id: "approval-1",
					approved: true,
				},
			},
		],
	},
	{
		id: "4",
		role: "assistant",
		content:
			"I found the issue. The `validateCredentials` function doesn't handle the case where the token has expired. Here's the fix:",
		codeBlock: {
			language: "typescript",
			code: `export async function login(credentials: Credentials) {
  const token = await validateCredentials(credentials);
  if (!token || isTokenExpired(token)) {
    throw new AuthError('Invalid or expired credentials');
  }
  return createSession(token);
}`,
		},
	},
	{
		id: "5",
		role: "assistant",
		content:
			"Now I need to install a dependency. Allow me to run this command?",
		toolCalls: [
			{
				id: "tc-3",
				name: "bash",
				state: "output-available",
				input: { command: "bun add jose" },
				output: undefined,
				approval: {
					id: "approval-2",
				},
			},
		],
	},
];

const SUGGESTIONS = [
	"Fix the login bug",
	"Write tests for auth",
	"Refactor the session manager",
	"Add rate limiting to API",
];

export function ChatInterface() {
	const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
	const [isLoading, setIsLoading] = useState(false);

	const handleSend = useCallback((message: { text: string }) => {
		if (!message.text.trim()) return;

		const userMessage: ChatMessage = {
			id: `msg-${Date.now()}`,
			role: "user",
			content: message.text,
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);

		// Simulate assistant response
		setTimeout(() => {
			const assistantMessage: ChatMessage = {
				id: `msg-${Date.now()}-reply`,
				role: "assistant",
				content:
					"This is a mock response. The chat backend is not connected yet.",
			};
			setMessages((prev) => [...prev, assistantMessage]);
			setIsLoading(false);
		}, 1000);
	}, []);

	const handleSuggestion = useCallback(
		(suggestion: string) => {
			handleSend({ text: suggestion });
		},
		[handleSend],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			<Conversation className="flex-1">
				<ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
					{messages.length === 0 ? (
						<>
							<ConversationEmptyState
								title="Start a conversation"
								description="Ask anything to get started"
								icon={
									<HiMiniChatBubbleLeftRight className="size-8" />
								}
							/>
							<Suggestions className="justify-center">
								{SUGGESTIONS.map((s) => (
									<Suggestion
										key={s}
										suggestion={s}
										onClick={handleSuggestion}
									/>
								))}
							</Suggestions>
						</>
					) : (
						messages.map((msg) => (
							<ChatMessageItem key={msg.id} message={msg} />
						))
					)}
					{isLoading && (
						<Message from="assistant">
							<MessageContent>
								<div className="flex items-center gap-2 text-muted-foreground text-sm">
									<Loader size={14} />
									<span>Thinking...</span>
								</div>
							</MessageContent>
						</Message>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="border-t bg-background px-4 py-3">
				<div className="mx-auto w-full max-w-3xl">
					{messages.length > 0 && (
						<Suggestions className="mb-3">
							{SUGGESTIONS.map((s) => (
								<Suggestion
									key={s}
									suggestion={s}
									onClick={handleSuggestion}
								/>
							))}
						</Suggestions>
					)}
					<PromptInput onSubmit={handleSend}>
						<PromptInputTextarea placeholder="Ask anything..." />
						<PromptInputFooter>
							<div />
							<PromptInputSubmit />
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	);
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
	return (
		<Message from={message.role}>
			<MessageContent>
				{message.reasoning && (
					<Reasoning>
						<ReasoningTrigger />
						<ReasoningContent>{message.reasoning}</ReasoningContent>
					</Reasoning>
				)}

				{message.plan && <PlanBlock plan={message.plan} />}

				{message.content && (
					<MessageResponse>{message.content}</MessageResponse>
				)}

				{message.codeBlock && (
					<CodeBlock
						code={message.codeBlock.code}
						language={message.codeBlock.language}
					>
						<CodeBlockCopyButton />
					</CodeBlock>
				)}

				{message.toolCalls?.map((tc) => (
					<div key={tc.id} className="flex flex-col gap-2">
						<Tool defaultOpen={tc.state === "output-error"}>
							<ToolHeader
								title={tc.name}
								type="tool-invocation"
								state={tc.state}
							/>
							<ToolContent>
								<ToolInput input={tc.input} />
								{(tc.output || tc.errorText) && (
									<ToolOutput
										output={tc.output}
										errorText={tc.errorText}
									/>
								)}
							</ToolContent>
						</Tool>

						{tc.approval && (
							<Confirmation
								approval={tc.approval}
								state={tc.state}
							>
								<ConfirmationTitle>
									{tc.approval.approved === undefined
										? `Allow ${tc.name}?`
										: tc.approval.approved
											? `${tc.name} was approved`
											: `${tc.name} was denied`}
								</ConfirmationTitle>
								<ConfirmationRequest>
									<ConfirmationActions>
										<ConfirmationAction variant="outline">
											Deny
										</ConfirmationAction>
										<ConfirmationAction>
											Allow
										</ConfirmationAction>
									</ConfirmationActions>
								</ConfirmationRequest>
							</Confirmation>
						)}
					</div>
				))}
			</MessageContent>
		</Message>
	);
}

function PlanBlock({ plan }: { plan: PlanData }) {
	return (
		<Plan defaultOpen>
			<PlanHeader>
				<div>
					<PlanTitle>{plan.title}</PlanTitle>
					<PlanDescription>{plan.description}</PlanDescription>
				</div>
			</PlanHeader>
			<PlanContent>
				<ul className="space-y-1.5 text-sm">
					{plan.steps.map((step) => (
						<li key={step.label} className="flex items-center gap-2">
							<span
								className={
									step.done
										? "text-green-500"
										: "text-muted-foreground"
								}
							>
								{step.done ? "\u2713" : "\u25CB"}
							</span>
							<span
								className={
									step.done
										? "text-muted-foreground line-through"
										: ""
								}
							>
								{step.label}
							</span>
						</li>
					))}
				</ul>
			</PlanContent>
		</Plan>
	);
}
