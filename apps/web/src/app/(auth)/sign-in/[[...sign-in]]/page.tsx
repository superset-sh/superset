"use client";

import { authClient } from "@superset/auth/client";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "@/env";

const LAST_USED_METHOD_KEY = "superset-last-auth-method";

type AuthMethod = "github" | "google" | "dev";

function readLastUsedMethod(): AuthMethod | null {
	try {
		const stored = window.localStorage.getItem(LAST_USED_METHOD_KEY);
		return stored === "github" || stored === "google" || stored === "dev"
			? stored
			: null;
	} catch {
		return null;
	}
}

function rememberLastUsedMethod(method: AuthMethod) {
	try {
		window.localStorage.setItem(LAST_USED_METHOD_KEY, method);
	} catch {
		// localStorage unavailable; skip persisting
	}
}

export default function SignInPage() {
	const searchParams = useSearchParams();
	const redirect = searchParams.get("redirect");
	const callbackURL = redirect
		? `${env.NEXT_PUBLIC_WEB_URL}${redirect}`
		: env.NEXT_PUBLIC_WEB_URL;

	const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
	const [isLoadingGithub, setIsLoadingGithub] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUsedMethod, setLastUsedMethod] = useState<AuthMethod | null>(null);

	useEffect(() => {
		setLastUsedMethod(readLastUsedMethod());
	}, []);

	const signInWithGoogle = async () => {
		setIsLoadingGoogle(true);
		setError(null);
		rememberLastUsedMethod("google");

		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL,
			});
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Failed to sign in. Please try again.");
			setIsLoadingGoogle(false);
		}
	};

	const signInWithGithub = async () => {
		setIsLoadingGithub(true);
		setError(null);
		rememberLastUsedMethod("github");

		try {
			await authClient.signIn.social({
				provider: "github",
				callbackURL,
			});
		} catch (err) {
			console.error("Sign in failed:", err);
			setError("Failed to sign in. Please try again.");
			setIsLoadingGithub(false);
		}
	};

	const [isLoadingDev, setIsLoadingDev] = useState(false);

	const signInAsDev = async () => {
		setIsLoadingDev(true);
		setError(null);
		rememberLastUsedMethod("dev");

		try {
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
			window.location.href = callbackURL;
		} catch (err) {
			console.error("Dev sign in failed:", err);
			setError(err instanceof Error ? err.message : "Dev sign-in failed");
			setIsLoadingDev(false);
		}
	};

	const isLoading = isLoadingGoogle || isLoadingGithub || isLoadingDev;

	const lastUsedBadge = (
		<span className="bg-muted text-muted-foreground absolute right-3 rounded-full px-2 py-0.5 text-xs">
			Last used
		</span>
	);

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
				<p className="text-muted-foreground text-sm">
					Sign in to continue to Superset
				</p>
			</div>
			<div className="grid gap-4">
				{error && (
					<p className="text-destructive text-center text-sm">{error}</p>
				)}
				{process.env.NODE_ENV === "development" && (
					<Button
						variant="outline"
						disabled={isLoading}
						onClick={signInAsDev}
						className="relative w-full"
					>
						{isLoadingDev ? "Signing in..." : "Sign in as Local Admin (dev)"}
						{lastUsedMethod === "dev" && lastUsedBadge}
					</Button>
				)}
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signInWithGithub}
					className="relative w-full"
				>
					<FaGithub className="mr-2 size-4" />
					{isLoadingGithub ? "Loading..." : "Sign in with GitHub"}
					{lastUsedMethod === "github" && lastUsedBadge}
				</Button>
				<Button
					variant="outline"
					disabled={isLoading}
					onClick={signInWithGoogle}
					className="relative w-full"
				>
					<FcGoogle className="mr-2 size-4" />
					{isLoadingGoogle ? "Loading..." : "Sign in with Google"}
					{lastUsedMethod === "google" && lastUsedBadge}
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
