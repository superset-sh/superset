import { currentUser } from "@clerk/nextjs/server";
import { COMPANY } from "@superset/shared/constants";
import { redirect } from "next/navigation";

/**
 * Layout for /test/* routes
 *
 * Gates access to internal test pages. Only allows authenticated users
 * with @superset.sh email addresses.
 */
export default async function TestLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await currentUser();

	// Require authentication
	if (!user) {
		redirect("/sign-in");
	}

	// Check if user has a @superset.sh email
	const primaryEmail = user.emailAddresses.find(
		(email) => email.id === user.primaryEmailAddressId,
	);

	const hasInternalEmail = primaryEmail?.emailAddress?.endsWith(
		COMPANY.EMAIL_DOMAIN,
	);

	if (!hasInternalEmail) {
		// Redirect unauthorized users to home
		redirect("/");
	}

	return <>{children}</>;
}
