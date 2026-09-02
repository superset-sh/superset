"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "@/env";

export default function SignUpPage() {
	const { t } = useLingui();
	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signUpWithGoogle = async () => {
		setIsLoadingGoogle(true);
		setError(null);

		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: env.NEXT_PUBLIC_WEB_URL,
			});
		} catch (err) {
			console.error("Sign up failed:", err);
			setError(
				t({
					id: "web.signUp.error",
					message: "Failed to sign up. Please try again.",
				}),
			);
			setIsLoadingGoogle(false);
		}
	};

	const signUpWithGithub = async () => {
		setIsLoadingGithub(true);
		setError(null);

		try {
			await authClient.signIn.social({
				provider: "github",
				callbackURL: env.NEXT_PUBLIC_WEB_URL,
			});
		} catch (err) {
			console.error("Sign up failed:", err);
			setError(
				t({
					id: "web.signUp.error",
					message: "Failed to sign up. Please try again.",
				}),
			);
			setIsLoadingGithub(false);
		}
	};

	const isLoading = isLoadingGoogle || isLoadingGithub;

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					<Trans id="web.signUp.title">Create an account</Trans>
				</h1>
				<p className="text-muted-foreground text-sm">
					<Trans id="web.signUp.subtitle">
						Sign up to get started with Superset
					</Trans>
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signUpWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? (
						<Trans id="web.signUp.loading">Loading...</Trans>
					) : (
						<Trans id="web.signUp.withGithub">Sign up with GitHub</Trans>
					)}
				</Button>
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signUpWithGoogle}
					className="w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? (
						<Trans id="web.signUp.loading">Loading...</Trans>
					) : (
						<Trans id="web.signUp.withGoogle">Sign up with Google</Trans>
					)}
				</Button>
				<p className="text-muted-foreground px-8 text-center text-sm">
					<Trans id="web.signUp.legal">
						By clicking continue, you agree to our{" "}
						<a
							href={`${env.NEXT_PUBLIC_MARKETING_URL}/terms`}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-primary underline underline-offset-4"
						>
							Terms of Service
						</a>{" "}
						and{" "}
						<a
							href={`${env.NEXT_PUBLIC_MARKETING_URL}/privacy`}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-primary underline underline-offset-4"
						>
							Privacy Policy
						</a>
						.
					</Trans>
				</p>
				<p className="text-center text-sm">
					<Trans id="web.signUp.signInPrompt">
						Already have an account?{" "}
						<Link
							href="/sign-in"
							className="hover:text-primary underline underline-offset-4"
						>
							Sign in
						</Link>
					</Trans>
				</p>
			</div>
		</div>
	);
}
