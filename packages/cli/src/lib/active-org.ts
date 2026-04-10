import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "./api-client";

export async function getActiveOrgId(api: ApiClient): Promise<string> {
	const org = await api.user.myOrganization.query();
	if (!org) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	return org.id;
}
