"use client";

import { Button } from "@superset/ui/button";
import Image from "next/image";
import Link from "next/link";

import { env } from "@/env";

export default function SignUpPage() {
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
			<div className="grid gap-6">
				<a href="/api/auth/login?connection=google-oauth2&screen_hint=signup">
					<Button variant="outline" className="w-full">
						<Image
							src="/assets/social/google.svg"
							alt="Google"
							width={16}
							height={16}
							className="mr-2"
						/>
						Sign up with Google
					</Button>
				</a>
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
