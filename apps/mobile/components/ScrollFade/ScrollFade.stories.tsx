import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ScrollFade } from "./ScrollFade";

function ScrollFadeShowcase({
	direction,
	surface,
	size,
	hidden,
}: {
	direction: "top" | "bottom";
	surface: "page" | "soft" | "overlay";
	size: "sm" | "md" | "lg";
	hidden: boolean;
}) {
	const surfaceClass =
		surface === "page"
			? "bg-background"
			: surface === "soft"
				? "bg-card"
				: "bg-popover";
	return (
		<View
			className={cn(
				"relative w-full max-w-sm h-64 overflow-hidden rounded-lg border border-border",
				surfaceClass,
			)}
		>
			<ScrollView className="p-4">
				{Array.from({ length: 20 }, (_, i) => `line-${i}`).map((id, idx) => (
					<Text key={id} className="py-1">
						Line {idx + 1} — scrollable content beneath the fade
					</Text>
				))}
			</ScrollView>
			<ScrollFade
				direction={direction}
				surface={surface}
				size={size}
				hidden={hidden}
			/>
		</View>
	);
}

const meta: Meta<typeof ScrollFadeShowcase> = {
	title: "Components/ScrollFade",
	component: ScrollFadeShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Theme-aware gradient overlay (expo-linear-gradient) anchored to the top or bottom edge of a scroll container. Surface variant matches the underlying background (page/soft/overlay) so the opaque stop blends seamlessly under both light + dark themes. `hidden` triggers a 120ms opacity transition via Reanimated. Always `pointerEvents=none` + `aria-hidden`.",
			},
		},
		layout: "centered",
	},
	args: {
		direction: "top",
		surface: "page",
		size: "md",
		hidden: false,
	},
	argTypes: {
		direction: {
			control: { type: "select" },
			options: ["top", "bottom"],
			description: "Edge of scroll container to anchor the fade against",
		},
		surface: {
			control: { type: "select" },
			options: ["page", "soft", "overlay"],
			description:
				"Underlying surface — page (default, bg-background) · soft (bg-card) · overlay (bg-popover)",
		},
		size: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
			description: "sm=24px · md=40px (default) · lg=64px fade height",
		},
		hidden: {
			control: "boolean",
			description:
				"Triggers a 120ms opacity-0 transition (apply when scrolled to the boundary)",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ScrollFadeShowcase>;

export const TopFade: Story = {};

export const BottomFade: Story = { args: { direction: "bottom" } };

export const OnSoftSurface: Story = { args: { surface: "soft" } };

export const OnOverlaySurface: Story = { args: { surface: "overlay" } };

export const SmallFade: Story = { args: { size: "sm" } };
export const LargeFade: Story = { args: { size: "lg" } };

export const Hidden: Story = {
	args: { hidden: true },
	parameters: {
		docs: {
			description: {
				story:
					"Fade scrolled into hidden state — opacity transitions 1→0 over 120ms.",
			},
		},
	},
};
