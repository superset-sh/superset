import type { Meta, StoryObj } from "@storybook/react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";

function ProgressShowcase({
	value,
	animated,
}: {
	value: number;
	animated: boolean;
}) {
	const [v, setV] = useState(value);
	useEffect(() => {
		if (!animated) {
			setV(value);
			return;
		}
		setV(0);
		const id = setInterval(() => {
			setV((current) => {
				if (current >= 100) return 0;
				return current + 5;
			});
		}, 200);
		return () => clearInterval(id);
	}, [animated, value]);

	return (
		<View className="w-full gap-2">
			<Progress value={v} />
			<Text variant="muted" className="text-xs">
				{Math.round(v)}%
			</Text>
		</View>
	);
}

const meta: Meta<typeof ProgressShowcase> = {
	title: "Components/Progress",
	component: ProgressShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Linear progress bar. Used during slash-command preview loading (UC-COMP-01 §C), long-running tool calls. Spring-animated on native.",
			},
		},
	},
	args: {
		value: 35,
		animated: false,
	},
	argTypes: {
		value: { control: { type: "range", min: 0, max: 100, step: 5 } },
		animated: {
			control: "boolean",
			description: "Auto-cycles 0→100 on a 4s loop for animation inspection",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ProgressShowcase>;

export const Static: Story = {};
export const Half: Story = { args: { value: 50 } };
export const Full: Story = { args: { value: 100 } };
export const Animating: Story = { args: { animated: true } };
