interface InitialRead<Value> {
	value: Value;
	// The query cache outlives a sign-out, so a value read at mount can belong
	// to the previous account. Only a read that landed after mount counts.
	isFresh: boolean;
	hasFailed: boolean;
}

interface ResolveInitialWindowOrganizationInput {
	windowOrganization: InitialRead<string | null | undefined>;
	memberOrganizationIds: InitialRead<readonly string[] | null | undefined>;
	sessionOrganizationId: string | null | undefined;
	// The membership saved beside the sign-in token on this machine, and only
	// when it was saved for the token in use. Null otherwise.
	savedMemberOrganizationIds: readonly string[] | null;
	isMemberListUnavailable: boolean;
}

type InitialWindowOrganization =
	| { status: "waiting" }
	| { status: "failed" }
	| { status: "resolved"; organizationId: string };

const awaiting = (read: InitialRead<unknown>): InitialWindowOrganization =>
	read.hasFailed ? { status: "failed" } : { status: "waiting" };

export function resolveInitialWindowOrganization({
	windowOrganization,
	memberOrganizationIds,
	sessionOrganizationId,
	savedMemberOrganizationIds,
	isMemberListUnavailable,
}: ResolveInitialWindowOrganizationInput): InitialWindowOrganization {
	if (!windowOrganization.isFresh) return awaiting(windowOrganization);
	const windowOrganizationId = windowOrganization.value ?? null;

	if (windowOrganizationId != null) {
		if (!memberOrganizationIds.isFresh || memberOrganizationIds.value == null) {
			// Work on this machine does not need the server. While the server
			// cannot say who the account belongs to, the membership it confirmed
			// last time vouches for the window's organization. Failing that, the
			// session's organization is the account's by construction.
			if (isMemberListUnavailable) {
				if (savedMemberOrganizationIds?.includes(windowOrganizationId)) {
					return { status: "resolved", organizationId: windowOrganizationId };
				}
				if (sessionOrganizationId) {
					return { status: "resolved", organizationId: sessionOrganizationId };
				}
			}
			return awaiting(memberOrganizationIds);
		}
		if (memberOrganizationIds.value.includes(windowOrganizationId)) {
			return { status: "resolved", organizationId: windowOrganizationId };
		}
	}

	return sessionOrganizationId
		? { status: "resolved", organizationId: sessionOrganizationId }
		: { status: "waiting" };
}
