import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { UserQuestionTool } from "@/components/ai-elements/user-question-tool";

const SINGLE_QUESTION = [
	{
		question: "Which database should the new workspace events table live in?",
		header: "Schema decision",
		options: [
			{
				label: "Neon Postgres (packages/db)",
				description: "Synced to all clients via Electric",
			},
			{
				label: "Local SQLite (packages/local-db)",
				description: "Device-only, no sync",
			},
			{
				label: "host.db",
				description: "Canonical workspace record on the host service",
			},
		],
	},
];

const MULTI_QUESTIONS = [
	{
		question: "Which apps should get the new tool renderers?",
		header: "Rollout scope",
		multiSelect: true,
		options: [
			{ label: "Desktop", description: "apps/desktop chat pane" },
			{ label: "Mobile", description: "apps/mobile Expo app" },
			{ label: "Web", description: "app.superset.sh" },
		],
	},
	{
		question: "How should long bash output be handled?",
		header: "UX decision",
		options: [
			{ label: "Clamp with Show more", description: "Default 20 lines" },
			{ label: "Render everything" },
		],
	},
];

const meta = {
	title: "ai-elements/UserQuestionTool",
	component: UserQuestionTool,
	args: {
		questions: SINGLE_QUESTION,
		onAnswer: () => {},
		onSkip: () => {},
	},
} satisfies Meta<typeof UserQuestionTool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleSelect: Story = {
	render: (args) => (
		<View className="w-full">
			<UserQuestionTool {...args} />
		</View>
	),
};

export const MultiQuestion: Story = {
	args: {
		questions: MULTI_QUESTIONS,
	},
	render: (args) => (
		<View className="w-full">
			<UserQuestionTool {...args} />
		</View>
	),
};
