import { Trans, useLingui } from "@lingui/react/macro";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useDeferredValue,
	useMemo,
	useRef,
	useState,
} from "react";
import { LuSearch, LuShuffle } from "react-icons/lu";
import { useProjectIcons } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectIcons";
import { ProjectColorSwatches } from "./components/ProjectColorSwatches";
import { ProjectIconColorOptions } from "./components/ProjectIconColorOptions";
import { ProjectIconGrid } from "./components/ProjectIconGrid";

interface ProjectIconPickerProps {
	icon: string | null;
	color: string | null;
	onChange: (value: { icon: string | null; color: string | null }) => void;
	children: ReactNode;
}

export function ProjectIconPicker({
	icon,
	color,
	onChange,
	children,
}: ProjectIconPickerProps) {
	const { t } = useLingui();
	const icons = useProjectIcons();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [previewColor, setPreviewColor] = useState(color);
	const [pendingIcon, setPendingIcon] = useState<string | null>(null);
	const filterRef = useRef<HTMLInputElement>(null);
	const pendingAnchorRef = useRef<{ getBoundingClientRect: () => DOMRect }>({
		getBoundingClientRect: () => new DOMRect(),
	});
	const names = useMemo(() => Object.keys(icons ?? {}), [icons]);
	const deferredQuery = useDeferredValue(query);
	const shown = useMemo(() => {
		const needle = deferredQuery.trim().toLowerCase().replace(/\s+/g, "-");
		return needle ? names.filter((name) => name.includes(needle)) : names;
	}, [names, deferredQuery]);
	const PendingIcon = pendingIcon ? icons?.[pendingIcon] : undefined;

	const finish = (value: { icon: string | null; color: string | null }) => {
		onChange(value);
		setPendingIcon(null);
		setOpen(false);
		setQuery("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) setPreviewColor(color);
				else setPendingIcon(null);
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[412px] p-0"
				onClick={(event) => event.stopPropagation()}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					filterRef.current?.focus();
				}}
			>
				<div className="flex items-center justify-between px-3 pt-2.5">
					<span className="text-xs font-medium text-muted-foreground">
						<Trans>Icons</Trans>
					</span>
					{icon && (
						<button
							type="button"
							onClick={() => finish({ icon: null, color })}
							className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground"
						>
							<Trans>Remove</Trans>
						</button>
					)}
				</div>
				<div className="flex items-center gap-1.5 px-3 pt-2">
					<div className="relative flex-1">
						<LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<input
							ref={filterRef}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t({ message: "Filter…" })}
							className="h-8 w-full rounded-md border border-border bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
					</div>
					<button
						type="button"
						onClick={() => {
							const random = names[Math.floor(Math.random() * names.length)];
							if (random) finish({ icon: random, color: previewColor });
						}}
						aria-label={t({ message: "Random icon" })}
						className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuShuffle className="size-3.5" />
					</button>
					<Popover>
						<PopoverTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Color" })}
								className="flex size-8 items-center justify-center rounded-md border border-border hover:bg-fill-hover"
							>
								<span
									className={cn(
										"size-3.5 rounded-full",
										!previewColor && "bg-muted-foreground/60",
									)}
									style={
										previewColor ? { backgroundColor: previewColor } : undefined
									}
								/>
							</button>
						</PopoverTrigger>
						<PopoverContent align="end" className="w-auto p-1.5">
							<ProjectColorSwatches
								value={previewColor}
								onChange={setPreviewColor}
							/>
						</PopoverContent>
					</Popover>
				</div>
				{icons && (
					<ProjectIconGrid
						names={shown}
						icons={icons}
						selected={pendingIcon ?? icon}
						color={previewColor}
						onPick={(name, event) => {
							pendingAnchorRef.current = event.currentTarget;
							setPendingIcon(name);
						}}
					/>
				)}
				{icons && shown.length === 0 && (
					<div className="px-3 pb-3 text-sm text-muted-foreground">
						<Trans>No icons match.</Trans>
					</div>
				)}
				<Popover
					open={pendingIcon !== null}
					onOpenChange={(next) => {
						if (!next) setPendingIcon(null);
					}}
				>
					<PopoverAnchor virtualRef={pendingAnchorRef} />
					<PopoverContent side="bottom" align="start" className="w-auto p-1.5">
						{pendingIcon && PendingIcon && (
							<ProjectIconColorOptions
								Icon={PendingIcon}
								selected={previewColor}
								onPick={(picked) =>
									finish({ icon: pendingIcon, color: picked })
								}
							/>
						)}
					</PopoverContent>
				</Popover>
			</PopoverContent>
		</Popover>
	);
}
