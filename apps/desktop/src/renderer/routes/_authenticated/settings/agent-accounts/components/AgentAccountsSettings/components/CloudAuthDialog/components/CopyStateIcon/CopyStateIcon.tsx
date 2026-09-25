import { Check, Copy } from "lucide-react";

export function CopyStateIcon({ copied }: { copied: boolean }) {
	return copied ? (
		<Check className="size-3.5 text-emerald-500" />
	) : (
		<Copy className="size-3.5" />
	);
}
