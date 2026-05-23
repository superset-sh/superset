import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

type Variant =
	| "default"
	| "h1"
	| "h2"
	| "h3"
	| "h4"
	| "p"
	| "blockquote"
	| "code"
	| "lead"
	| "large"
	| "small"
	| "muted";

function TextShowcase({
	variant,
	children,
}: {
	variant: Variant;
	children: string;
}) {
	return (
		<View className="w-full">
			<Text variant={variant}>{children}</Text>
		</View>
	);
}

const meta: Meta<typeof TextShowcase> = {
	title: "Components/Text",
	component: TextShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Typed text primitive with 12 variants (default, h1-h4, p, blockquote, code, lead, large, small, muted). The catalog view of all variants is in Design System/Typography — this story is for per-variant inspection.",
			},
		},
	},
	args: {
		variant: "default",
		children: "The quick brown fox jumps over the lazy dog.",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: [
				"default",
				"h1",
				"h2",
				"h3",
				"h4",
				"p",
				"blockquote",
				"code",
				"lead",
				"large",
				"small",
				"muted",
			],
		},
		children: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof TextShowcase>;

export const Default: Story = {};
export const H1: Story = { args: { variant: "h1", children: "Page title" } };
export const H2: Story = { args: { variant: "h2", children: "Section" } };
export const H3: Story = { args: { variant: "h3", children: "Sub-section" } };
export const Paragraph: Story = {
	args: {
		variant: "p",
		children:
			"Multi-sentence paragraph with leading-7 spacing. Used inside markdown rendering and any prose region.",
	},
};
export const Code: Story = {
	args: { variant: "code", children: "const ember = '#e07850';" },
};
export const Muted: Story = {
	args: { variant: "muted", children: "Secondary metadata text" },
};
export const Blockquote: Story = {
	args: {
		variant: "blockquote",
		children: "Italic blockquote with left border.",
	},
};
