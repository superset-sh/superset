import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { type FormEvent, useId, useState } from "react";
import { HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { normalizeAuthorFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeAuthorFilter";

interface AuthorFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

export function AuthorFilter({ value, onChange }: AuthorFilterProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [error, setError] = useState<string | null>(null);
	const inputId = useId();
	const errorId = useId();
	const label = value ? `@${value}` : "All authors";

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		setDraft(value ?? "");
		setError(null);
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalized = normalizeAuthorFilter(draft);
		if (draft.trim() && !normalized) {
			setError("Enter a valid GitHub username.");
			return;
		}
		onChange(normalized);
		setOpen(false);
	};

	const handleClear = () => {
		onChange(null);
		setDraft("");
		setError(null);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={label}
					aria-label={`Author: ${label}`}
					className="h-8 max-w-44 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<HiOutlineUserCircle className="size-4 shrink-0" />
					<span className="hidden truncate text-sm @4xl:inline">{label}</span>
					<HiChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-3">
				<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={inputId} className="text-xs font-medium">
							GitHub username
						</label>
						<Input
							id={inputId}
							aria-label="Filter by author"
							type="text"
							value={draft}
							placeholder="octocat"
							autoComplete="off"
							spellCheck={false}
							aria-invalid={!!error}
							aria-describedby={error ? errorId : undefined}
							onChange={(event) => {
								setDraft(event.target.value);
								setError(null);
							}}
						/>
						{error && (
							<p id={errorId} className="text-xs text-destructive">
								{error}
							</p>
						)}
					</div>
					<div className="flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={!value}
							onClick={handleClear}
						>
							Clear
						</Button>
						<Button type="submit" size="sm">
							Apply
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
