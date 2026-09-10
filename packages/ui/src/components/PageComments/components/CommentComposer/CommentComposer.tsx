"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { SendHorizontal } from "lucide-react";
import { type Ref, useState } from "react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import { Textarea } from "../../../ui/textarea";

interface CommentComposerProps {
	/** A reply composer names its thread; a draft composer starts one. */
	isReply: boolean;
	onSubmit: (body: string) => void | Promise<void>;
	onFocus?: () => void;
	autoFocus?: boolean;
	initialValue?: string;
	ref?: Ref<HTMLTextAreaElement>;
	className?: string;
}

export function CommentComposer({
	isReply,
	onSubmit,
	onFocus,
	autoFocus,
	initialValue,
	ref,
	className,
}: CommentComposerProps) {
	const { t } = useLingui();
	const [value, setValue] = useState(initialValue ?? "");
	const [focused, setFocused] = useState(false);
	const open = focused || value.trim().length > 0;

	const submit = () => {
		const body = value.trim();
		if (!body) return;
		setValue("");
		Promise.resolve(onSubmit(body)).catch(() => {
			setValue((current) => current || body);
		});
	};

	return (
		<div className={cn("flex flex-col", className)}>
			<Textarea
				ref={ref}
				autoFocus={autoFocus}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onFocus={() => {
					setFocused(true);
					onFocus?.();
				}}
				onBlur={() => setFocused(false)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						submit();
					}
				}}
				placeholder={
					isReply
						? t({ message: "Reply to thread…" })
						: t({ message: "Write a comment…" })
				}
				className={cn(
					"resize-none rounded-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
					open ? "min-h-[52px]" : "min-h-9 py-2",
				)}
			/>
			{open ? (
				<div className="flex items-center gap-2 px-3 pb-2.5">
					<span className="text-muted-foreground text-xs">
						<Trans>⌘↵ to send</Trans>
					</span>
					<Button
						size="icon"
						className="ml-auto size-7 rounded-md"
						onClick={submit}
						aria-label={
							isReply
								? t({ message: "Send reply" })
								: t({ message: "Post comment" })
						}
						disabled={value.trim().length === 0}
					>
						<SendHorizontal className="size-3.5" />
					</Button>
				</div>
			) : null}
		</div>
	);
}
