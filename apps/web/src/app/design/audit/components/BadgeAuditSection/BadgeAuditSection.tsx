import { Badge } from "@superset/ui/badge";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

export function BadgeAuditSection() {
	return (
		<ShowcaseSection
			id="badge-audit"
			index="02"
			title="Badge — same disease, smaller scale"
			description="31 files, 49 occurrences. Mostly clean; one repeated override."
		>
			<ComponentCard
				title="1 · Canonical, correct"
				importPath="PermissionsSettings.tsx"
				copyable={false}
				description="variant only, no className."
			>
				<Badge variant="secondary">Admin</Badge>
			</ComponentCard>

			<ComponentCard
				title="2 · Unofficial &quot;compact&quot; size"
				importPath="OrganizationSettings.tsx, PresetRow.tsx (copy-pasted ~5x)"
				copyable={false}
				description="className=&quot;text-[10px] h-4 px-1.5&quot; — badgeVariants has no size axis, so every caller re-derives one."
			>
				<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
					You
				</Badge>
			</ComponentCard>
		</ShowcaseSection>
	);
}
