"use client";

import { authClient } from "@superset/auth/client";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { DevSignInButton as SharedDevSignInButton } from "@superset/ui/dev-sign-in-button";
import { useRouter } from "next/navigation";

interface DevSignInButtonProps {
	callbackURL: string;
}

export function DevSignInButton({ callbackURL }: DevSignInButtonProps) {
	const router = useRouter();

	const onSignIn = async () => {
		let res = await authClient.signIn.email({
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});
		if (res.error) {
			const signUpRes = await authClient.signUp.email({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
				name: DEV_NAME,
			});
			if (signUpRes.error) throw new Error(signUpRes.error.message);
			res = await authClient.signIn.email({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
		}
		if (res.error) throw new Error(res.error.message);
		router.push(callbackURL);
	};

	return <SharedDevSignInButton onSignIn={onSignIn} />;
}
