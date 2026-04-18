import { attributeReferral } from "@superset/auth/referral";
import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AgentsRootPage({
	searchParams,
}: {
	searchParams: Promise<{ ref?: string }>;
}) {
	const { ref } = await searchParams;
	if (ref) {
		const session = await auth.api.getSession({ headers: await headers() });
		if (session?.user) {
			try {
				await attributeReferral({
					refereeUser: {
						id: session.user.id,
						createdAt: new Date(session.user.createdAt),
					},
					code: ref,
				});
			} catch (error) {
				console.error("[referral] Post-OAuth attribution failed:", error);
			}
		}
	}
	redirect("/agents");
}
