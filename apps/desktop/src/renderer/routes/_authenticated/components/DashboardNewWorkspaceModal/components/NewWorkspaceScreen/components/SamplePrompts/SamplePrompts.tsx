import { SparklesIcon } from "lucide-react";
import { track } from "renderer/lib/analytics";
import { SAMPLE_PROMPTS } from "./constants";

interface SamplePromptsProps {
	onSelect: (prompt: string) => void;
}

export function SamplePrompts({ onSelect }: SamplePromptsProps) {
	return (
		<div className="flex flex-col items-start gap-0.5 px-1 pb-2">
			{SAMPLE_PROMPTS.map((sample) => (
				<button
					key={sample.id}
					type="button"
					className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					onClick={() => {
						track("new_workspace_sample_prompt_clicked", {
							prompt_id: sample.id,
						});
						onSelect(sample.prompt);
					}}
				>
					<SparklesIcon className="size-3.5 shrink-0" />
					{sample.label}
				</button>
			))}
		</div>
	);
}
