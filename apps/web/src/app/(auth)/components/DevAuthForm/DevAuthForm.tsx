"use client";

import { authClient } from "@superset/auth/client";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface DevAuthFormProps {
	mode: "sign-in" | "sign-up";
	callbackURL: string;
}

export function DevAuthForm({ mode, callbackURL }: DevAuthFormProps) {
	const router = useRouter();
	const [email, setEmail] = useState(
		mode === "sign-up" ? "" : "admin@local.test",
	);
	const [password, setPassword] = useState(
		mode === "sign-up" ? "" : "supersetdev",
	);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setError(null);

		try {
			if (mode === "sign-up") {
				const res = await authClient.signUp.email({
					email,
					password,
					name: name || email.split("@")[0] || "Dev User",
				});
				if (res.error) throw new Error(res.error.message);
			} else {
				const res = await authClient.signIn.email({ email, password });
				if (res.error) throw new Error(res.error.message);
			}
			router.push(callbackURL);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Authentication failed";
			setError(message);
			setSubmitting(false);
		}
	};

	return (
		<form onSubmit={onSubmit} className="grid gap-3 rounded-md border p-4">
			<p className="text-muted-foreground text-xs">
				Dev only — email + password auth
			</p>
			{mode === "sign-up" && (
				<div className="grid gap-1.5">
					<Label htmlFor="name" className="text-xs">
						Name
					</Label>
					<Input
						id="name"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Optional"
					/>
				</div>
			)}
			<div className="grid gap-1.5">
				<Label htmlFor="email" className="text-xs">
					Email
				</Label>
				<Input
					id="email"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="password" className="text-xs">
					Password
				</Label>
				<Input
					id="password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					minLength={8}
				/>
			</div>
			{error && <p className="text-destructive text-xs">{error}</p>}
			<Button type="submit" disabled={submitting} className="w-full">
				{submitting ? "..." : mode === "sign-up" ? "Create account" : "Sign in"}
			</Button>
		</form>
	);
}
