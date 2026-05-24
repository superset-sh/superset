import {
	getDeploymentProfile,
	isStrictProfile,
} from "@superset/shared/deployment-profile";
import { NextResponse } from "next/server";
import { getIntegrationStatuses } from "../../../lib/integration-status";

export function GET() {
	const profile = getDeploymentProfile();
	if (isStrictProfile(profile)) {
		return NextResponse.json({ ok: true });
	}

	return NextResponse.json({
		ok: true,
		profile,
		integrations: getIntegrationStatuses(),
	});
}
