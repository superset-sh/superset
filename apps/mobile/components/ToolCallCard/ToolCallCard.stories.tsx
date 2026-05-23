import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Code,
	FileText,
	Globe,
	type LucideIcon,
	Search,
	Terminal,
} from "lucide-react-native";
import { View } from "react-native";
import { ToolCallCard, type ToolCallStatus } from "./ToolCallCard";

const STATUSES: ToolCallStatus[] = [
	"running",
	"done",
	"pending",
	"error",
	"neutral",
];

const ICON_MAP: Record<string, LucideIcon> = {
	Terminal,
	Code,
	FileText,
	Search,
	Globe,
};

const meta: Meta<typeof ToolCallCard> = {
	title: "Molecules/ToolCallCard",
	component: ToolCallCard,
	parameters: {
		docs: {
			description: {
				component:
					"Collapsed tool-call card (UC-RENDER-04). Tappable to navigate to detail; never expands in-place. 5 status variants drive ToolStatusRule + status Pill + icon color. running shows ActivityIndicator inline. Composes ToolStatusRule + Pill + Icon + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		name: "bash",
		args: "$ bun test --filter billing",
		status: "running",
		duration: "0.3s",
	},
	argTypes: {
		name: { control: "text" },
		args: { control: "text" },
		status: { control: { type: "select" }, options: STATUSES },
		icon: {
			control: { type: "select" },
			options: Object.keys(ICON_MAP),
			mapping: ICON_MAP,
		},
		duration: { control: "text", description: "Appended to DONE label" },
	},
};

export default meta;

type Story = StoryObj<typeof ToolCallCard>;

export const Running: Story = {};

export const Done: Story = {
	args: { status: "done", duration: "0.3s" },
};

export const Pending: Story = {
	args: { status: "pending" },
};

export const Failed: Story = {
	args: { status: "error", args: "Error: ENOENT — file not found" },
};

export const Neutral: Story = {
	args: { status: "neutral" },
};

export const AllStatuses: Story = {
	render: () => (
		<View className="gap-2 max-w-sm w-full p-2">
			<ToolCallCard
				status="running"
				name="bash"
				args="$ bun test --filter billing"
				icon={Terminal}
			/>
			<ToolCallCard
				status="done"
				name="read_file"
				args="src/billing/router.ts"
				duration="0.1s"
				icon={FileText}
			/>
			<ToolCallCard
				status="pending"
				name="write_file"
				args="src/billing/calc.ts"
				icon={Code}
			/>
			<ToolCallCard
				status="error"
				name="grep"
				args="Error: ENOENT — directory not found"
				icon={Search}
			/>
			<ToolCallCard
				status="neutral"
				name="fetch"
				args="GET /api/health"
				icon={Globe}
			/>
		</View>
	),
};
