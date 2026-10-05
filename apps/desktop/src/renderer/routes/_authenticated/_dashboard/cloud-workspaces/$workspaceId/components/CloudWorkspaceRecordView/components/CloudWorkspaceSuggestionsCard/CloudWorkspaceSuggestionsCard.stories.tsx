import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceSuggestionsCard } from "./CloudWorkspaceSuggestionsCard";

const taskSuggestions = [
	{
		id: "s1",
		source: "groomer",
		kind: "link_task" as const,
		task: {
			id: "t2",
			slug: "SUPER-2384",
			externalProvider: null,
			externalKey: null,
			title: "Mobile: block comment popover on small screens",
			status: { type: "started", color: "#f2c94c", progressPercent: 50 },
		},
	},
	{
		id: "s2",
		source: "avi-enricher",
		kind: "link_task" as const,
		task: {
			id: "t3",
			slug: "SUPER-2452",
			externalProvider: null,
			externalKey: null,
			title: "No mechanism for reporting sidebar lag",
			status: { type: "unstarted", color: "#8c8c8f", progressPercent: null },
		},
	},
];

const meta = {
	component: CloudWorkspaceSuggestionsCard,
	decorators: [
		(Story) => (
			<div className="w-[820px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		suggestions: [
			...taskSuggestions,
			{
				id: "s3",
				source: "groomer",
				kind: "set_project",
				project: {
					id: "proj-1",
					name: "Sidebar performance",
					icon: "gauge",
					color: "#f97316",
				},
			},
			{
				id: "s4",
				source: "groomer",
				kind: "add_label",
				label: {
					id: "label-performance",
					name: "performance",
					color: "#f97316",
				},
			},
		],
		onAccept: fn(),
		onDismiss: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceSuggestionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryKind: Story = {};

export const TasksOnly: Story = { args: { suggestions: taskSuggestions } };

export const OneLabel: Story = {
	args: {
		suggestions: [
			{
				id: "s4",
				source: "groomer",
				kind: "add_label",
				label: { id: "label-mobile", name: "mobile", color: "#a855f7" },
			},
		],
	},
};
