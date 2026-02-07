import {
	Checkpoint,
	CheckpointIcon,
	CheckpointTrigger,
} from "@superset/ui/ai-elements/checkpoint";
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
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorName,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import {
	Plan,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
} from "@superset/ui/ai-elements/plan";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@superset/ui/ai-elements/reasoning";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";
import {
	Task,
	TaskContent,
	TaskItem,
	TaskItemFile,
	TaskTrigger,
} from "@superset/ui/ai-elements/task";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import { Fragment, useCallback, useState } from "react";
import {
	HiMiniArrowPath,
	HiMiniAtSymbol,
	HiMiniChatBubbleLeftRight,
	HiMiniClipboard,
	HiMiniPaperClip,
} from "react-icons/hi2";
import type { ChatMessage, ModelOption, PlanData } from "./types";

const MODELS: ModelOption[] = [
	{
		id: "claude-opus-4-6",
		name: "Claude Opus 4.6",
		description: "Most capable — complex tasks, deep reasoning",
	},
	{
		id: "claude-sonnet-4-5-20250929",
		name: "Claude Sonnet 4.5",
		description: "Balanced — fast and capable",
	},
	{
		id: "claude-haiku-4-5-20251001",
		name: "Claude Haiku 4.5",
		description: "Fastest — quick tasks, low cost",
	},
];

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
		reasoning:
			"The user wants help with an authentication bug. I should first plan my approach, then investigate the codebase to understand the current implementation before suggesting fixes. Let me start by searching for auth-related files.",
		plan: {
			title: "Fix authentication bug",
			description:
				"I'll investigate the login flow and fix the token validation issue.",
			steps: [
				{ label: "Search for auth-related files", done: true },
				{ label: "Read the login implementation", done: true },
				{ label: "Identify the bug in validateCredentials", done: true },
				{ label: "Apply the fix", done: false },
				{ label: "Run tests to verify", done: false },
			],
		},
	},
	{
		id: "3",
		role: "assistant",
		content:
			"Let me search for the relevant files and understand the current implementation.",
		tasks: [
			{
				title: "Found auth-related files",
				files: [
					"src/auth/login.ts",
					"src/auth/session.ts",
					"src/auth/validators.ts",
					"src/auth/types.ts",
				],
			},
		],
		toolCalls: [
			{
				id: "tc-1",
				name: "Glob",
				state: "output-available",
				input: { pattern: "src/auth/**/*.ts" },
				output:
					"src/auth/login.ts\nsrc/auth/session.ts\nsrc/auth/validators.ts\nsrc/auth/types.ts",
			},
			{
				id: "tc-2",
				name: "Read",
				state: "output-available",
				input: { file_path: "src/auth/login.ts" },
				output:
					"export async function login(credentials: Credentials) {\n  const token = await validateCredentials(credentials);\n  return createSession(token);\n}\n\nexport async function validateCredentials(credentials: Credentials) {\n  const { email, password } = credentials;\n  const user = await findUserByEmail(email);\n  if (!user || !await verifyPassword(password, user.passwordHash)) {\n    return null;\n  }\n  return generateToken(user);\n}",
			},
			{
				id: "tc-3",
				name: "Grep",
				state: "output-available",
				input: {
					pattern: "isTokenExpired|tokenExpir",
					path: "src/auth/",
				},
				output: "No matches found.",
			},
		],
		checkpoint: "Investigation complete",
	},
	{
		id: "4",
		role: "assistant",
		content:
			"I found the issue. The `login` function doesn't check if the returned token is null or expired before creating a session. Here's the fix:",
		codeBlocks: [
			{
				language: "typescript",
				code: `export async function login(credentials: Credentials) {
  const token = await validateCredentials(credentials);
  if (!token || isTokenExpired(token)) {
    throw new AuthError('Invalid or expired credentials');
  }
  return createSession(token);
}`,
			},
		],
		toolCalls: [
			{
				id: "tc-4",
				name: "Edit",
				state: "output-available",
				input: {
					file_path: "src/auth/login.ts",
					old_string:
						"const token = await validateCredentials(credentials);\n  return createSession(token);",
					new_string:
						"const token = await validateCredentials(credentials);\n  if (!token || isTokenExpired(token)) {\n    throw new AuthError('Invalid or expired credentials');\n  }\n  return createSession(token);",
				},
				output: "File updated successfully.",
				approval: {
					id: "approval-1",
					approved: true,
				},
			},
		],
	},
	{
		id: "5",
		role: "assistant",
		content: "Let me run the tests to make sure the fix works correctly.",
		toolCalls: [
			{
				id: "tc-5",
				name: "Bash",
				state: "output-error",
				input: { command: "bun test src/auth/" },
				output: undefined,
				errorText:
					"FAIL src/auth/login.test.ts\n  ✓ login with valid credentials (3ms)\n  ✓ login with invalid credentials (1ms)\n  ✗ login with expired token (2ms)\n    Expected: AuthError\n    Received: undefined\n\n  Missing import: isTokenExpired is not defined",
			},
		],
	},
	{
		id: "6",
		role: "assistant",
		content:
			"The test revealed I forgot to import `isTokenExpired`. Let me fix that and also add the missing `AuthError` import.",
		toolCalls: [
			{
				id: "tc-6",
				name: "Edit",
				state: "output-available",
				input: {
					file_path: "src/auth/login.ts",
					old_string: 'import { generateToken } from "./token";',
					new_string:
						'import { generateToken, isTokenExpired } from "./token";\nimport { AuthError } from "./errors";',
				},
				output: "File updated successfully.",
				approval: {
					id: "approval-2",
					approved: true,
				},
			},
			{
				id: "tc-7",
				name: "Bash",
				state: "output-available",
				input: { command: "bun test src/auth/" },
				output:
					"PASS src/auth/login.test.ts\n  ✓ login with valid credentials (3ms)\n  ✓ login with invalid credentials (1ms)\n  ✓ login with expired token (2ms)\n\nTest Suites: 1 passed, 1 total\nTests:       3 passed, 3 total",
				approval: {
					id: "approval-3",
					approved: true,
				},
			},
		],
	},
	{
		id: "7",
		role: "assistant",
		content:
			"All tests pass now. The fix adds proper null-check and expiration validation to the `login` function, along with the missing imports for `isTokenExpired` and `AuthError`.",
		codeBlocks: [
			{
				language: "typescript",
				code: `import { generateToken, isTokenExpired } from "./token";
import { AuthError } from "./errors";

export async function login(credentials: Credentials) {
  const token = await validateCredentials(credentials);
  if (!token || isTokenExpired(token)) {
    throw new AuthError('Invalid or expired credentials');
  }
  return createSession(token);
}`,
			},
		],
	},
];

const SUGGESTIONS = [
	"Explain this codebase",
	"Fix the failing tests",
	"Write tests for auth",
	"Refactor to async/await",
];

export function ChatInterface() {
	const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[1]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

	const handleSend = useCallback((message: { text: string }) => {
		if (!message.text.trim()) return;

		const userMessage: ChatMessage = {
			id: `msg-${Date.now()}`,
			role: "user",
			content: message.text,
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);

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
								icon={<HiMiniChatBubbleLeftRight className="size-8" />}
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
							<Fragment key={msg.id}>
								{msg.checkpoint && (
									<Checkpoint>
										<CheckpointIcon />
										<CheckpointTrigger tooltip="Restore to this point">
											{msg.checkpoint}
										</CheckpointTrigger>
									</Checkpoint>
								)}
								<ChatMessageItem message={msg} />
							</Fragment>
						))
					)}
					{isLoading && (
						<Message from="assistant">
							<MessageContent>
								<Shimmer className="text-sm" duration={1.5}>
									Thinking...
								</Shimmer>
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
								<Suggestion key={s} suggestion={s} onClick={handleSuggestion} />
							))}
						</Suggestions>
					)}
					<PromptInput onSubmit={handleSend}>
						<PromptInputTextarea placeholder="Ask anything..." />
						<PromptInputFooter>
							<PromptInputTools>
								<PromptInputButton>
									<HiMiniPaperClip className="size-4" />
								</PromptInputButton>
								<PromptInputButton>
									<HiMiniAtSymbol className="size-4" />
								</PromptInputButton>
								<ModelSelector
									open={modelSelectorOpen}
									onOpenChange={setModelSelectorOpen}
								>
									<ModelSelectorTrigger asChild>
										<PromptInputButton className="gap-1.5 text-xs">
											<ModelSelectorLogo provider="anthropic" />
											<span>{selectedModel.name}</span>
										</PromptInputButton>
									</ModelSelectorTrigger>
									<ModelSelectorContent title="Select Model">
										<ModelSelectorInput placeholder="Search models..." />
										<ModelSelectorList>
											<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
											<ModelSelectorGroup heading="Anthropic">
												{MODELS.map((model) => (
													<ModelSelectorItem
														key={model.id}
														value={model.id}
														onSelect={() => {
															setSelectedModel(model);
															setModelSelectorOpen(false);
														}}
													>
														<ModelSelectorLogo provider="anthropic" />
														<div className="flex flex-1 flex-col gap-0.5">
															<ModelSelectorName>
																{model.name}
															</ModelSelectorName>
															<span className="text-muted-foreground text-xs">
																{model.description}
															</span>
														</div>
													</ModelSelectorItem>
												))}
											</ModelSelectorGroup>
										</ModelSelectorList>
									</ModelSelectorContent>
								</ModelSelector>
							</PromptInputTools>
							<PromptInputSubmit status={isLoading ? "streaming" : undefined} />
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

				{message.tasks?.map((task) => (
					<Task key={task.title}>
						<TaskTrigger title={task.title} />
						<TaskContent>
							{task.files.map((file) => (
								<TaskItem key={file}>
									<TaskItemFile>{file}</TaskItemFile>
								</TaskItem>
							))}
						</TaskContent>
					</Task>
				))}

				{message.codeBlocks?.map((block) => (
					<CodeBlock
						key={block.code}
						code={block.code}
						language={block.language as "typescript"}
					>
						<CodeBlockCopyButton />
					</CodeBlock>
				))}

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
									<ToolOutput output={tc.output} errorText={tc.errorText} />
								)}
							</ToolContent>
						</Tool>

						{tc.approval && (
							<Confirmation approval={tc.approval} state={tc.state}>
								<ConfirmationTitle>
									{"approved" in tc.approval
										? tc.approval.approved
											? `${tc.name} was approved`
											: `${tc.name} was denied`
										: `Allow ${tc.name}?`}
								</ConfirmationTitle>
								<ConfirmationRequest>
									<ConfirmationActions>
										<ConfirmationAction variant="outline">
											Deny
										</ConfirmationAction>
										<ConfirmationAction>Allow</ConfirmationAction>
									</ConfirmationActions>
								</ConfirmationRequest>
							</Confirmation>
						)}
					</div>
				))}
			</MessageContent>

			{message.role === "assistant" && message.content && (
				<MessageActions>
					<MessageAction tooltip="Copy">
						<HiMiniClipboard className="size-3.5" />
					</MessageAction>
					<MessageAction tooltip="Retry">
						<HiMiniArrowPath className="size-3.5" />
					</MessageAction>
				</MessageActions>
			)}
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
									step.done ? "text-green-500" : "text-muted-foreground"
								}
							>
								{step.done ? "\u2713" : "\u25CB"}
							</span>
							<span
								className={
									step.done ? "text-muted-foreground line-through" : ""
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
