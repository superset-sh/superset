import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { ZapIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";

type SkillToolCallProps = {
	part: ToolPart;
	skillName: string;
};

export function SkillToolCall({ part, skillName }: SkillToolCallProps) {
	const isError = part.state === "output-error";
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";

	return (
		<ToolCallRow
			icon={ZapIcon}
			isError={isError}
			isPending={isPending}
			title={`Skill(${skillName})`}
		>
			{!isPending ? (
				<div className="py-1 pl-3">
					{isError ? (
						<p className="text-xs text-destructive">Failed to load skill</p>
					) : (
						<p className="text-xs text-muted-foreground">
							Successfully loaded skill
						</p>
					)}
				</div>
			) : undefined}
		</ToolCallRow>
	);
}
