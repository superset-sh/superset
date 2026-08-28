import { useLingui } from "@lingui/react/macro";
import { SparklesIcon } from "lucide-react";
import { track } from "renderer/lib/analytics";
import { DismissSuggestionsButton } from "../DismissSuggestionsButton";
import type { SamplePrompt, SamplePromptTier } from "./constants";

interface SamplePromptsProps {
	prompts: SamplePrompt[];
	onSelect: (prompt: string) => void;
	onDismiss: () => void;
	canDismiss: boolean;
	tier: SamplePromptTier;
}

export function SamplePrompts({
	prompts,
	onSelect,
	onDismiss,
	canDismiss,
	tier,
}: SamplePromptsProps) {
	const { t } = useLingui();
	return (
		<div className="group relative flex flex-col items-start gap-0.5 px-1 pb-2">
			{canDismiss && <DismissSuggestionsButton onDismiss={onDismiss} />}
			{prompts.map((sample) => (
				<button
					key={sample.id}
					type="button"
					className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					onClick={() => {
						track("new_workspace_sample_prompt_clicked", {
							prompt_id: sample.id,
							layout: "rows",
							tier,
						});
						onSelect(sample.prompt);
					}}
				>
					<SparklesIcon className="size-3.5 shrink-0" />
					{t(sample.label)}
				</button>
			))}
		</div>
	);
}
