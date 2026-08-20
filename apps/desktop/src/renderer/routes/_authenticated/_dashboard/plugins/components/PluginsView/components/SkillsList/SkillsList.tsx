import { SUPERSET_MANAGED_SKILLS } from "@superset/shared/plugins";
import { Badge } from "@superset/ui/badge";
import { LuSparkles } from "react-icons/lu";

/**
 * Read-only for the MVP: these skills ship inside the managed Superset
 * plugin and are provisioned into every agent CLI automatically
 * (packages/agent-setup). Installable skill plugins come later.
 */
export function SkillsList() {
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				Skills ship with the Superset plugin and are kept up to date
				automatically in every agent you use.
			</p>
			<div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
				{SUPERSET_MANAGED_SKILLS.map((skill) => (
					<div key={skill.name} className="flex items-center gap-3 p-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
							<LuSparkles className="size-4 text-muted-foreground" />
						</div>
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
					</div>
				))}
			</div>
		</div>
	);
}
