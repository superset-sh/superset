import { Redirect } from "expo-router";
import { useSession } from "@/lib/auth/client";

export default function Index() {
	const { data: session } = useSession();

	if (!session) {
		return <Redirect href="/(auth)/sign-in" />;
	}

	return <Redirect href="/(authenticated)" />;
}
