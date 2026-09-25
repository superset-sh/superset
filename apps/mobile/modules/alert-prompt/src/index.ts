import { requireNativeModule } from "expo";

export type PromptOptions = {
	title: string;
	message?: string;
	defaultValue?: string;
	placeholder?: string;
	confirmText?: string;
	cancelText?: string;
	selectText?: boolean;
};

const AlertPromptModule = requireNativeModule("AlertPrompt");

export function prompt(options: PromptOptions): Promise<string | null> {
	return AlertPromptModule.prompt(options);
}
