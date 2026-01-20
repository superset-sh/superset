import { Redirect } from "expo-router";
import { useSession } from "@/lib/auth/client";
import HomeScreen from "@/screens/index";

export default function RootIndex() {
	const { data: session } = useSession();

	if (!session) {
		return <Redirect href="/(auth)/sign-in" />;
	}

	return <HomeScreen />;
}
