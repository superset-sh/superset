import type { Meta, StoryObj } from "@storybook/react-native";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

function SelectShowcase() {
	return (
		<Select defaultValue={{ value: "sonnet", label: "Sonnet 4.6" }}>
			<SelectTrigger className="w-56">
				<SelectValue placeholder="Pick a model" />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectLabel>Anthropic</SelectLabel>
					<SelectItem value="opus" label="Opus 4.7">
						Opus 4.7
					</SelectItem>
					<SelectItem value="sonnet" label="Sonnet 4.6">
						Sonnet 4.6
					</SelectItem>
					<SelectItem value="haiku" label="Haiku 4.5">
						Haiku 4.5
					</SelectItem>
				</SelectGroup>
				<SelectGroup>
					<SelectLabel>OpenAI</SelectLabel>
					<SelectItem value="gpt5" label="GPT-5.5">
						GPT-5.5
					</SelectItem>
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

const meta: Meta<typeof SelectShowcase> = {
	title: "Components/Select",
	component: SelectShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Native-feeling select dropdown. Used for inline form selects in settings. Composer model picker uses Popover + radio rows for visual richness instead — but Select is appropriate for simple key-value choices.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof SelectShowcase>;

export const ModelPicker: Story = {};
