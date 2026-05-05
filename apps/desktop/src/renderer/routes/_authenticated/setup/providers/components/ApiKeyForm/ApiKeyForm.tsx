import { type FormEvent, useState } from "react";
import { SetupButton } from "../../../components/SetupButton";
import { StepHeader, StepShell } from "../../../components/StepShell";

interface ApiKeyFormProps {
	title: string;
	description: string;
	helpUrl: string;
	helpLabel: string;
	placeholder: string;
	backTo: string;
	onSubmit: (key: string) => Promise<void>;
}

export function ApiKeyForm({
	title,
	description,
	helpUrl,
	helpLabel,
	placeholder,
	backTo,
	onSubmit,
}: ApiKeyFormProps) {
	const [key, setKey] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = key.trim();
		if (!trimmed) {
			setError("Enter an API key.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await onSubmit(trimmed);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to save the API key.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<StepShell backTo={backTo}>
			<StepHeader title={title} subtitle={description} />

			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<input
					id="api-key"
					type="password"
					autoComplete="off"
					placeholder={placeholder}
					value={key}
					onChange={(e) => setKey(e.target.value)}
					disabled={submitting}
					className="h-9 w-full rounded-[4px] border border-[#2a2827] bg-[#201e1c] px-3 text-[12px] text-[#eae8e6] placeholder:text-[#a8a5a3]/60 focus:border-[rgba(255,136,70,0.6)] focus:outline-none focus:ring-1 focus:ring-[rgba(255,91,0,0.4)]"
				/>
				<a
					href={helpUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-[11px] text-[#a8a5a3] underline-offset-4 hover:text-[#eae8e6] hover:underline"
				>
					{helpLabel}
				</a>

				{error && (
					<div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-400">
						{error}
					</div>
				)}

				<div className="flex w-[273px] flex-col gap-2 self-center pt-2">
					<SetupButton type="submit" disabled={submitting}>
						{submitting ? "Saving…" : "Save & continue"}
					</SetupButton>
				</div>
			</form>
		</StepShell>
	);
}
