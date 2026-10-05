import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AttachmentTile } from "./AttachmentTile";

const meta = {
	component: AttachmentTile,
	decorators: [
		(Story) => (
			<div className="w-[320px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		filename: "sidebar-lag.png",
		imageUrl: "fixtures/thumb-trace.jpg",
		onOpen: fn(),
	},
} satisfies Meta<typeof AttachmentTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Image: Story = {};

export const File: Story = {
	args: { filename: "before-after.mp4", imageUrl: null },
};

export const LongFileName: Story = {
	args: { filename: "trace-48-workspaces-hover-provider.json", imageUrl: null },
};

export const Removable: Story = {
	args: { filename: "notes.md", imageUrl: null, onRemove: fn() },
};
