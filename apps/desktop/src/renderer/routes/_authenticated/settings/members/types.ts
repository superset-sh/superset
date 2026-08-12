import type { OrganizationRole } from "@superset/shared/auth";

export type TeamMember = {
	memberId: string;
	userId: string;
	organizationId: string;
	role: OrganizationRole;
	createdAt: Date;
	name: string;
	email: string;
	image: string | null;
};
