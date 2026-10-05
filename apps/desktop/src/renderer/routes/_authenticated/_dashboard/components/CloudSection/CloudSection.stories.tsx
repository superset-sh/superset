import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudRepositoryRow } from "../CloudRepositoryRow";
import { CloudSection } from "./CloudSection";

const repositories = [
	"superset-sh/superset",
	"superset-sh/docs",
	"superset-sh/marketing-site",
	"superset-sh/relay",
	"superset-sh/sandbox-images",
	"superset-sh/agent-marketplace",
	"superset-sh/homebrew-tap",
];

const meta = {
	component: CloudSection,
	decorators: [
		(Story) => (
			<div className="w-80 bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		title: "Repositories",
		children: (
			<CloudRepositoryRow fullName="superset-sh/superset" onOpen={fn()} />
		),
	},
} satisfies Meta<typeof CloudSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneRow: Story = {};

export const ManyRows: Story = {
	args: {
		children: repositories.map((fullName) => (
			<CloudRepositoryRow key={fullName} fullName={fullName} onOpen={fn()} />
		)),
	},
};

export const ManyRowsScrollable: Story = {
	args: {
		scrollable: true,
		children: repositories.map((fullName) => (
			<CloudRepositoryRow key={fullName} fullName={fullName} onOpen={fn()} />
		)),
	},
};

export const Empty: Story = {
	args: { children: null },
};
