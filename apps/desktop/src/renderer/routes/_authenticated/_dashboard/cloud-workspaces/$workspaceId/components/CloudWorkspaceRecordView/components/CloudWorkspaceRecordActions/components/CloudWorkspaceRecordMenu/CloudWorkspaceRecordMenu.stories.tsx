import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceRecordMenu } from "./CloudWorkspaceRecordMenu";

const meta = {
	component: CloudWorkspaceRecordMenu,
	decorators: [
		(Story) => (
			<div className="flex w-[240px] justify-end bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		isArchived: false,
		onSaveAsEnvironment: fn(),
		onArchive: fn(),
		onUnarchive: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceRecordMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NotRunning: Story = {
	args: { onSaveAsEnvironment: undefined },
};

export const Archived: Story = {
	args: { isArchived: true, onSaveAsEnvironment: undefined },
};
