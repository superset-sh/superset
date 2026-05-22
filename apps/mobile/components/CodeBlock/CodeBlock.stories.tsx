import type { Meta, StoryObj } from "@storybook/react-native";
import { CodeBlock } from "./CodeBlock";

const SAMPLE_TS = `export const billing = router({
  getInvoice: publicProcedure
    .input(z.string())
    .query(({ input }) => db.invoice.find(input)),
});`;

const SAMPLE_BASH = `bun install
bun run typecheck
bun run lint:fix`;

const SAMPLE_LONG = Array.from({ length: 40 })
	.map((_, i) => `console.log("line ${i + 1} of the long code block");`)
	.join("\n");

const meta: Meta<typeof CodeBlock> = {
	title: "Molecules/CodeBlock",
	component: CodeBlock,
	parameters: {
		docs: {
			description: {
				component:
					"Fenced code block for assistant messages. Language label (mono uppercase) + Copy IconButton + Separator + monospace body. Copy shows check icon + 'Copied' for 1500ms. Composes IconButton + Separator + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		code: SAMPLE_TS,
		language: "typescript",
		overflow: false,
		bare: false,
	},
	argTypes: {
		code: { control: "text" },
		language: { control: "text" },
		overflow: {
			control: "boolean",
			description: "Internal scroll for long code",
		},
		bare: { control: "boolean", description: "No border (only sunken bg)" },
	},
};

export default meta;

type Story = StoryObj<typeof CodeBlock>;

export const Typescript: Story = {};

export const Bash: Story = {
	args: { code: SAMPLE_BASH, language: "bash" },
};

export const NoLanguage: Story = {
	args: { code: SAMPLE_BASH, language: undefined },
};

export const Overflow: Story = {
	args: { code: SAMPLE_LONG, overflow: true, language: "javascript" },
};

export const Bare: Story = {
	args: { bare: true },
};
