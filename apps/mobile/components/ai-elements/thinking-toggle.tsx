import { BrainIcon, CheckIcon, ChevronDownIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

interface ThinkingLevelOption {
	value: ThinkingLevel;
	label: string;
	description: string;
}

const DEFAULT_OPTION: ThinkingLevelOption = {
	value: "off",
	label: "Off",
	description: "No extended thinking",
};

const THINKING_LEVELS: ThinkingLevelOption[] = [
	DEFAULT_OPTION,
	{ value: "low", label: "Low", description: "Minimal reasoning effort" },
	{
		value: "medium",
		label: "Medium",
		description: "Moderate reasoning effort",
	},
	{ value: "high", label: "High", description: "Thorough reasoning effort" },
	{
		value: "xhigh",
		label: "Max",
		description: "Maximum reasoning effort",
	},
];

export type ThinkingToggleProps = Omit<
	React.ComponentProps<typeof Button>,
	"onPress"
> & {
	level: ThinkingLevel;
	onLevelChange: (level: ThinkingLevel) => void;
};

export const ThinkingToggle = ({
	level,
	onLevelChange,
	className,
	...props
}: ThinkingToggleProps) => {
	const isActive = level !== "off";
	const activeOption =
		THINKING_LEVELS.find((o) => o.value === level) ?? DEFAULT_OPTION;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					accessibilityLabel={`Extended thinking: ${activeOption.label}`}
					className={cn("gap-1 px-2", isActive && "bg-accent", className)}
					variant="ghost"
					{...props}
				>
					<Icon as={BrainIcon} className="size-3.5" />
					<Text className="text-xs">{activeOption.label}</Text>
					<Icon as={ChevronDownIcon} className="size-2.5 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{THINKING_LEVELS.map((option) => {
					const isSelected = option.value === level;
					return (
						<DropdownMenuItem
							className="items-center gap-2"
							key={option.value}
							onPress={() => onLevelChange(option.value)}
						>
							<View className="flex-1 gap-0.5">
								<Text className="font-medium text-sm">{option.label}</Text>
								<Text className="text-muted-foreground text-xs">
									{option.description}
								</Text>
							</View>
							{isSelected ? (
								<Icon as={CheckIcon} className="size-4 shrink-0" />
							) : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
