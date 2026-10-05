import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspacePrompt } from "./CloudWorkspacePrompt";

const attachments = [
	{
		id: "a1",
		name: "before-after.mp4",
		contentType: "video/mp4",
		url: null,
		createdAt: new Date("2026-09-26T08:00:00Z"),
	},
	{
		id: "a2",
		name: "trace-48-workspaces.json",
		contentType: "application/json",
		url: null,
		createdAt: new Date("2026-09-26T08:00:00Z"),
	},
	{
		id: "a3",
		name: "sidebar-lag.png",
		contentType: "image/png",
		url: "fixtures/thumb-trace.jpg",
		createdAt: new Date("2026-09-26T11:00:00Z"),
	},
];

const meta = {
	component: CloudWorkspacePrompt,
	decorators: [
		(Story) => (
			<div className="w-[760px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		prompt:
			"Reproduce the sidebar lag Harshith reported when 40+ workspaces are open. Profile the renderer, find the hot path, and open a PR with the fix and a before/after trace.",
		attachments: [],
		onOpenAttachment: fn(),
		onDownloadAttachment: fn(async () => {}),
	},
} satisfies Meta<typeof CloudWorkspacePrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextOnly: Story = {};

export const WithAttachments: Story = { args: { attachments } };

export const AttachmentsOnly: Story = {
	args: { prompt: null, attachments: attachments.slice(2) },
};
