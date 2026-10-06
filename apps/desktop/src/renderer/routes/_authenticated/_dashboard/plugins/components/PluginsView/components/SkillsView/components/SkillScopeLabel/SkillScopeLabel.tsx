import { Trans } from "@lingui/react/macro";
import type { SkillScope } from "../../hooks/useSkills";

export function SkillScopeLabel({ scope }: { scope: SkillScope }) {
	switch (scope) {
		case "project":
			return <Trans>Project</Trans>;
		case "personal":
			return <Trans>Personal</Trans>;
		case "system":
			return <Trans>System</Trans>;
	}
}
