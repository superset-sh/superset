"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	type HiringSource,
	type HiringStage,
	hiringSourceValues,
	hiringStageValues,
} from "@superset/db/enums";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
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
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useDeferredValue, useState } from "react";
import { LuPlus } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

import { useHiringLabels } from "../../hooks/useHiringLabels";
import { useInvalidateHiring } from "../../hooks/useInvalidateHiring";

const NEW_ROLE = "__new__";

const EMPTY_FORM = {
	name: "",
	email: "",
	githubUrl: "",
	linkedinUrl: "",
	xUrl: "",
	currentTitle: "",
	currentCompany: "",
	referredBy: "",
	note: "",
};

type TextField = keyof typeof EMPTY_FORM;

interface AddCandidateDialogProps {
	onCreated: (candidateId: string) => void;
}

export function AddCandidateDialog({ onCreated }: AddCandidateDialogProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useHiringLabels();
	const invalidate = useInvalidateHiring();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(EMPTY_FORM);
	const [roleId, setRoleId] = useState("");
	const [newRoleTitle, setNewRoleTitle] = useState("");
	const [source, setSource] = useState<HiringSource | "">("");
	const [stage, setStage] = useState<HiringStage>("sourced");

	const roles = useQuery(trpc.hiring.roles.queryOptions());
	const dupeEmail = useDeferredValue(form.email.trim());
	const dupeGithubUrl = useDeferredValue(form.githubUrl.trim());
	const duplicates = useQuery(
		trpc.hiring.findDuplicates.queryOptions(
			{ email: dupeEmail || null, githubUrl: dupeGithubUrl || null },
			{ enabled: Boolean(dupeEmail || dupeGithubUrl) },
		),
	);
	const duplicateNames = duplicates.data?.map((match) => match.name).join(", ");
	const createRole = useMutation(trpc.hiring.createRole.mutationOptions());
	const createCandidate = useMutation(
		trpc.hiring.createCandidate.mutationOptions(),
	);

	const field = (key: TextField) => ({
		id: `candidate-${key}`,
		value: form[key],
		onChange: (event: { target: { value: string } }) =>
			setForm((current) => ({ ...current, [key]: event.target.value })),
	});

	const reset = () => {
		setForm(EMPTY_FORM);
		setRoleId("");
		setNewRoleTitle("");
		setSource("");
		setStage("sourced");
	};

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		try {
			const resolvedRoleId =
				roleId === NEW_ROLE
					? (await createRole.mutateAsync({ title: newRoleTitle }))?.id
					: roleId;
			if (!resolvedRoleId) return;
			const { candidateId } = await createCandidate.mutateAsync({
				...form,
				roleId: resolvedRoleId,
				source: source || null,
				stage,
			});
			await invalidate();
			reset();
			setOpen(false);
			onCreated(candidateId);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};

	const roleMissing = !roleId || (roleId === NEW_ROLE && !newRoleTitle.trim());
	const isSaving = createRole.isPending || createCandidate.isPending;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<LuPlus className="size-4" />
					<Trans>Add candidate</Trans>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						<Trans>Add candidate</Trans>
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
					<div className="col-span-2 space-y-1.5">
						<Label htmlFor="candidate-name">
							<Trans>Name</Trans>
						</Label>
						<Input required autoFocus {...field("name")} />
					</div>
					<div className="space-y-1.5">
						<Label>
							<Trans>Role</Trans>
						</Label>
						<Select value={roleId} onValueChange={setRoleId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={t({ message: "Pick a role" })} />
							</SelectTrigger>
							<SelectContent>
								{roles.data?.map((role) => (
									<SelectItem key={role.id} value={role.id}>
										{role.title}
									</SelectItem>
								))}
								<SelectItem value={NEW_ROLE}>
									<Trans>New role…</Trans>
								</SelectItem>
							</SelectContent>
						</Select>
						{roleId === NEW_ROLE && (
							<Input
								value={newRoleTitle}
								onChange={(event) => setNewRoleTitle(event.target.value)}
								placeholder={t({ message: "Role title" })}
							/>
						)}
					</div>
					<div className="space-y-1.5">
						<Label>
							<Trans>Stage</Trans>
						</Label>
						<Select
							value={stage}
							onValueChange={(value) => setStage(value as HiringStage)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{hiringStageValues.map((value) => (
									<SelectItem key={value} value={value}>
										{labels.stage[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="candidate-email">
							<Trans>Email</Trans>
						</Label>
						<Input type="email" {...field("email")} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="candidate-githubUrl">GitHub</Label>
						<Input placeholder="https://github.com/…" {...field("githubUrl")} />
					</div>
					{duplicateNames && (
						<p className="text-destructive col-span-2 text-sm">
							<Trans>Already in the pipeline: {duplicateNames}</Trans>
						</p>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="candidate-linkedinUrl">LinkedIn</Label>
						<Input {...field("linkedinUrl")} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="candidate-xUrl">X</Label>
						<Input {...field("xUrl")} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="candidate-currentTitle">
							<Trans>Current title</Trans>
						</Label>
						<Input {...field("currentTitle")} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="candidate-currentCompany">
							<Trans>Company</Trans>
						</Label>
						<Input {...field("currentCompany")} />
					</div>
					<div className="space-y-1.5">
						<Label>
							<Trans>Source</Trans>
						</Label>
						<Select
							value={source}
							onValueChange={(value) => setSource(value as HiringSource)}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={t({ message: "Unknown" })} />
							</SelectTrigger>
							<SelectContent>
								{hiringSourceValues.map((value) => (
									<SelectItem key={value} value={value}>
										{labels.source[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="candidate-referredBy">
							<Trans>Referred by</Trans>
						</Label>
						<Input {...field("referredBy")} />
					</div>
					<div className="col-span-2 space-y-1.5">
						<Label htmlFor="candidate-note">
							<Trans>Note</Trans>
						</Label>
						<Textarea rows={3} {...field("note")} />
					</div>
					<DialogFooter className="col-span-2">
						<Button type="submit" disabled={roleMissing || isSaving}>
							<Trans>Add</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
