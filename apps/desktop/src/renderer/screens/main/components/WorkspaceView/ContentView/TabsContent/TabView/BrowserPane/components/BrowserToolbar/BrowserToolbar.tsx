import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	TbArrowLeft,
	TbArrowRight,
	TbLoader2,
	TbRefresh,
} from "react-icons/tb";
import { UrlSuggestions } from "./components/UrlSuggestions";
import { useUrlAutocomplete } from "./hooks/useUrlAutocomplete";

function displayUrl(url: string): string {
	if (url === "about:blank") return "";
	// Strip trailing slash for cleaner display (e.g. "https://github.com/" → "https://github.com")
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

interface BrowserToolbarProps {
	currentUrl: string;
	pageTitle: string;
	isLoading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	onGoBack: () => void;
	onGoForward: () => void;
	onReload: () => void;
	onNavigate: (url: string) => void;
}

export function BrowserToolbar({
	currentUrl,
	pageTitle,
	isLoading,
	canGoBack,
	canGoForward,
	onGoBack,
	onGoForward,
	onReload,
	onNavigate,
}: BrowserToolbarProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [urlInputValue, setUrlInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const url = displayUrl(currentUrl);
	const isBlank = !url;

	const autocomplete = useUrlAutocomplete({
		onSelect: (selectedUrl) => {
			onNavigate(selectedUrl);
			setIsEditing(false);
		},
	});

	// Focus and select input when entering edit mode
	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	const enterEditMode = useCallback(() => {
		setUrlInputValue(url);
		setIsEditing(true);
		autocomplete.open();
		autocomplete.updateQuery(url);
	}, [url, autocomplete]);

	const exitEditMode = useCallback(() => {
		setIsEditing(false);
		autocomplete.close();
	}, [autocomplete]);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = urlInputValue.trim();
			if (trimmed) {
				onNavigate(trimmed);
				setIsEditing(false);
				autocomplete.close();
			}
		},
		[urlInputValue, onNavigate, autocomplete],
	);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setUrlInputValue(value);
			autocomplete.updateQuery(value);
			if (!autocomplete.isOpen) {
				autocomplete.open();
			}
		},
		[autocomplete],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Let autocomplete handle arrow keys, enter on highlighted, and first escape
			const handled = autocomplete.handleKeyDown(e);
			if (handled) return;

			// Second escape (dropdown already closed) → exit edit mode
			if (e.key === "Escape") {
				setIsEditing(false);
			}
		},
		[autocomplete],
	);

	return (
		<div className="flex h-full flex-1 min-w-0 items-center px-2">
			<div className="flex items-center gap-0.5 shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onGoBack}
							disabled={!canGoBack}
							className={`rounded p-1 transition-colors ${canGoBack ? "text-muted-foreground/60 hover:text-muted-foreground" : "opacity-30 pointer-events-none"}`}
						>
							<TbArrowLeft className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Go Back
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onGoForward}
							disabled={!canGoForward}
							className={`rounded p-1 transition-colors ${canGoForward ? "text-muted-foreground/60 hover:text-muted-foreground" : "opacity-30 pointer-events-none"}`}
						>
							<TbArrowRight className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Go Forward
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onReload}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							{isLoading ? (
								<TbLoader2 className="size-3.5 animate-spin" />
							) : (
								<TbRefresh className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{isLoading ? "Loading..." : "Reload"}
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="mx-1.5 h-3.5 w-px bg-muted-foreground/60" />
			<div className="relative flex flex-1 min-w-0 items-center">
				{isEditing ? (
					<form
						onSubmit={handleSubmit}
						className="flex w-full min-w-0 items-center"
					>
						<input
							ref={inputRef}
							type="text"
							value={urlInputValue}
							onChange={handleInputChange}
							onBlur={exitEditMode}
							onKeyDown={handleKeyDown}
							placeholder="Enter URL or search..."
							className="h-[22px] w-full rounded-sm border border-ring bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
							spellCheck={false}
							autoComplete="off"
						/>
					</form>
				) : (
					<button
						type="button"
						onClick={enterEditMode}
						className="group flex w-full min-w-0 items-baseline rounded-sm border border-transparent px-2 py-0.5 text-left text-xs"
					>
						{isBlank ? (
							<span className="text-muted-foreground/40">
								Enter URL or search...
							</span>
						) : (
							<>
								<span className="shrink-0 whitespace-nowrap text-muted-foreground/60 transition-colors group-hover:text-foreground">
									{url}
								</span>
								{pageTitle && (
									<span className="min-w-0 ml-1 truncate text-muted-foreground/40 transition-opacity group-hover:opacity-0">
										/ {pageTitle}
									</span>
								)}
							</>
						)}
					</button>
				)}
				{isEditing && autocomplete.isOpen && (
					<UrlSuggestions
						suggestions={autocomplete.suggestions}
						highlightedIndex={autocomplete.highlightedIndex}
						onSelect={autocomplete.selectSuggestion}
					/>
				)}
			</div>
		</div>
	);
}
