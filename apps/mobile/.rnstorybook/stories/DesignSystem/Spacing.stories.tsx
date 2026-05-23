import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";

const SPACING_STEPS = [
	{ token: "0.5", className: "w-0.5", px: 2 },
	{ token: "1", className: "w-1", px: 4 },
	{ token: "2", className: "w-2", px: 8 },
	{ token: "3", className: "w-3", px: 12 },
	{ token: "4", className: "w-4", px: 16 },
	{ token: "5", className: "w-5", px: 20 },
	{ token: "6", className: "w-6", px: 24 },
	{ token: "8", className: "w-8", px: 32 },
	{ token: "10", className: "w-10", px: 40 },
	{ token: "12", className: "w-12", px: 48 },
	{ token: "16", className: "w-16", px: 64 },
	{ token: "20", className: "w-20", px: 80 },
	{ token: "24", className: "w-24", px: 96 },
	{ token: "32", className: "w-32", px: 128 },
];

const RADIUS_STEPS = [
	{ token: "rounded-none", className: "rounded-none" },
	{ token: "rounded-sm", className: "rounded-sm" },
	{ token: "rounded (--radius: 0.5rem)", className: "rounded" },
	{ token: "rounded-md", className: "rounded-md" },
	{ token: "rounded-lg", className: "rounded-lg" },
	{ token: "rounded-xl", className: "rounded-xl" },
	{ token: "rounded-full", className: "rounded-full" },
];

function SpacingGallery() {
	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-4">
				<Text variant="h3" className="mb-2">
					Spacing scale
				</Text>
				<Text variant="muted" className="mb-6">
					Tailwind unit = 4px. Tokens read from global.css; do not override.
				</Text>
				{SPACING_STEPS.map((s) => (
					<View key={s.token} className="mb-3 flex-row items-center gap-3">
						<View className={`h-4 ${s.className} bg-primary rounded-sm`} />
						<Text variant="small" className="text-muted-foreground">
							{s.token} · {s.px}px
						</Text>
					</View>
				))}

				<Text variant="h3" className="mt-8 mb-4">
					Border radius
				</Text>
				<View className="flex-row flex-wrap gap-3">
					{RADIUS_STEPS.map((r) => (
						<View key={r.token} className="items-center">
							<View className={`h-16 w-16 bg-primary ${r.className}`} />
							<Text variant="small" className="text-muted-foreground mt-1">
								{r.token}
							</Text>
						</View>
					))}
				</View>
			</View>
		</ScrollView>
	);
}

const meta: Meta<typeof SpacingGallery> = {
	title: "Design System/Spacing",
	component: SpacingGallery,
};

export default meta;

type Story = StoryObj<typeof SpacingGallery>;

export const Default: Story = {};
