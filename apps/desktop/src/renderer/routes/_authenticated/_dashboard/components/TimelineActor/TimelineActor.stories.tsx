import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TimelineActor } from "./TimelineActor";

const meta = {
	component: TimelineActor,
	decorators: [
		(Story) => (
			<div className="w-[400px] bg-background p-6">
				<Story />
			</div>
		),
	],
	render: (args) => (
		<p className="text-[13px] leading-5 text-muted-foreground">
			<TimelineActor {...args} /> joined · 3h
		</p>
	),
	args: {
		actor: {
			kind: "user",
			person: { userId: "avi", name: "Avi Peltz", image: null },
		},
		onOpenPerson: fn(),
	},
} satisfies Meta<typeof TimelineActor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Person: Story = {};

export const Superset: Story = { args: { actor: { kind: "system" } } };
