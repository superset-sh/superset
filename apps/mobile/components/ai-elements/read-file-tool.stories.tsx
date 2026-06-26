import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ReadFileTool } from "@/components/ai-elements/read-file-tool";

const FILE_CONTENT = `import { useLiveQuery } from "@tanstack/react-db";
import { workspaceCollection } from "@/collections/workspaces";

export function useWorkspaces(organizationId: string) {
	const { data, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ workspace: workspaceCollection })
				.where(({ workspace }) =>
					eq(workspace.organizationId, organizationId),
				),
		[organizationId],
	);

	return { workspaces: data ?? [], isReady };
}`;

const LONG_CONTENT = Array.from(
	{ length: 40 },
	(_, i) => `export const CONSTANT_${i + 1} = ${i + 1};`,
).join("\n");

const meta = {
	title: "ai-elements/ReadFileTool",
	component: ReadFileTool,
	args: {
		filename: "useWorkspaces.ts",
		content: FILE_CONTENT,
	},
} satisfies Meta<typeof ReadFileTool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<ReadFileTool
				content={FILE_CONTENT}
				filename="apps/desktop/src/hooks/useWorkspaces.ts"
				language="typescript"
				lineRange="1–18"
			/>
		</View>
	),
};

export const Pending: Story = {
	render: () => (
		<View className="w-full">
			<ReadFileTool
				content=""
				filename="packages/db/src/schema/workspaces.ts"
				isPending
			/>
		</View>
	),
};

export const WithOpenInPane: Story = {
	render: () => (
		<View className="w-full">
			<ReadFileTool
				content={FILE_CONTENT}
				filename="apps/desktop/src/hooks/useWorkspaces.ts"
				language="typescript"
				lineRange="1–18"
				onOpenInPane={() => {}}
			/>
		</View>
	),
};

export const LongFile: Story = {
	render: () => (
		<View className="w-full">
			<ReadFileTool
				content={LONG_CONTENT}
				filename="packages/shared/src/constants.ts"
				language="typescript"
				lineRange="1–40"
			/>
		</View>
	),
};

export const ErrorState: Story = {
	render: () => (
		<View className="w-full">
			<ReadFileTool content="" filename="missing-file.ts" isError />
		</View>
	),
};
