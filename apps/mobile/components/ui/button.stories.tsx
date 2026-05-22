import type { Meta, StoryObj } from "@storybook/react-native";
import { Send } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type Variant =
	| "default"
	| "destructive"
	| "outline"
	| "secondary"
	| "ghost"
	| "link";
type Size = "default" | "sm" | "lg" | "icon";

function ButtonShowcase({
	variant,
	size,
	disabled,
	label,
	leadingIcon,
}: {
	variant: Variant;
	size: Size;
	disabled: boolean;
	label: string;
	leadingIcon: boolean;
}) {
	if (size === "icon") {
		return (
			<Button variant={variant} size="icon" disabled={disabled}>
				<Icon as={Send} className="size-5" />
			</Button>
		);
	}
	return (
		<Button variant={variant} size={size} disabled={disabled}>
			{leadingIcon ? <Icon as={Send} className="size-4" /> : null}
			<Text>{label}</Text>
		</Button>
	);
}

const meta: Meta<typeof ButtonShowcase> = {
	title: "Components/Button",
	component: ButtonShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Primary tappable action. 6 variants (default/destructive/outline/secondary/ghost/link) × 4 sizes (default/sm/lg/icon). Default fills with ember (--color-primary). Pressable from RN — long-press supported via consumer onLongPress.",
			},
		},
	},
	args: {
		variant: "default",
		size: "default",
		disabled: false,
		label: "Send",
		leadingIcon: false,
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: [
				"default",
				"destructive",
				"outline",
				"secondary",
				"ghost",
				"link",
			],
		},
		size: {
			control: { type: "select" },
			options: ["default", "sm", "lg", "icon"],
		},
		disabled: { control: "boolean" },
		label: { control: "text" },
		leadingIcon: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ButtonShowcase>;

export const Default: Story = {};

export const Destructive: Story = {
	args: { variant: "destructive", label: "Delete session" },
};

export const Outline: Story = {
	args: { variant: "outline", label: "Cancel" },
};

export const Secondary: Story = {
	args: { variant: "secondary", label: "Reject" },
};

export const Ghost: Story = {
	args: { variant: "ghost", label: "Skip" },
};

export const Link: Story = {
	args: { variant: "link", label: "Open in settings" },
};

export const WithLeadingIcon: Story = {
	args: { leadingIcon: true, label: "Send" },
};

export const IconOnly: Story = {
	args: { size: "icon" },
	parameters: {
		docs: {
			description: {
				story: "Square button for icon-only actions (Send/Stop/Close).",
			},
		},
	},
};

export const SmallApprove: Story = {
	args: { size: "sm", label: "Approve" },
};

export const LargePrimary: Story = {
	args: { size: "lg", label: "Enable notifications" },
};

export const Disabled: Story = {
	args: { disabled: true, label: "Send" },
};

export const AllVariants: Story = {
	render: () => (
		<View className="gap-2 w-full">
			<Button variant="default">
				<Text>Default (ember)</Text>
			</Button>
			<Button variant="destructive">
				<Text>Destructive</Text>
			</Button>
			<Button variant="outline">
				<Text>Outline</Text>
			</Button>
			<Button variant="secondary">
				<Text>Secondary</Text>
			</Button>
			<Button variant="ghost">
				<Text>Ghost</Text>
			</Button>
			<Button variant="link">
				<Text>Link</Text>
			</Button>
		</View>
	),
};
