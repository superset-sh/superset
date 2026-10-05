import type { Meta, StoryObj } from "@storybook/react-vite";
import { HiChevronDown } from "react-icons/hi2";
import { LuListFilter } from "react-icons/lu";
import { fn } from "storybook/test";
import { ToolbarMenuButton } from "./ToolbarMenuButton";

const meta = {
	component: ToolbarMenuButton,
	decorators: [
		(Story) => (
			<div className="w-[320px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		onClick: fn(),
		children: (
			<>
				<LuListFilter className="size-3.5" />
				Filter
			</>
		),
	},
} satisfies Meta<typeof ToolbarMenuButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {};

export const Chosen: Story = {
	args: {
		isActive: true,
		children: (
			<>
				<LuListFilter className="size-3.5" />
				Created by me
				<HiChevronDown className="size-3" />
			</>
		),
	},
};

export const LongLabel: Story = {
	args: {
		isActive: true,
		children: (
			<>
				<LuListFilter className="size-3.5" />
				Superset marketing site preview deployments
			</>
		),
	},
};
