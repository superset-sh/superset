/**
 * QuestionDock — renders the agent's question with option buttons and
 * optional free-text input. Number keys 1–9 auto-select options
 * (t3code pattern).
 */

import type { QuestionRequest } from "@superset/chat/shared";
import { Button } from "@superset/ui/button";
import { useEffect, useState } from "react";
import { DockFrame } from "./DockFrame";
import { optionIndexForKey } from "./QuestionDock.logic";

export interface QuestionDockProps {
	request: QuestionRequest;
	submitting?: boolean;
	onRespond: (answer: string) => void;
}

export function QuestionDock({
	request,
	submitting = false,
	onRespond,
}: QuestionDockProps) {
	const [textAnswer, setTextAnswer] = useState("");

	useEffect(() => {
		if (submitting) return;
		const handler = (e: KeyboardEvent) => {
			if (
				(e.target as HTMLElement | null)?.tagName === "INPUT" ||
				(e.target as HTMLElement | null)?.tagName === "TEXTAREA"
			) {
				return;
			}
			const idx = optionIndexForKey(e.key);
			if (idx === null) return;
			const option = request.options?.[idx];
			if (!option) return;
			e.preventDefault();
			onRespond(option.label);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [request, submitting, onRespond]);

	return (
		<DockFrame tone="blue" label="Agent question" subtitle={request.question}>
			{request.options && request.options.length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					{request.options.map((opt, idx) => (
						<Button
							key={`${idx}-${opt.label}`}
							size="sm"
							variant={idx === 0 ? "default" : "secondary"}
							disabled={submitting}
							onClick={() => onRespond(opt.label)}
							title={opt.description ?? undefined}
						>
							{idx < 9 && (
								<span className="text-muted-foreground mr-1 font-mono text-[10px]">
									{idx + 1}
								</span>
							)}
							{opt.label}
						</Button>
					))}
				</div>
			)}
			{request.allowFreeText && (
				<form
					className="flex items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (!textAnswer.trim()) return;
						onRespond(textAnswer.trim());
						setTextAnswer("");
					}}
				>
					<input
						className="border-border bg-background flex-1 rounded-md border px-2 py-1 text-sm"
						placeholder="Type a response…"
						value={textAnswer}
						onChange={(e) => setTextAnswer(e.target.value)}
						disabled={submitting}
					/>
					<Button
						size="sm"
						type="submit"
						disabled={submitting || !textAnswer.trim()}
					>
						Send
					</Button>
				</form>
			)}
		</DockFrame>
	);
}
