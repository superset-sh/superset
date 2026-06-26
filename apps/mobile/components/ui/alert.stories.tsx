import type { Meta, StoryObj } from "@storybook/react-native";
import { CircleAlert, Terminal } from "lucide-react-native";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const meta = {
	title: "ui/Alert",
	component: Alert,
	args: {
		icon: Terminal,
		variant: "default",
	},
	render: ({ variant }) => (
		<Alert
			icon={variant === "destructive" ? CircleAlert : Terminal}
			variant={variant}
		>
			<AlertTitle>Heads up!</AlertTitle>
			<AlertDescription>
				You can add components to your app using the CLI.
			</AlertDescription>
		</Alert>
	),
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "default" } };

export const Destructive: Story = { args: { variant: "destructive" } };
