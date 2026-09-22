import { Trans } from "@lingui/react/macro";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { LuCheck } from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export function CopyableTable({ children }: { children?: ReactNode }) {
	const tableRef = useRef<HTMLTableElement>(null);
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const handleCopy = useCallback(() => {
		const el = tableRef.current;
		if (!el) return;

		const rows = el.querySelectorAll("tr");
		const lines: string[] = [];
		for (const row of rows) {
			const cells = row.querySelectorAll("th, td");
			const values: string[] = [];
			for (const cell of cells) {
				values.push((cell.textContent ?? "").trim());
			}
			lines.push(values.join("\t"));
		}
		const text = lines.join("\n");
		void electronTrpcClient.external.copyText
			.mutate(text)
			.then(() => {
				if (!isMountedRef.current) return;
				if (timerRef.current) clearTimeout(timerRef.current);
				setCopied(true);
				timerRef.current = setTimeout(() => {
					if (!isMountedRef.current) return;
					setCopied(false);
					timerRef.current = null;
				}, 1500);
			})
			.catch((err) => {
				console.warn("Failed to copy table text", err);
			});
	}, []);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={handleCopy}
				className="absolute right-0 -top-6 z-10 rounded-sm px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
			>
				{copied ? (
					<span className="flex items-center gap-1">
						<LuCheck className="size-3" />
						<Trans>Copied</Trans>
					</span>
				) : (
					<Trans>Copy</Trans>
				)}
			</button>
			<div className="overflow-x-auto">
				<table ref={tableRef} className="table-auto w-full">
					{children}
				</table>
			</div>
		</div>
	);
}
