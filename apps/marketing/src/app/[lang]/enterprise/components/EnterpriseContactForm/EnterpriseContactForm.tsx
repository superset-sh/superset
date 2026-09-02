"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { submitEnterpriseInquiry } from "../../actions";

export function EnterpriseContactForm() {
	const { t } = useLingui();
	const [formState, setFormState] = useState({
		name: "",
		role: "",
		company: "",
		email: "",
		phone: "",
		message: "",
		honeypot: "", // Hidden field for bot detection
	});
	const [status, setStatus] = useState<
		"idle" | "submitting" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setStatus("submitting");
		setErrorMessage("");

		try {
			const result = await submitEnterpriseInquiry(formState);

			if (result.success) {
				setStatus("success");
			} else {
				setStatus("error");
				setErrorMessage(
					result.error ??
						t({
							id: "marketing.form.error.genericShort",
							message: "Something went wrong.",
						}),
				);
			}
		} catch (_error) {
			setStatus("error");
			setErrorMessage(
				t({
					id: "marketing.form.error.generic",
					message: "Something went wrong. Please try again.",
				}),
			);
		}
	};

	if (status === "success") {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<CheckCircle2 className="size-6 text-muted-foreground mb-4" />
				<p className="text-lg font-medium text-foreground">
					<Trans id="marketing.enterprise.form.successTitle">
						Thanks for reaching out
					</Trans>
				</p>
				<p className="mt-2 text-sm text-muted-foreground">
					<Trans id="marketing.enterprise.form.successBody">
						We&apos;ll be in touch shortly.
					</Trans>
				</p>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="relative space-y-5">
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
				<div>
					<label
						htmlFor="ent-name"
						className="block text-sm text-muted-foreground mb-1.5"
					>
						<Trans id="marketing.enterprise.form.nameLabel">Full name</Trans>
					</label>
					<input
						id="ent-name"
						type="text"
						required
						value={formState.name}
						onChange={(e) =>
							setFormState((s) => ({ ...s, name: e.target.value }))
						}
						className="w-full px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors"
					/>
				</div>

				<div>
					<label
						htmlFor="ent-role"
						className="block text-sm text-muted-foreground mb-1.5"
					>
						<Trans id="marketing.enterprise.form.roleLabel">Role</Trans>
					</label>
					<input
						id="ent-role"
						type="text"
						required
						value={formState.role}
						onChange={(e) =>
							setFormState((s) => ({ ...s, role: e.target.value }))
						}
						className="w-full px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors"
					/>
				</div>
			</div>

			<div>
				<label
					htmlFor="ent-company"
					className="block text-sm text-muted-foreground mb-1.5"
				>
					<Trans id="marketing.enterprise.form.companyLabel">Company</Trans>
				</label>
				<input
					id="ent-company"
					type="text"
					required
					value={formState.company}
					onChange={(e) =>
						setFormState((s) => ({ ...s, company: e.target.value }))
					}
					className="w-full px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors"
				/>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
				<div>
					<label
						htmlFor="ent-email"
						className="block text-sm text-muted-foreground mb-1.5"
					>
						<Trans id="marketing.enterprise.form.emailLabel">
							Company email
						</Trans>
					</label>
					<input
						id="ent-email"
						type="email"
						required
						value={formState.email}
						onChange={(e) =>
							setFormState((s) => ({ ...s, email: e.target.value }))
						}
						className="w-full px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors"
					/>
				</div>

				<div>
					<label
						htmlFor="ent-phone"
						className="block text-sm text-muted-foreground mb-1.5"
					>
						<Trans id="marketing.enterprise.form.phoneLabel">
							Phone number
						</Trans>
					</label>
					<input
						id="ent-phone"
						type="tel"
						value={formState.phone}
						onChange={(e) =>
							setFormState((s) => ({ ...s, phone: e.target.value }))
						}
						className="w-full px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors"
					/>
				</div>
			</div>

			<div>
				<label
					htmlFor="ent-message"
					className="block text-sm text-muted-foreground mb-1.5"
				>
					<Trans id="marketing.enterprise.form.messageLabel">
						What problem are you trying to solve?
					</Trans>
				</label>
				<textarea
					id="ent-message"
					rows={4}
					value={formState.message}
					onChange={(e) =>
						setFormState((s) => ({ ...s, message: e.target.value }))
					}
					className="w-full px-3.5 py-2.5 text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors resize-none"
				/>
			</div>

			{/* Honeypot field - hidden from users, traps bots */}
			<input
				type="text"
				name="website"
				value={formState.honeypot}
				onChange={(e) =>
					setFormState((s) => ({ ...s, honeypot: e.target.value }))
				}
				tabIndex={-1}
				autoComplete="off"
				className="absolute left-0 top-0 opacity-0 pointer-events-none h-0 w-0"
				aria-hidden="true"
			/>

			{status === "error" && (
				<p className="text-sm text-red-400">{errorMessage}</p>
			)}

			<button
				type="submit"
				disabled={status === "submitting"}
				className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
			>
				{status === "submitting" ? (
					<>
						<Trans id="marketing.form.sending">Sending</Trans>
						<Loader2 className="size-3.5 animate-spin" />
					</>
				) : (
					<>
						<Trans id="marketing.enterprise.form.submit">Send</Trans>
						<ArrowRight className="size-3.5" />
					</>
				)}
			</button>
		</form>
	);
}
