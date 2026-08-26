import { useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { useSession } from "@/lib/auth/client";
import { HomeScreen } from "@/screens/(authenticated)/(home)/home";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { HomeConnectHostScreen } from "@/screens/(authenticated)/(home)/home-connect-host";
import { HomePaywallScreen } from "@/screens/(authenticated)/(home)/home-paywall";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";

export default function HomeIndex() {
	const { data: session } = useSession();
	const hosts = useOrgHostsQuery();
	const scope = useWorkspaceScope();
	const hasHydrated = useWorkspacesFilterStore((store) => store.hasHydrated);

	if (session && !session.session.plan) {
		return <HomePaywallScreen />;
	}

	// An organization with no device of yours has no workspaces to list and
	// nowhere for the composer to send: the home screen renders as an empty
	// list under a dead composer. Setup happens on a desktop, so say so there.
	// Only once the query has actually answered — an empty list while it is
	// still pending is not an answer. Cloud is exempt: its workspaces exist
	// without a machine of yours behind them.
	if (
		hasHydrated &&
		scope === "host" &&
		hosts.isSuccess &&
		hosts.data.length === 0
	) {
		return <HomeConnectHostScreen />;
	}

	return <HomeScreen />;
}
