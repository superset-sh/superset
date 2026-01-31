import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { api } from "@/trpc/server";
import { NewSessionForm } from "./components/NewSessionForm";

export default async function NewCloudSessionPage() {
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

	// Fetch GitHub installation and repositories
	const [githubInstallation, githubRepositories] = await Promise.all([
		trpc.integration.github.getInstallation.query({ organizationId }),
		trpc.integration.github.listRepositories.query({ organizationId }),
	]);

	return (
		<NewSessionForm
			organizationId={organizationId}
			githubInstallation={githubInstallation}
			githubRepositories={githubRepositories}
		/>
	);
}
