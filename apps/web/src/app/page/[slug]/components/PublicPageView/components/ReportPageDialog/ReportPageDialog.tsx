"use client";

import { useLingui as useTranslation } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { REPORT_REASONS, type ReportReason } from "./constants";

interface ReportPageDialogProps {
	slug: string;
	signedIn: boolean;
}

export function ReportPageDialog({ slug, signedIn }: ReportPageDialogProps) {
	const { t } = useLingui();
	const { _: translate } = useTranslation();
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState<ReportReason | "">("");
	const [details, setDetails] = useState("");
	const [email, setEmail] = useState("");

	const report = useMutation(trpc.page.report.mutationOptions());

	const reset = () => {
		setReason("");
		setDetails("");
		setEmail("");
		report.reset();
	};

	const submit = () => {
		if (!reason) return;
		report.mutate({
			slug,
			reason,
			details: details.trim() || undefined,
			reporterEmail: !signedIn && email.trim() ? email.trim() : undefined,
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button size="xs" variant="ghost" className="text-muted-foreground">
					<Flag className="size-3.5" />
					<Trans>Report</Trans>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				{report.isSuccess ? (
					<>
						<DialogHeader>
							<DialogTitle>
								<Trans>Thanks, we got it</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									Someone on the Superset team will review this page. We only
									follow up if we need more from you.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button onClick={() => setOpen(false)}>
								<Trans>Close</Trans>
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>
								<Trans>Report this page</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									Tell us what is wrong with it. Reporting does not remove the
									page on its own.
								</Trans>
							</DialogDescription>
						</DialogHeader>

						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="report-reason">
									<Trans>What is wrong?</Trans>
								</Label>
								<Select
									value={reason}
									onValueChange={(value) => setReason(value as ReportReason)}
								>
									<SelectTrigger id="report-reason">
										<SelectValue
											placeholder={t({ message: "Pick a reason" })}
										/>
									</SelectTrigger>
									<SelectContent>
										{REPORT_REASONS.map(({ value, label }) => (
											<SelectItem key={value} value={value}>
												{translate(label)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="report-details">
									<Trans>Anything else? (optional)</Trans>
								</Label>
								<Textarea
									id="report-details"
									value={details}
									maxLength={4000}
									rows={4}
									onChange={(event) => setDetails(event.target.value)}
									placeholder={t({
										message: "What did you see on the page?",
									})}
								/>
							</div>

							{!signedIn && (
								<div className="flex flex-col gap-2">
									<Label htmlFor="report-email">
										<Trans>Your email (optional)</Trans>
									</Label>
									<Input
										id="report-email"
										type="email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										placeholder={t({ message: "you@example.com" })}
									/>
								</div>
							)}

							{report.isError && (
								<p className="text-destructive text-sm">
									{report.error.message}
								</p>
							)}
						</div>

						<DialogFooter>
							<Button variant="ghost" onClick={() => setOpen(false)}>
								<Trans>Cancel</Trans>
							</Button>
							<Button onClick={submit} disabled={!reason || report.isPending}>
								{report.isPending ? (
									<Trans>Sending…</Trans>
								) : (
									<Trans>Send report</Trans>
								)}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
