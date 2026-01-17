import type { SelectMember, SelectUser } from "@superset/db/schema/auth";
import type { OrganizationRole } from "@superset/shared/auth";

export type TeamMember = SelectUser &
	SelectMember & {
		memberId: string;
		role: OrganizationRole;
	};
