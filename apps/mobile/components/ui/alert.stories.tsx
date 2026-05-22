import type { Meta, StoryObj } from "@storybook/react-native";
import {
	AlertTriangle,
	Info as InfoIcon,
	type LucideIcon,
	WifiOff,
} from "lucide-react-native";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ICON_MAP: Record<string, LucideIcon> = {
	Info: InfoIcon,
	WifiOff,
	AlertTriangle,
};

function AlertShowcase({
	variant,
	icon,
	title,
	description,
}: {
	variant: "default" | "destructive";
	icon: keyof typeof ICON_MAP;
	title: string;
	description: string;
}) {
	return (
		<Alert variant={variant} icon={ICON_MAP[icon]}>
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>{description}</AlertDescription>
		</Alert>
	);
}

const meta: Meta<typeof AlertShowcase> = {
	title: "Components/Alert",
	component: AlertShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Inline informational/destructive alert with leading icon. Used for host-offline banner, permission-denied banner, dispatch-outcome variants (UC-PLATF-03).",
			},
		},
	},
	args: {
		variant: "default",
		icon: "Info",
		title: "Host reconnected",
		description: "Streaming has resumed.",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["default", "destructive"],
		},
		icon: {
			control: { type: "select" },
			options: ["Info", "WifiOff", "AlertTriangle"],
		},
		title: { control: "text" },
		description: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof AlertShowcase>;

export const InfoBanner: Story = {};

export const HostOffline: Story = {
	args: {
		variant: "destructive",
		icon: "WifiOff",
		title: "Host offline",
		description: "Tap to retry connecting.",
	},
};

export const PlanUpgrade: Story = {
	args: {
		variant: "destructive",
		icon: "AlertTriangle",
		title: "Plan upgrade required",
		description: "Your host requires a paid plan to dispatch.",
	},
};

export const DispatchFailed: Story = {
	args: {
		variant: "destructive",
		icon: "AlertTriangle",
		title: "Host dispatch failed",
		description: "Tap retry, or open another session.",
	},
};
