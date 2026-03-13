import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { parsePrimaryFamily } from "../../font-utils";
import type { FontInfo } from "../../hooks/useSystemFonts";

interface FontFamilyComboboxProps {
	value: string | null;
	defaultValue: string;
	onValueChange: (v: string | null) => void;
	disabled?: boolean;
	variant: "editor" | "terminal";
	fonts: FontInfo[];
	fontsLoading: boolean;
}

const MAX_VISIBLE = 100;

export function FontFamilyCombobox({
	value,
	defaultValue,
	onValueChange,
	disabled,
	variant,
	fonts,
	fontsLoading,
}: FontFamilyComboboxProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const defaultLabel = useMemo(
		() => parsePrimaryFamily(defaultValue) ?? defaultValue,
		[defaultValue],
	);
	const displayLabel = value ?? defaultLabel;
	const selectedFamily = value ?? defaultValue;

	const { nerdFonts, monoFonts, otherFonts } = useMemo(() => {
		const nerd: FontInfo[] = [];
		const mono: FontInfo[] = [];
		const other: FontInfo[] = [];
		for (const font of fonts) {
			if (font.category === "nerd") nerd.push(font);
			else if (font.category === "mono") mono.push(font);
			else other.push(font);
		}
		return { nerdFonts: nerd, monoFonts: mono, otherFonts: other };
	}, [fonts]);

	const hasExactMatch = useMemo(() => {
		if (!search.trim()) return true;
		const lower = search.toLowerCase().trim();
		return fonts.some((f) => f.family.toLowerCase() === lower);
	}, [fonts, search]);

	function selectFont(family: string) {
		onValueChange(family === defaultValue ? null : family);
		setOpen(false);
		setSearch("");
	}

	function renderGroup(heading: string, items: FontInfo[]) {
		if (items.length === 0) return null;
		const visible = search.trim() ? items : items.slice(0, MAX_VISIBLE);
		return (
			<CommandGroup heading={heading}>
				{visible.map((font) => (
					<CommandItem
						key={font.family}
						value={font.family}
						onSelect={() => selectFont(font.family)}
					>
						<span
							className="truncate flex-1"
							style={{ fontFamily: `"${font.family}"` }}
						>
							{font.family}
						</span>
						{font.family === selectedFamily && (
							<CheckIcon className="size-4 shrink-0 opacity-70" />
						)}
					</CommandItem>
				))}
			</CommandGroup>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className="flex-1 justify-between font-normal truncate"
					disabled={disabled || fontsLoading}
				>
					<span
						className="truncate"
						style={{ fontFamily: `"${displayLabel}"` }}
					>
						{fontsLoading ? "Loading fonts..." : displayLabel}
					</span>
					<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-0" align="start" side="top">
				<Command shouldFilter={true}>
					<CommandInput
						placeholder="Search fonts..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList>
						<CommandEmpty>
							{search.trim() ? (
								<button
									type="button"
									className="w-full text-center cursor-pointer hover:underline"
									onClick={() => selectFont(search.trim())}
								>
									Use &ldquo;{search.trim()}&rdquo;
								</button>
							) : (
								"No fonts found."
							)}
						</CommandEmpty>
						{!hasExactMatch && search.trim() && (
							<CommandGroup heading="Custom">
								<CommandItem
									value={`__custom__${search.trim()}`}
									onSelect={() => selectFont(search.trim())}
								>
									<span className="truncate flex-1">
										Use &ldquo;{search.trim()}&rdquo;
									</span>
								</CommandItem>
							</CommandGroup>
						)}
						{variant === "terminal" && renderGroup("Nerd Fonts", nerdFonts)}
						{renderGroup("Monospace", monoFonts)}
						{renderGroup("Other", otherFonts)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
