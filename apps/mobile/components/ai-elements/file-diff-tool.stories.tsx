import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { FileDiffTool } from "@/components/ai-elements/file-diff-tool";

const OLD_STRING = `const { data } = useLiveQuery(
	(q) => q.from({ workspace: workspaceCollection }),
);

if (!isReady) return <Skeleton />;
return <WorkspaceList workspaces={data} />;`;

const NEW_STRING = `const { data, isReady } = useLiveQuery(
	(q) => q.from({ workspace: workspaceCollection }),
);

if (data.length === 0 && !isReady) return <Skeleton />;
if (data.length === 0) return <EmptyState />;
return <WorkspaceList workspaces={data} />;`;

const WRITE_CONTENT = `export const RELAY_MIN_MACHINE_SIZE = "performance-2x";
export const RELAY_MIN_MEMORY_MB = 4096;

export function assertMachineSize(size: string): void {
	if (size !== RELAY_MIN_MACHINE_SIZE) {
		throw new Error("Relay floor is performance-2x/4GB");
	}
}`;

const STRUCTURED_PATCH = [
	{
		lines: [
			' import { Sentry } from "@sentry/node";',
			"-Sentry.init({ enableLogs: true,",
			"-\tintegrations: [Sentry.consoleLoggingIntegration()] });",
			"+Sentry.init({});",
			" ",
			" export const app = new Hono();",
		],
	},
];

const meta = {
	title: "ai-elements/FileDiffTool",
	component: FileDiffTool,
	args: {
		state: "output-available",
	},
} satisfies Meta<typeof FileDiffTool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EditMode: Story = {
	render: () => (
		<View className="w-full">
			<FileDiffTool
				filePath="apps/desktop/src/renderer/workspaces/WorkspaceScreen.tsx"
				newString={NEW_STRING}
				oldString={OLD_STRING}
				state="output-available"
			/>
		</View>
	),
};

export const WriteMode: Story = {
	render: () => (
		<View className="w-full">
			<FileDiffTool
				content={WRITE_CONTENT}
				filePath="apps/relay/src/machine-size.ts"
				isWriteMode
				state="output-available"
			/>
		</View>
	),
};

export const StructuredPatch: Story = {
	render: () => (
		<View className="w-full">
			<FileDiffTool
				filePath="apps/relay/src/index.ts"
				state="output-available"
				structuredPatch={STRUCTURED_PATCH}
			/>
		</View>
	),
};

export const Streaming: Story = {
	render: () => (
		<View className="w-full">
			<FileDiffTool state="input-streaming" />
		</View>
	),
};

export const WithOpenActions: Story = {
	render: () => (
		<View className="w-full">
			<FileDiffTool
				filePath="apps/desktop/src/renderer/workspaces/WorkspaceScreen.tsx"
				newString={NEW_STRING}
				oldString={OLD_STRING}
				onDiffPathClick={() => {}}
				onFilePathClick={() => {}}
				state="output-available"
			/>
		</View>
	),
};
