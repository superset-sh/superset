import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useCallback, useRef, useState } from "react";
import { HiDocumentArrowUp } from "react-icons/hi2";

interface ScriptFieldProps {
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onFocus: () => void;
	onBlur: () => void;
}

export function ScriptField({
	placeholder,
	value,
	onChange,
	onFocus,
	onBlur,
}: ScriptFieldProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const importFirstFile = useCallback(
		async (files: File[]) => {
			const scriptFile = files.find((file) =>
				file.name.match(/\.(sh|bash|zsh|command)$/i),
			);
			if (!scriptFile) return;
			try {
				onChange(await scriptFile.text());
			} catch (error) {
				console.error("[v2-scripts/import] failed to read file", error);
			}
		},
		[onChange],
	);

	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: drop zone wrapper */}
			<div
				role="region"
				aria-label="Script editor with file drop support"
				className={cn(
					"relative rounded-md border transition-colors",
					isDragOver
						? "ring-2 ring-primary/40 border-primary/60"
						: "border-input",
				)}
				onDragOver={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsDragOver(true);
				}}
				onDragLeave={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsDragOver(false);
				}}
				onDrop={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsDragOver(false);
					await importFirstFile(Array.from(e.dataTransfer.files));
				}}
			>
				<Textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onFocus={onFocus}
					onBlur={onBlur}
					placeholder={placeholder}
					rows={4}
					className="font-mono text-sm border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 resize-y pb-8 pr-20"
				/>
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					title="Import from file"
					className="absolute bottom-2 right-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<HiDocumentArrowUp className="h-3.5 w-3.5" />
					Import
				</button>
				{isDragOver && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/10">
						<div className="flex items-center gap-2 text-primary text-sm font-medium">
							<HiDocumentArrowUp className="h-5 w-5" />
							Drop to import
						</div>
					</div>
				)}
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept=".sh,.bash,.zsh,.command"
				className="hidden"
				onChange={async (e) => {
					const files = e.target.files ? Array.from(e.target.files) : [];
					await importFirstFile(files);
					e.target.value = "";
				}}
			/>
		</>
	);
}
