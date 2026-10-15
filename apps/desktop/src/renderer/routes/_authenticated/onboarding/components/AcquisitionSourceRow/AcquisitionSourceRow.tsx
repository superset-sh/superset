import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiOutlineMegaphone } from "react-icons/hi2";
import { useAcquisitionSourceStore } from "../../stores/acquisitionSourceStore";
import {
	ACQUISITION_SOURCE_OTHER_MAX_LENGTH,
	ACQUISITION_SOURCES,
	type AcquisitionSource,
	isAcquisitionSource,
} from "../../utils/acquisitionSource";

const SOURCE_LABELS: Record<AcquisitionSource, MessageDescriptor | string> = {
	search_engine: msg({ message: "Google or another search engine" }),
	ai_assistant: msg({ message: "ChatGPT, Claude or another AI assistant" }),
	x_twitter: "X (Twitter)",
	youtube: "YouTube",
	reddit: "Reddit",
	hacker_news: "Hacker News",
	product_hunt: "Product Hunt",
	github: "GitHub",
	friend_or_colleague: msg({ message: "A friend or colleague" }),
	newsletter_blog_podcast: msg({ message: "A newsletter, blog or podcast" }),
	other: msg({ message: "Other" }),
};

export function AcquisitionSourceRow() {
	const { _: translate } = useLingui();
	const answered = useAcquisitionSourceStore((s) => s.answered);
	const source = useAcquisitionSourceStore((s) => s.source);
	const otherText = useAcquisitionSourceStore((s) => s.otherText);
	const setSource = useAcquisitionSourceStore((s) => s.setSource);
	const setOtherText = useAcquisitionSourceStore((s) => s.setOtherText);

	if (answered) return null;

	const labelText = (label: MessageDescriptor | string) =>
		typeof label === "string" ? label : translate(label);

	return (
		<div className="flex flex-col gap-3 py-7 first:pt-0 last:pb-0">
			<div className="flex items-center gap-4">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
					<HiOutlineMegaphone className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						{translate(msg({ message: "How did you hear about Superset?" }))}
					</p>
					<p className="text-xs text-muted-foreground">
						{translate(
							msg({ message: "Optional. Helps us learn what works." }),
						)}
					</p>
				</div>
				<Select
					value={source ?? ""}
					onValueChange={(value) => {
						if (isAcquisitionSource(value)) setSource(value);
					}}
				>
					<SelectTrigger
						size="sm"
						className="w-auto min-w-44 px-2"
						aria-label={translate(
							msg({ message: "How did you hear about Superset?" }),
						)}
					>
						<SelectValue
							placeholder={translate(msg({ message: "Choose one" }))}
						/>
					</SelectTrigger>
					<SelectContent>
						{ACQUISITION_SOURCES.map((key) => (
							<SelectItem key={key} value={key}>
								{labelText(SOURCE_LABELS[key])}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{source === "other" && (
				<Input
					autoFocus
					value={otherText}
					maxLength={ACQUISITION_SOURCE_OTHER_MAX_LENGTH}
					onChange={(e) => setOtherText(e.target.value)}
					placeholder={translate(msg({ message: "Where? (optional)" }))}
					aria-label={translate(
						msg({ message: "Where did you hear about Superset?" }),
					)}
					className="ml-13 w-auto"
				/>
			)}
		</div>
	);
}
