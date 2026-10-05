import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuFileText } from "react-icons/lu";
import { fn } from "storybook/test";
import { RecordInlineLink } from "./RecordInlineLink";

const meta = {
	component: RecordInlineLink,
	decorators: [
		(Story) => (
			<div className="w-[520px] bg-background p-6">
				<Story />
			</div>
		),
	],
	render: (args) => (
		<p className="text-[13px] leading-5 text-muted-foreground">
			Avi Peltz published <RecordInlineLink {...args} /> · 40m
		</p>
	),
	args: {
		icon: <LuFileText className="size-3.5 text-muted-foreground" />,
		children: "sidebar-lag-trace",
		onClick: fn(),
	},
} satisfies Meta<typeof RecordInlineLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShortTitle: Story = {};

export const LongTitleWraps: Story = {
	args: {
		children:
			"Sidebar lag with 48 open workspaces: before and after the hover measurement memo, with the renderer trace",
	},
};
