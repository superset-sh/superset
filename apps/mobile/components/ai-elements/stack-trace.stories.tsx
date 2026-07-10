import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	StackTrace,
	StackTraceActions,
	StackTraceContent,
	StackTraceCopyButton,
	StackTraceError,
	StackTraceErrorMessage,
	StackTraceErrorType,
	StackTraceExpandButton,
	StackTraceFrames,
	StackTraceHeader,
} from "@/components/ai-elements/stack-trace";

const TRACE = `TypeError: Cannot read properties of undefined (reading 'workspaceId')
    at resolveWorkspace (src/workspaces/resolve-workspace.ts:42:18)
    at createSession (src/sessions/create-session.ts:87:31)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async handler (src/routes/sessions.ts:23:15)
    at async dispatch (node_modules/hono/dist/compose.js:29:17)`;

const LONG_TRACE = `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1606:16)
    at connect (src/db/pool.ts:18:9)
    at acquireClient (src/db/pool.ts:44:22)
    at runQuery (src/db/query.ts:12:28)
    at getWorkspace (src/workspaces/get-workspace.ts:9:18)
    at resolveWorkspace (src/workspaces/resolve-workspace.ts:31:12)
    at createSession (src/sessions/create-session.ts:87:31)
    at startAgent (src/agents/start-agent.ts:55:14)
    at handler (src/routes/agents.ts:19:11)
    at dispatch (node_modules/hono/dist/compose.js:29:17)
    at cors (node_modules/hono/dist/middleware/cors/index.js:42:11)
    at logger (node_modules/hono/dist/middleware/logger/index.js:25:9)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`;

const meta = {
	title: "ai-elements/StackTrace",
	component: StackTrace,
} satisfies Meta<typeof StackTrace>;

export default meta;

type Story = StoryObj<typeof meta>;

const renderStackTrace = (
	trace: string,
	framesProps?: React.ComponentProps<typeof StackTraceFrames>,
) => (
	<View className="w-full">
		<StackTrace defaultOpen trace={trace}>
			<StackTraceHeader>
				<StackTraceError>
					<StackTraceErrorType />
					<StackTraceErrorMessage />
				</StackTraceError>
				<StackTraceActions>
					<StackTraceCopyButton />
					<StackTraceExpandButton />
				</StackTraceActions>
			</StackTraceHeader>
			<StackTraceContent>
				<StackTraceFrames {...framesProps} />
			</StackTraceContent>
		</StackTrace>
	</View>
);

export const Default: Story = {
	args: { trace: TRACE },
	render: () => renderStackTrace(TRACE),
};

export const WithoutInternalFrames: Story = {
	args: { trace: TRACE },
	render: () => renderStackTrace(TRACE, { showInternalFrames: false }),
};

export const ClampedLongTrace: Story = {
	args: { trace: LONG_TRACE },
	render: () => renderStackTrace(LONG_TRACE, { maxVisibleFrames: 5 }),
};

export const Collapsed: Story = {
	args: { trace: TRACE },
	render: () => (
		<View className="w-full">
			<StackTrace trace={TRACE}>
				<StackTraceHeader>
					<StackTraceError>
						<StackTraceErrorType />
						<StackTraceErrorMessage />
					</StackTraceError>
					<StackTraceActions>
						<StackTraceCopyButton />
						<StackTraceExpandButton />
					</StackTraceActions>
				</StackTraceHeader>
				<StackTraceContent>
					<StackTraceFrames />
				</StackTraceContent>
			</StackTrace>
		</View>
	),
};
