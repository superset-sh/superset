import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/trpc/server";
import { CloudHomePage } from "./components/CloudHomePage";

export default async function CloudPage() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/sign-in");
	}

	const organizationId = session.session.activeOrganizationId;
	if (!organizationId) {
		redirect("/");
	}

	const trpc = await api();

	const [workspaces, githubInstallation, githubRepositories] =
		await Promise.all([
			trpc.cloudWorkspace.list.query(),
			trpc.integration.github.getInstallation.query({ organizationId }),
			trpc.integration.github.listRepositories.query({ organizationId }),
		]);

	return (
		<CloudHomePage
			organizationId={organizationId}
			workspaces={workspaces}
			hasGitHubInstallation={!!githubInstallation && !githubInstallation.suspended}
			githubRepositories={githubRepositories}
		/>
	);
}
