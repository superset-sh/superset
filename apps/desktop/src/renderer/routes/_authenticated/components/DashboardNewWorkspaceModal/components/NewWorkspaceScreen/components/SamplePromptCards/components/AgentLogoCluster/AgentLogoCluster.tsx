import { ScrollTextIcon } from "lucide-react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";

/** Overlapping real agent logos — the agent-docs card is about the agents
 * themselves, so their marks carry more signal than a generic glyph. */
export function AgentLogoCluster() {
	const claudeIcon = usePresetIcon("claude");
	const codexIcon = usePresetIcon("codex");
	if (!claudeIcon || !codexIcon) {
		return (
			<ScrollTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
		);
	}
	return (
		<span className="flex shrink-0 items-center">
			<img src={claudeIcon} alt="" className="size-3.5 object-contain" />
			<img src={codexIcon} alt="" className="-ml-1 size-3.5 object-contain" />
		</span>
	);
}
