import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";

type Swatch = {
	name: string;
	bg: string;
	fg: string;
	borderClass?: string;
};

const SEMANTIC_PAIRS: Swatch[] = [
	{
		name: "background / foreground",
		bg: "bg-background",
		fg: "text-foreground",
		borderClass: "border-border",
	},
	{
		name: "card / card-foreground",
		bg: "bg-card",
		fg: "text-card-foreground",
		borderClass: "border-border",
	},
	{
		name: "popover / popover-foreground",
		bg: "bg-popover",
		fg: "text-popover-foreground",
		borderClass: "border-border",
	},
	{
		name: "primary / primary-foreground",
		bg: "bg-primary",
		fg: "text-primary-foreground",
	},
	{
		name: "secondary / secondary-foreground",
		bg: "bg-secondary",
		fg: "text-secondary-foreground",
	},
	{
		name: "muted / muted-foreground",
		bg: "bg-muted",
		fg: "text-muted-foreground",
	},
	{
		name: "accent / accent-foreground",
		bg: "bg-accent",
		fg: "text-accent-foreground",
	},
	{
		name: "destructive / destructive-foreground",
		bg: "bg-destructive",
		fg: "text-destructive-foreground",
	},
];

const UTILITY_TOKENS: Swatch[] = [
	{
		name: "border",
		bg: "bg-background",
		fg: "text-foreground",
		borderClass: "border-border",
	},
	{ name: "input", bg: "bg-input", fg: "text-foreground" },
	{
		name: "ring",
		bg: "bg-background",
		fg: "text-foreground",
		borderClass: "border-ring",
	},
];

function SwatchRow({ swatch }: { swatch: Swatch }) {
	return (
		<View
			className={`mb-2 flex-row items-center rounded-md border p-4 ${swatch.bg} ${swatch.borderClass ?? "border-transparent"}`}
		>
			<View className="flex-1">
				<Text className={`font-semibold ${swatch.fg}`}>{swatch.name}</Text>
				<Text className={`text-xs ${swatch.fg} opacity-70`}>
					{swatch.bg} · {swatch.fg}
				</Text>
			</View>
		</View>
	);
}

function ColorsGallery() {
	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-4">
				<Text variant="h3" className="mb-2">
					Semantic pairs
				</Text>
				<Text variant="muted" className="mb-4">
					Tokens are defined in apps/mobile/global.css under @variant
					light/dark. Do not redefine.
				</Text>
				{SEMANTIC_PAIRS.map((s) => (
					<SwatchRow key={s.name} swatch={s} />
				))}

				<Text variant="h3" className="mt-6 mb-4">
					Utility tokens
				</Text>
				{UTILITY_TOKENS.map((s) => (
					<SwatchRow key={s.name} swatch={s} />
				))}
			</View>
		</ScrollView>
	);
}

const meta: Meta<typeof ColorsGallery> = {
	title: "Design System/Colors",
	component: ColorsGallery,
};

export default meta;

type Story = StoryObj<typeof ColorsGallery>;

export const Default: Story = {};
