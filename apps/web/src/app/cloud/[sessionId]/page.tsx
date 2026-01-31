import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { api } from "@/trpc/server";
import { CloudWorkspaceContent } from "./components/CloudWorkspaceContent";

interface CloudWorkspacePageProps {
	params: Promise<{ sessionId: string }>;
}

export default async function CloudWorkspacePage({
	params,
}: CloudWorkspacePageProps) {
	const { sessionId } = await params;

	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/sign-in");
	}

	const trpc = await api();

	try {
		const workspace = await trpc.cloudWorkspace.getBySessionId.query({
			sessionId,
		});

		return <CloudWorkspaceContent workspace={workspace} />;
	} catch {
		notFound();
	}
}
