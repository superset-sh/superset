import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { action } from "storybook/actions";
import { SCENARIOS, type ScenarioName } from "../fixtures";
import { ChecksSheet } from "./ChecksSheet";

const meta = {
	parameters: { fullBleed: true },
	title: "pull-request/ChecksSheet",
	argTypes: { name: { control: "select", options: Object.keys(SCENARIOS) } },
	render: ({ name }) => (
		<View className="h-[560px] w-full overflow-hidden rounded-3xl">
			<ChecksSheet
				checks={SCENARIOS[name].checks}
				onFixAll={action("fix all")}
				onOpenCheck={action("open check")}
			/>
		</View>
	),
} satisfies Meta<{ name: ScenarioName }>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Mid-run, so In Progress leads and Passed trails it. */
export const MidRunWithInProgress: Story = {
	args: { name: "draftChecksRunning" },
};
/** Settled, so there is no In Progress tab — but Failed still shows at zero. */
export const SettledWithOneFailure: Story = {
	args: { name: "openTwoChecksOneFailed" },
};
export const TwoFailures: Story = { args: { name: "openTwoChecksFailed" } };
export const AllGreen: Story = { args: { name: "openWaitingForReview" } };
