import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";

function AvatarShowcase({
	src,
	fallback,
	size,
}: {
	src?: string;
	fallback: string;
	size: "sm" | "md" | "lg" | "xl";
}) {
	const sizeClass = {
		sm: "size-6",
		md: "size-8",
		lg: "size-12",
		xl: "size-16",
	}[size];

	return (
		<View className="flex-row items-center gap-3">
			<Avatar className={sizeClass} alt={fallback}>
				{src ? <AvatarImage source={{ uri: src }} /> : null}
				<AvatarFallback>
					<Text className="text-foreground text-xs font-semibold">
						{fallback}
					</Text>
				</AvatarFallback>
			</Avatar>
			<Text variant="small" className="text-muted-foreground">
				{size}
			</Text>
		</View>
	);
}

const meta: Meta<typeof AvatarShowcase> = {
	title: "Components/Avatar",
	component: AvatarShowcase,
	parameters: {
		docs: {
			description: {
				component:
					'Round avatar with optional image + fallback initial(s). Used for assistant message head ("A") and any user/identity surface. Sized variants supported via className.',
			},
		},
	},
	args: {
		fallback: "A",
		size: "md",
	},
	argTypes: {
		src: { control: "text" },
		fallback: { control: "text" },
		size: {
			control: { type: "select" },
			options: ["sm", "md", "lg", "xl"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof AvatarShowcase>;

export const FallbackOnly: Story = {
	args: { fallback: "A" },
};

export const WithImage: Story = {
	args: {
		src: "https://i.pravatar.cc/100?img=12",
		fallback: "JR",
	},
};

export const Small: Story = { args: { size: "sm", fallback: "S" } };
export const Large: Story = { args: { size: "lg", fallback: "L" } };
export const ExtraLarge: Story = { args: { size: "xl", fallback: "XL" } };

export const AssistantHead: Story = {
	args: { fallback: "A", size: "md" },
	parameters: {
		docs: {
			description: {
				story:
					"Canonical chat usage — left-side head on assistant message (UC-RENDER-01).",
			},
		},
	},
};
