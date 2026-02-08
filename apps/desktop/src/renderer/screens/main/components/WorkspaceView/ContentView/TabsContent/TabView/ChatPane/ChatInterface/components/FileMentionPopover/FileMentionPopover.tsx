import {
	PromptInputButton,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { HiMiniAtSymbol } from "react-icons/hi2";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch";
import { getFileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

const MENTION_SEARCH_LIMIT = 20;

function findAtTriggerIndex(value: string, prevValue: string): number {
	if (value.length !== prevValue.length + 1) return -1;
	for (let i = 0; i < value.length; i++) {
		if (value[i] !== prevValue[i]) {
			if (value[i] !== "@") return -1;
			const charBefore = value[i - 1];
			if (
				charBefore === undefined ||
				charBefore === " " ||
				charBefore === "\n"
			) {
				return i;
			}
			return -1;
		}
	}
	return -1;
}

function getDirectoryPath(relativePath: string): string {
	const lastSlash = relativePath.lastIndexOf("/");
	if (lastSlash === -1) return "";
	return relativePath.slice(0, lastSlash);
}

interface FileMentionContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const FileMentionContext = createContext<FileMentionContextValue | null>(null);

export function FileMentionProvider({
	cwd,
	children,
}: {
	cwd: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [triggerIndex, setTriggerIndex] = useState(-1);
	const { textInput } = usePromptInputController();
	const prevValueRef = useRef(textInput.value);

	useEffect(() => {
		const prev = prevValueRef.current;
		prevValueRef.current = textInput.value;
		const idx = findAtTriggerIndex(textInput.value, prev);
		if (idx !== -1) {
			setTriggerIndex(idx);
			setOpen(true);
		}
	}, [textInput.value]);

	const { searchResults } = useFileSearch({
		worktreePath: cwd || undefined,
		searchTerm: open ? searchQuery : "",
		includeHidden: false,
		limit: MENTION_SEARCH_LIMIT,
	});

	const handleSelect = (relativePath: string) => {
		const current = textInput.value;
		const before = current.slice(0, triggerIndex);
		const after = current.slice(triggerIndex + 1);
		textInput.setInput(`${before}@${relativePath} ${after}`);
		setSearchQuery("");
		setTriggerIndex(-1);
		setOpen(false);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearchQuery("");
	};

	return (
		<FileMentionContext.Provider value={{ open, setOpen }}>
			<Popover open={open} onOpenChange={handleOpenChange}>
				{children}
				<PopoverContent
					side="top"
					align="start"
					sideOffset={0}
					className="w-80 p-0 text-xs"
				>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search files..."
							value={searchQuery}
							onValueChange={setSearchQuery}
						/>
						<CommandList className="max-h-[200px] [&::-webkit-scrollbar]:hidden">
							<CommandEmpty className="px-2 py-3 text-left text-xs text-muted-foreground">
								{searchQuery.length === 0
									? "Type to search files..."
									: "No files found."}
							</CommandEmpty>
							{searchResults.length > 0 && (
								<CommandGroup>
									{searchResults.map((file) => {
										const dirPath = getDirectoryPath(file.relativePath);
										const { icon: Icon, color } = getFileIcon(
											file.name,
											false,
											false,
										);
										return (
											<CommandItem
												key={file.id}
												value={file.relativePath}
												onSelect={() => handleSelect(file.relativePath)}
											>
												<Icon className={cn("size-3.5 shrink-0", color)} />
												<span className="truncate text-xs">{file.name}</span>
												{dirPath && (
													<span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
														{dirPath}
													</span>
												)}
											</CommandItem>
										);
									})}
								</CommandGroup>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</FileMentionContext.Provider>
	);
}

export function FileMentionAnchor({ children }: { children: ReactNode }) {
	return <PopoverAnchor asChild>{children}</PopoverAnchor>;
}

export function FileMentionTrigger() {
	const ctx = useContext(FileMentionContext);
	return (
		<PopoverTrigger asChild>
			<PromptInputButton onClick={() => ctx?.setOpen(!ctx.open)}>
				<HiMiniAtSymbol className="size-4" />
			</PromptInputButton>
		</PopoverTrigger>
	);
}
