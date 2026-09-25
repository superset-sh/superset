import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SCENARIOS, type ScenarioName } from "../fixtures";
import { ReviewersSheet } from "./ReviewersSheet";

const meta = {
	parameters: { fullBleed: true },
	title: "pull-request/ReviewersSheet",
	argTypes: { name: { control: "select", options: Object.keys(SCENARIOS) } },
	render: ({ name }) => (
		<View className="h-[560px] w-full overflow-hidden rounded-3xl">
			<ReviewersSheet reviewers={SCENARIOS[name].reviewers} />
		</View>
	),
} satisfies Meta<{ name: ScenarioName }>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One approval, one reviewer still outstanding. */
export const OneApprovalOneOutstanding: Story = {
	args: { name: "openApprovedChecksRunning" },
};
/** Changes requested, plus who is still outstanding. */
export const ChangesRequested: Story = {
	args: { name: "draftChangesRequested" },
};
export const Overflow: Story = { args: { name: "manyReviewers" } };
export const Empty: Story = { args: { name: "openReadyNoCi" } };
