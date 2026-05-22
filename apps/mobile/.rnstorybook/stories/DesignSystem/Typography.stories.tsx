import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";

const VARIANTS = [
	{ variant: "h1" as const, sample: "Heading 1 — text-4xl extrabold" },
	{ variant: "h2" as const, sample: "Heading 2 — text-3xl semibold" },
	{ variant: "h3" as const, sample: "Heading 3 — text-2xl semibold" },
	{ variant: "h4" as const, sample: "Heading 4 — text-xl semibold" },
	{
		variant: "p" as const,
		sample: "Paragraph — leading-7, default body text.",
	},
	{ variant: "lead" as const, sample: "Lead — muted-foreground, text-xl" },
	{ variant: "large" as const, sample: "Large — text-lg semibold" },
	{ variant: "default" as const, sample: "Default — text-base" },
	{ variant: "small" as const, sample: "Small — text-sm medium" },
	{
		variant: "muted" as const,
		sample: "Muted — text-muted-foreground text-sm",
	},
	{ variant: "code" as const, sample: "const code = 'inline mono semibold'" },
	{
		variant: "blockquote" as const,
		sample: "Italic blockquote with left border.",
	},
];

function TypographyGallery() {
	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-4">
				<Text variant="h3" className="mb-2">
					Type scale
				</Text>
				<Text variant="muted" className="mb-6">
					Variants from components/ui/text.tsx. All read tokens defined in
					global.css.
				</Text>
				{VARIANTS.map(({ variant, sample }) => (
					<View key={variant} className="mb-6">
						<Text variant="small" className="text-muted-foreground mb-1">
							variant="{variant}"
						</Text>
						<Text variant={variant}>{sample}</Text>
					</View>
				))}
			</View>
		</ScrollView>
	);
}

const meta: Meta<typeof TypographyGallery> = {
	title: "Design System/Typography",
	component: TypographyGallery,
};

export default meta;

type Story = StoryObj<typeof TypographyGallery>;

export const Default: Story = {};
