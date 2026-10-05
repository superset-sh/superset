import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudWorkspaceSuggestionsRow } from "./CloudWorkspaceSuggestionsRow";

const chip = (label: string) => (
	<span className="inline-flex h-7 items-center rounded-full border border-dashed border-muted-foreground/40 px-2.5 text-[13px]">
		{label}
	</span>
);

const meta = {
	component: CloudWorkspaceSuggestionsRow,
	decorators: [
		(Story) => (
			<div className="w-[760px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: { label: "Tasks", children: chip("SUPER-2384 Mobile: block comment…") },
} satisfies Meta<typeof CloudWorkspaceSuggestionsRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneChip: Story = {};

export const Wrapping: Story = {
	args: {
		children: (
			<>
				{chip("SUPER-2384 Mobile: block comment…")}
				{chip("SUPER-2452 No mechanism for rep…")}
				{chip("SUPER-2470 Sidebar hover lag")}
				{chip("SUPER-2311 Plugins in cloud boxes")}
			</>
		),
	},
};
