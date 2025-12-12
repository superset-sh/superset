"use client";

import { useSignIn } from "@clerk/nextjs";
import { Button } from "@superset/ui/button";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { env } from "@/env";

export default function SignInPage() {
	const { signIn, isLoaded } = useSignIn();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signInWithGoogle = async () => {
		if (!isLoaded) return;

		setIsLoading(true);
		setError(null);

		try {
			await signIn.authenticateWithRedirect({
				strategy: "oauth_google",
				redirectUrl: "/sso-callback",
				redirectUrlComplete: "/",
			});
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Failed to sign in. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
				<p className="text-muted-foreground text-sm">
					Sign in to continue to Superset
				</p>
			</div>
			<div className="grid gap-6">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				<Button
					variant="outline"
					disabled={!isLoaded || isLoading}
					onClick={signInWithGoogle}
					className="w-full"
				>
					<Image
						src="/assets/social/google.svg"
						alt="Google"
						width={16}
						height={16}
						className="mr-2"
					/>
					{isLoading ? "Loading..." : "Sign in with Google"}
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
					Don&apos;t have an account?{" "}
					<Link
						href="/sign-up"
						className="hover:text-primary underline underline-offset-4"
					>
						Sign up
					</Link>
				</p>
			</div>
		</div>
	);
}
