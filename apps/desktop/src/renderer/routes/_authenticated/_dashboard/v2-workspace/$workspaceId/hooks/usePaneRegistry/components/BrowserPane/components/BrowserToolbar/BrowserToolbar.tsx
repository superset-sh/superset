import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	TbArrowLeft,
	TbArrowRight,
	TbLoader2,
	TbRefresh,
} from "react-icons/tb";
import { suspendAncestorDragForTextSelection } from "renderer/lib/dnd";
import { BrowserTabFavicon } from "../BrowserTabFavicon";
import { UrlSuggestions } from "./components/UrlSuggestions";
import { useUrlAutocomplete } from "./hooks/useUrlAutocomplete";

function displayUrl(url: string): string {
	if (url === "about:blank") return "";
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

interface BrowserToolbarProps {
	currentUrl: string;
	faviconUrl: string | null;
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
	faviconUrl,
	isLoading,
	canGoBack,
	canGoForward,
	onGoBack,
	onGoForward,
	onReload,
	onNavigate,
}: BrowserToolbarProps) {
	const { t } = useLingui();
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
			const handled = autocomplete.handleKeyDown(e);
			if (handled) return;
			if (e.key === "Escape") {
				setIsEditing(false);
			}
		},
		[autocomplete],
	);

	return (
		<div className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2">
			<div className="flex shrink-0 items-center gap-0.5">
				<button
					type="button"
					onClick={onGoBack}
					disabled={!canGoBack}
					className={`rounded-md p-1 transition-colors ${canGoBack ? "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground" : "text-muted-foreground/30 pointer-events-none"}`}
				>
					<TbArrowLeft className="size-3.5" />
				</button>
				<button
					type="button"
					onClick={onGoForward}
					disabled={!canGoForward}
					className={`rounded-md p-1 transition-colors ${canGoForward ? "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground" : "text-muted-foreground/30 pointer-events-none"}`}
				>
					<TbArrowRight className="size-3.5" />
				</button>
				<button
					type="button"
					onClick={onReload}
					className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					{isLoading ? (
						<TbLoader2 className="size-3.5 animate-spin" />
					) : (
						<TbRefresh className="size-3.5" />
					)}
				</button>
			</div>
			<div className="relative flex min-w-0 flex-1 items-center">
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
							placeholder={t({
								message: "Enter URL or search...",
							})}
							className="h-[22px] w-full rounded-md border border-ring/60 bg-muted/30 px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
							spellCheck={false}
							autoComplete="off"
							onMouseDown={suspendAncestorDragForTextSelection}
						/>
					</form>
				) : (
					<button
						type="button"
						title={isBlank ? undefined : url}
						onClick={enterEditMode}
						className="group flex h-[22px] w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted/40"
					>
						{isBlank ? (
							<span className="min-w-0 truncate text-muted-foreground/40">
								<Trans>Enter URL or search...</Trans>
							</span>
						) : (
							<>
								<BrowserTabFavicon src={faviconUrl} />
								<span className="min-w-0 truncate text-foreground/75 transition-colors group-hover:text-foreground">
									{url}
								</span>
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
