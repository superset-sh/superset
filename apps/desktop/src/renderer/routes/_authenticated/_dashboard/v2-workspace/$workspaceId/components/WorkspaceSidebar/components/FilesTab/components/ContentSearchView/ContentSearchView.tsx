import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	CaseSensitive,
	ChevronDown,
	ChevronRight,
	Loader2,
	Regex,
	WholeWord,
	X,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { FileIcon } from "renderer/lib/fileIcons";
import type { OpenFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { SearchOptionToggle } from "./components/SearchOptionToggle";

const SEARCH_RESULT_LIMIT = 500;

interface ContentSearchViewProps {
	workspaceId: string;
	onClose: () => void;
	onSelectFile: OpenFile;
}

interface SearchOptions {
	isCaseSensitive: boolean;
	isWordMatch: boolean;
	isRegExp: boolean;
}

function isValidRegularExpression(query: string): boolean {
	try {
		new RegExp(query, "u");
		return true;
	} catch {
		return false;
	}
}

export function ContentSearchView({
	workspaceId,
	onClose,
	onSelectFile,
}: ContentSearchViewProps) {
	const { t } = useLingui();
	const includeId = useId();
	const excludeId = useId();
	const [query, setQuery] = useState("");
	const [includePattern, setIncludePattern] = useState("");
	const [excludePattern, setExcludePattern] = useState("");
	const [options, setOptions] = useState<SearchOptions>({
		isCaseSensitive: false,
		isWordMatch: false,
		isRegExp: false,
	});
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(
		() => new Set(),
	);
	const debouncedQuery = useDebouncedValue(query.trim(), 200);
	const debouncedIncludePattern = useDebouncedValue(includePattern.trim(), 200);
	const debouncedExcludePattern = useDebouncedValue(excludePattern.trim(), 200);
	const regexIsValid =
		!options.isRegExp ||
		!debouncedQuery ||
		isValidRegularExpression(debouncedQuery);
	const search = workspaceTrpc.filesystem.searchContent.useQuery(
		{
			workspaceId,
			query: debouncedQuery,
			includeHidden: false,
			includePattern: debouncedIncludePattern,
			excludePattern: debouncedExcludePattern,
			...options,
			maxCountPerFile: SEARCH_RESULT_LIMIT,
			limit: SEARCH_RESULT_LIMIT,
		},
		{
			enabled: debouncedQuery.length > 0 && regexIsValid,
			placeholderData: (previous) => previous,
		},
	);
	const groups = useMemo(() => {
		const byPath = new Map<
			string,
			NonNullable<typeof search.data>["matches"]
		>();
		for (const match of search.data?.matches ?? []) {
			const matches = byPath.get(match.relativePath);
			if (matches) matches.push(match);
			else byPath.set(match.relativePath, [match]);
		}
		return Array.from(byPath.entries()).map(([relativePath, matches]) => ({
			relativePath,
			matches: matches.sort((a, b) => a.line - b.line || a.column - b.column),
		}));
	}, [search.data]);

	function toggleOption(option: keyof SearchOptions, pressed: boolean) {
		setOptions((current) => ({ ...current, [option]: pressed }));
	}

	function toggleFile(relativePath: string) {
		setCollapsedFiles((current) => {
			const next = new Set(current);
			if (next.has(relativePath)) next.delete(relativePath);
			else next.add(relativePath);
			return next;
		});
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-background">
			<div className="space-y-2 border-b border-border p-2">
				<div className="flex items-center gap-1">
					<div className="relative min-w-0 flex-1">
						<Input
							autoFocus
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") onClose();
							}}
							placeholder={t({ message: "Search in Files" })}
							aria-invalid={!regexIsValid}
							className="h-8 pr-24 text-xs"
						/>
						<div className="absolute inset-y-0 right-1 flex items-center">
							<SearchOptionToggle
								label={t({ message: "Match case" })}
								pressed={options.isCaseSensitive}
								onPressedChange={(pressed) =>
									toggleOption("isCaseSensitive", pressed)
								}
								icon={CaseSensitive}
							/>
							<SearchOptionToggle
								label={t({ message: "Match whole word" })}
								pressed={options.isWordMatch}
								onPressedChange={(pressed) =>
									toggleOption("isWordMatch", pressed)
								}
								icon={WholeWord}
							/>
							<SearchOptionToggle
								label={t({ message: "Use regular expression" })}
								pressed={options.isRegExp}
								onPressedChange={(pressed) => toggleOption("isRegExp", pressed)}
								icon={Regex}
							/>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0 text-muted-foreground"
						onClick={onClose}
						aria-label={t({ message: "Close" })}
					>
						<X className="size-4" />
					</Button>
				</div>
				{!regexIsValid && (
					<p className="px-1 text-xs text-destructive">
						<Trans>Invalid regular expression</Trans>
					</p>
				)}
				<label
					htmlFor={includeId}
					className="block space-y-1 text-xs text-muted-foreground"
				>
					<span>
						<Trans>files to include (glob)</Trans>
					</span>
					<Input
						id={includeId}
						value={includePattern}
						onChange={(event) => setIncludePattern(event.target.value)}
						placeholder="src/**, *.ts"
						className="h-7 text-xs"
					/>
				</label>
				<label
					htmlFor={excludeId}
					className="block space-y-1 text-xs text-muted-foreground"
				>
					<span>
						<Trans>files to exclude (glob)</Trans>
					</span>
					<Input
						id={excludeId}
						value={excludePattern}
						onChange={(event) => setExcludePattern(event.target.value)}
						placeholder="**/*.test.ts"
						className="h-7 text-xs"
					/>
				</label>
			</div>

			<div className="min-h-0 flex-1 overflow-auto py-1">
				{search.isFetching && debouncedQuery && (
					<div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
						<Loader2 className="size-3.5 animate-spin" />
						<Trans>Searching…</Trans>
					</div>
				)}
				{search.error && (
					<p className="px-3 py-3 text-xs text-destructive">
						{errorMessage(search.error)}
					</p>
				)}
				{!search.isFetching &&
					!search.error &&
					debouncedQuery &&
					regexIsValid &&
					groups.length === 0 && (
						<p className="px-3 py-3 text-xs text-muted-foreground">
							<Trans>No results found.</Trans>
						</p>
					)}
				{debouncedQuery &&
					regexIsValid &&
					groups.map(({ relativePath, matches }) => {
						const collapsed = collapsedFiles.has(relativePath);
						const fileName = relativePath.split(/[\\/]/).at(-1) ?? relativePath;
						const directory = relativePath
							.slice(0, -fileName.length)
							.replace(/[\\/]$/, "");
						return (
							<div key={relativePath}>
								<button
									type="button"
									onClick={() => toggleFile(relativePath)}
									className="flex h-7 w-full items-center gap-1 px-2 text-left text-xs hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
								>
									{collapsed ? (
										<ChevronRight className="size-3.5 shrink-0" />
									) : (
										<ChevronDown className="size-3.5 shrink-0" />
									)}
									<FileIcon fileName={fileName} className="size-3.5 shrink-0" />
									<span className="truncate font-medium">{fileName}</span>
									{directory && (
										<span className="min-w-0 truncate text-muted-foreground">
											{directory}
										</span>
									)}
									<span className="ml-auto text-muted-foreground">
										{matches.length}
									</span>
								</button>
								{!collapsed &&
									matches.map((match) => (
										<button
											type="button"
											key={`${match.line}:${match.column}`}
											onClick={(event) =>
												onSelectFile(match.absolutePath, event.shiftKey, {
													line: match.line,
													column: match.column,
												})
											}
											className="flex min-h-7 w-full items-start gap-2 py-1 pl-8 pr-2 text-left text-xs hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
										>
											<span className="w-8 shrink-0 text-right font-mono text-muted-foreground">
												{match.line}
											</span>
											<span className="min-w-0 break-words font-mono">
												{match.preview}
											</span>
										</button>
									))}
							</div>
						);
					})}
				{debouncedQuery &&
					regexIsValid &&
					(search.data?.matches.length ?? 0) === SEARCH_RESULT_LIMIT && (
						<p className="px-3 py-2 text-xs text-muted-foreground">
							<Trans>Showing the first 500 results.</Trans>
						</p>
					)}
			</div>
		</div>
	);
}
