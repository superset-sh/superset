import { useSession } from "@/lib/auth/client";
import { HomeScreen } from "@/screens/(authenticated)/(home)/home";
import { HomePaywallScreen } from "@/screens/(authenticated)/(home)/home-paywall";

export default function HomeIndex() {
	const { data: session } = useSession();
	if (session && !session.session.plan) {
		return <HomePaywallScreen />;
	}
	return <HomeScreen />;
}
