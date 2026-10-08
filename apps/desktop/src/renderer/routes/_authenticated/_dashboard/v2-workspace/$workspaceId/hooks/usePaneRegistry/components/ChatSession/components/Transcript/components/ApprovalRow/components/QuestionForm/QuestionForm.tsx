import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type {
	ApprovalRequest,
	Decision,
	FormField,
} from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	CornerDownLeft,
	MessageCircleQuestion,
} from "lucide-react";
import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { QuestionPage } from "./components/QuestionPage";
import {
	answerText,
	type FormValues,
	isInvalidNumber,
	isPageAnswered,
	questionPages,
} from "./utils/questionPages";

function focusIfLost(element: HTMLElement | null) {
	const focused = document.activeElement;
	if (focused === null || focused === document.body) {
		element?.focus({ preventScroll: true });
	}
}

export function QuestionForm({
	item,
	form,
	onRespond,
}: {
	item: ApprovalRequest;
	form: NonNullable<ApprovalRequest["form"]>;
	onRespond: (approvalId: string, decision: Decision) => void;
}) {
	const { t } = useLingui();
	const pages = useMemo(() => questionPages(form.fields), [form.fields]);
	const [values, setValues] = useState<FormValues>({});
	const [pageIndex, setPageIndex] = useState(0);
	const cardRef = useRef<HTMLFieldSetElement>(null);
	const pending = item.status === "pending";
	const index = Math.min(pageIndex, Math.max(pages.length - 1, 0));
	const page = pages[index];
	const last = index >= pages.length - 1;
	const several = pages.length > 1;

	useEffect(() => {
		if (pending) focusIfLost(cardRef.current);
	}, [pending]);

	const choicesFor = (field: FormField) =>
		field.input === "boolean"
			? [
					{ value: "true", label: t`Yes` },
					{ value: "false", label: t`No` },
				]
			: (field.options ?? []);

	const display = (field: FormField, value: string | string[] | undefined) =>
		field.input === "boolean"
			? (choicesFor(field).find((choice) => choice.value === value)?.label ??
				"")
			: answerText(value);

	if (!pending) {
		const answers =
			item.decision?.type === "form"
				? (item.decision.values as FormValues)
				: {};
		const answered = pages.filter((entry) => isPageAnswered(entry, answers));
		return (
			<div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
				<div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
					<MessageCircleQuestion className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate">
						{several ? (
							<Plural
								one="Asked # question"
								other="Asked # questions"
								value={pages.length}
							/>
						) : (
							form.message
						)}
					</span>
					<span className="shrink-0 text-xs">
						{item.status === "stale" ? (
							<Trans>Expired</Trans>
						) : item.decision?.type !== "form" ? (
							<Trans>Skipped</Trans>
						) : answered.length === 0 ? (
							<Trans>Answered</Trans>
						) : null}
					</span>
				</div>
				{answered.length > 0 && (
					<dl className="grid grid-cols-[minmax(0,max-content)_1fr] gap-x-4 gap-y-1.5 pl-6 text-sm">
						{answered.map((entry) => (
							<div className="contents" key={entry.field.id}>
								<dt className="truncate text-muted-foreground">
									{entry.field.title ?? entry.field.description ?? form.message}
								</dt>
								<dd className="flex min-w-0 items-start gap-1.5 break-words">
									<Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
									{[
										display(entry.field, answers[entry.field.id]),
										entry.other ? answerText(answers[entry.other.id]) : "",
									]
										.filter(Boolean)
										.join(", ")}
								</dd>
							</div>
						))}
					</dl>
				)}
			</div>
		);
	}

	const blocked = pages.some(
		(entry) =>
			(entry.field.required && !isPageAnswered(entry, values)) ||
			isInvalidNumber(entry.field, values[entry.field.id]),
	);
	const submit = () => {
		if (blocked) return;
		const filled = Object.fromEntries(
			Object.entries(values).filter(([, value]) => answerText(value) !== ""),
		);
		onRespond(item.id, { type: "form", values: filled });
	};
	const goTo = (target: number) => {
		setPageIndex(target);
		requestAnimationFrame(() => focusIfLost(cardRef.current));
	};
	const next = () => (last ? submit() : goTo(index + 1));

	const pick = (value: string) => {
		if (!page) return;
		const { field } = page;
		if (field.input === "multi") {
			setValues((current) => {
				const picked = Array.isArray(current[field.id])
					? (current[field.id] as string[])
					: [];
				return {
					...current,
					[field.id]: picked.includes(value)
						? picked.filter((entry) => entry !== value)
						: [...picked, value],
				};
			});
			return;
		}
		const unpick = values[field.id] === value;
		setValues((current) => ({ ...current, [field.id]: unpick ? "" : value }));
		if (!unpick && !last) goTo(index + 1);
	};

	const choices = page ? choicesFor(page.field) : [];

	const onKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (/^[1-9]$/.test(event.key)) {
			const option = choices[Number(event.key) - 1];
			if (!option) return;
			event.preventDefault();
			pick(option.value);
		} else if (event.key === "Enter" && event.target === event.currentTarget) {
			event.preventDefault();
			next();
		}
	};

	return (
		<fieldset
			aria-label={form.message}
			className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm outline-none"
			onKeyDown={onKeyDown}
			ref={cardRef}
			tabIndex={-1}
		>
			{several && (
				<div className="flex gap-1">
					{pages.map((entry, entryIndex) => (
						<button
							aria-current={entryIndex === index ? "step" : undefined}
							aria-label={entry.field.title ?? String(entryIndex + 1)}
							className="group flex-1 py-1"
							key={entry.field.id}
							onClick={() => goTo(entryIndex)}
							type="button"
						>
							<span
								className={cn(
									"block h-1 rounded-full transition-colors",
									entryIndex === index
										? "bg-foreground"
										: isPageAnswered(entry, values)
											? "bg-foreground/40"
											: "bg-foreground/10 group-hover:bg-foreground/20",
								)}
							/>
						</button>
					))}
				</div>
			)}
			<div className="flex items-center gap-2 text-xs">
				<MessageCircleQuestion className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate font-medium uppercase tracking-wider text-muted-foreground">
					{page?.field.title ?? <Trans>Question</Trans>}
					{page?.field.required && (
						<span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">
							<Trans>Required</Trans>
						</span>
					)}
				</span>
				{several && (
					<span className="shrink-0 tabular-nums text-muted-foreground">
						<Trans context="question progress">
							{index + 1} of {pages.length}
						</Trans>
					</span>
				)}
			</div>
			{page ? (
				<QuestionPage
					choices={choices}
					key={page.field.id}
					onEnter={next}
					onPick={pick}
					onType={(fieldId, text) =>
						setValues((current) => ({ ...current, [fieldId]: text }))
					}
					page={page}
					question={page.field.description ?? form.message}
					values={values}
				/>
			) : (
				<p className="text-[15px] font-medium leading-snug">{form.message}</p>
			)}
			<div className="flex items-center gap-2 border-t border-border/60 pt-3">
				<Button
					className="-ml-2 text-muted-foreground"
					onClick={() => onRespond(item.id, { type: "decline" })}
					size="sm"
					variant="ghost"
				>
					<Trans>Skip</Trans>
				</Button>
				<div className="ml-auto flex items-center gap-1.5">
					{index > 0 && (
						<Button onClick={() => goTo(index - 1)} size="sm" variant="ghost">
							<ArrowLeft className="size-3.5" />
							<Trans>Back</Trans>
						</Button>
					)}
					<Button
						className="gap-1.5"
						disabled={last && blocked}
						onClick={next}
						size="sm"
					>
						{last ? <Trans>Submit</Trans> : <Trans>Next</Trans>}
						{last ? (
							<CornerDownLeft className="size-3.5 opacity-60" />
						) : (
							<ArrowRight className="size-3.5" />
						)}
					</Button>
				</div>
			</div>
		</fieldset>
	);
}
