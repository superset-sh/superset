import type { ChatMessage, ModelOption } from "./types";

export const MODELS: ModelOption[] = [
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

export const MOCK_MESSAGES: ChatMessage[] = [
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

export const SUGGESTIONS = [
	"Explain this codebase",
	"Fix the failing tests",
	"Write tests for auth",
	"Refactor to async/await",
];
