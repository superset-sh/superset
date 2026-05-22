import type { Meta, StoryObj } from "@storybook/react-native";
import { PlanReviewScreen } from "./PlanReviewScreen";

const SAMPLE_PLAN = `# Plan: Refactor relay reconnect

1. Read packages/relay/src/tunnel.ts
2. Identify the existing reconnect call site (linear backoff, no jitter)
3. Replace with exponentialBackoff helper
   - Base delay: 250ms
   - Max delay: 30s
   - Jitter: ±25%
4. Update the tunnel-reconnect.test.ts fixture to cover backoff bounds
5. Run \`bun test packages/relay\` and confirm green
6. Wire the new helper into the host-service worker so retries no longer thrash
`;

const meta: Meta<typeof PlanReviewScreen> = {
	title: "Organisms/PlanReviewScreen",
	component: PlanReviewScreen,
	parameters: {
		docs: {
			description: {
				component:
					"Full-screen plan review modal (UC-PAUSE-03). Composes ModalHeader + scrollable plan body + expandable feedback textarea + docked Reject/Approve. The modal owns its chrome — no AppHeader or Composer renders underneath while this is presented.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		planMarkdown: SAMPLE_PLAN,
		isSubmitting: false,
	},
	argTypes: {
		planMarkdown: { control: "text" },
		isSubmitting: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof PlanReviewScreen>;

export const Default: Story = {};

export const Submitting: Story = {
	args: { isSubmitting: true },
};

export const ShortPlan: Story = {
	args: {
		planMarkdown: "# Plan: Quick fix\n\n1. Bump version\n2. Push tag\n3. Done",
	},
};
