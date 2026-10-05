import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ImagePreviewOverlay } from "./ImagePreviewOverlay";

const meta = {
	component: ImagePreviewOverlay,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="h-screen bg-background">
				<Story />
			</div>
		),
	],
	args: {
		src: "fixtures/thumb-trace.jpg",
		filename: "sidebar-lag.png",
		open: true,
		onClose: fn(),
		onDownload: fn(async () => {}),
	},
} satisfies Meta<typeof ImagePreviewOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Screenshot: Story = {};

export const Notes: Story = {
	args: { src: "fixtures/thumb-notes.jpg", filename: "notes.png" },
};
