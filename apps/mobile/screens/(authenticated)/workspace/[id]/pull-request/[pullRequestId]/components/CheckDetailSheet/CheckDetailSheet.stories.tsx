import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { action } from "storybook/actions";
import { SCENARIOS } from "../fixtures";
import { CheckDetailSheet } from "./CheckDetailSheet";

const FAILING = SCENARIOS.openTwoChecksFailed.checks[0];
const PASSING = SCENARIOS.openWaitingForReview.checks[0];

const meta = {
	parameters: { fullBleed: true },
	title: "pull-request/CheckDetailSheet",
	render: ({ passing }) => (
		<View className="h-[560px] w-full overflow-hidden rounded-3xl">
			<CheckDetailSheet
				check={(passing ? PASSING : FAILING) ?? FAILING}
				onFixWithAgent={passing ? undefined : action("fix with agent")}
				onOpenInGitHub={action("open in github")}
			/>
		</View>
	),
} satisfies Meta<{ passing?: boolean }>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A failure, with the agent offered above the GitHub link. */
export const FailedCheck: Story = { args: { passing: false } };
/** A pass, where there is nothing for the agent to fix. */
export const PassedCheck: Story = { args: { passing: true } };
