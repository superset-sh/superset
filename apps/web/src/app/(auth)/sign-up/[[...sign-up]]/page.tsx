"use client";

import { useSignUp } from "@clerk/nextjs";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import { env } from "@/env";

export default function SignUpPage() {
	const { signUp, isLoaded } = useSignUp();
	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signUpWithGoogle = async () => {
		if (!isLoaded) return;

		setIsLoadingGoogle(true);
		setError(null);

		try {
			await signUp.authenticateWithRedirect({
				strategy: "oauth_google",
				redirectUrl: "/sso-callback",
				redirectUrlComplete: "/",
			});
		} catch (err) {
			console.error("Sign up failed:", err);
			setError("Failed to sign up. Please try again.");
		} finally {
			setIsLoadingGoogle(false);
		}
	};

	const signUpWithGithub = async () => {
		if (!isLoaded) return;

		setIsLoadingGithub(true);
		setError(null);

		try {
			await signUp.authenticateWithRedirect({
				strategy: "oauth_github",
				redirectUrl: "/sso-callback",
				redirectUrlComplete: "/",
			});
		} catch (err) {
			console.error("Sign up failed:", err);
			setError("Failed to sign up. Please try again.");
		} finally {
			setIsLoadingGithub(false);
		}
	};

	const isLoading = isLoadingGoogle || isLoadingGithub;

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Create an account
				</h1>
				<p className="text-muted-foreground text-sm">
					Sign up to get started with Superset
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				<Button
					variant="outline"
					disabled={!isLoaded || isLoading}
					onClick={signUpWithGithub}
					className="w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Loading..." : "Sign up with GitHub"}
				</Button>
				<Button
					variant="outline"
					disabled={!isLoaded || isLoading}
					onClick={signUpWithGoogle}
					className="w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? "Loading..." : "Sign up with Google"}
				</Button>
				<p className="text-muted-foreground px-8 text-center text-sm">
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
				</p>
				<p className="text-center text-sm">
					Already have an account?{" "}
					<Link
						href="/sign-in"
						className="hover:text-primary underline underline-offset-4"
					>
						Sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
