import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Layers,
	MessageSquare,
	Package,
	Search,
	Settings,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
	title: "Molecules/Sessions/EmptyState",
	component: EmptyState,
	parameters: {
		docs: {
			description: {
				component:
					"Centered empty-state body — icon + heading + body + optional CTA. Used by sessions-list 5 variants (UC-NAV-06.1–.5).",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		icon: Package,
		heading: "No projects yet",
		body: "Create a project on desktop to get started.",
	},
	argTypes: {
		heading: { control: "text" },
		body: { control: "text" },
		icon: { control: false },
		cta: { control: false },
	},
};

export default meta;

type Story = StoryObj<typeof EmptyState>;

const renderWithCta =
	(label: string): Story["render"] =>
	(args) => (
		<EmptyState
			{...args}
			cta={
				<Pressable
					accessibilityRole="button"
					className="bg-secondary px-4 py-2 rounded-md"
				>
					<Text>{label}</Text>
				</Pressable>
			}
		/>
	);

export const NoProjects: Story = {};

export const NoWorkspaces: Story = {
	args: {
		icon: Layers,
		heading: "No workspaces in superset",
		body: "Create a workspace on desktop to start a new chat here.",
	},
};

export const NoSessions: Story = {
	args: {
		icon: MessageSquare,
		heading: "Start your first chat in superset",
		body: "Tap the + button below to begin a new conversation.",
	},
};

export const SearchNoMatch: Story = {
	args: {
		icon: Search,
		heading: "No matches",
		body: 'No sessions in superset match "zzzz".',
	},
	render: renderWithCta("Clear search"),
};

export const FiltersNoMatch: Story = {
	args: {
		icon: Settings,
		heading: "No matches",
		body: "No sessions match your filters. Try clearing some.",
	},
	render: renderWithCta("Clear filters"),
};
