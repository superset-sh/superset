import { Redirect } from "expo-router";
import { useSession } from "@/lib/auth/client";
import SignInScreen from "@/screens/(auth)/sign-in";

export default function SignInRoute() {
	const { data: session } = useSession();

	if (session) {
		return <Redirect href="/" />;
	}

	return <SignInScreen />;
}
