import { SUPERSET_MANAGED_SKILLS } from "@superset/shared/plugins";
import { Badge } from "@superset/ui/badge";
import { useState } from "react";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import { SkillPreviewDialog } from "./components/SkillPreviewDialog";

interface ManagedSkill {
	name: string;
	description: string;
}

/**
 * Read-only for the MVP: these skills ship inside the managed Superset
 * plugin and are provisioned into every agent CLI automatically
 * (packages/agent-setup). Installable skill plugins come later.
 */
export function SkillsList() {
	const [previewSkill, setPreviewSkill] = useState<ManagedSkill | null>(null);

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				Skills ship with the Superset plugin and are kept up to date
				automatically in every agent you use. Click one to preview it.
			</p>
			<div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
				{SUPERSET_MANAGED_SKILLS.map((skill) => (
					<button
						key={skill.name}
						type="button"
						onClick={() => setPreviewSkill(skill)}
						className="flex items-center gap-3 p-3 text-left transition-colors hover:bg-fill-hover"
					>
						<SkillIcon skillName={skill.name} />
						<div className="min-w-0 flex-1">
							<div className="text-sm font-medium text-foreground">
								{skill.name}
							</div>
							<p className="truncate text-xs text-muted-foreground">
								{skill.description}
							</p>
						</div>
						<Badge variant="secondary" className="shrink-0">
							Managed
						</Badge>
					</button>
				))}
			</div>
			<SkillPreviewDialog
				skill={previewSkill}
				onClose={() => setPreviewSkill(null)}
			/>
		</div>
	);
}
