import type { Meta, StoryObj } from "@storybook/react-native";
import { SCENARIOS, type ScenarioName } from "../fixtures";
import { PullRequestHeader } from "./PullRequestHeader";

const meta = {
	title: "pull-request/Header",
	parameters: { fullBleed: true },
	argTypes: { name: { control: "select", options: Object.keys(SCENARIOS) } },
	render: ({ name }) => (
		<PullRequestHeader
			pullRequest={SCENARIOS[name].pullRequest}
			queued={SCENARIOS[name].mergeability.queue !== null}
		/>
	),
} satisfies Meta<{ name: ScenarioName }>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { name: "openReadyNoCi" } };
export const Draft: Story = { args: { name: "draftConflicts" } };
export const Closed: Story = { args: { name: "closed" } };
export const Merged: Story = { args: { name: "merged" } };
export const Queued: Story = { args: { name: "queued" } };
export const LongTitle: Story = { args: { name: "openApprovedChecksRunning" } };
