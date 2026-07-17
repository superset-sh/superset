/**
 * GitHub-garden-style dot grid shared by the company activity matrix and the
 * single-user version on user pages. Pure rendering — callers fetch the data.
 *
 * Encoding: filled circle = routine activity (hue = dominant category, size =
 * volume); shapes = milestones (hollow ring = first day, square = workspace
 * created, diamond = PRs merged).
 */

const CELL = 12;
const ROW_H = 22;
const HEADER_H = 32;

export const CATEGORY_COLORS = {
	terminal: "#fbbf24",
	chat: "#a78bfa",
	workspace: "#38bdf8",
} as const;
const CREATED_COLOR = "#34d399";
const FIRST_DAY_COLOR = "#34d399";
const PR_COLOR = "#e879f9";
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
	month: "short",
	timeZone: "UTC",
});
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

export interface DotGridCell {
	d: number;
	terminal: number;
	chat: number;
	workspace: number;
	created: number;
}

export interface DotGridRow {
	key: string;
	/** Rendered in the sticky left column; empty string hides the column space. */
	label: React.ReactNode;
	cells: DotGridCell[];
	firstDayIndex: number | null;
}

export interface DotGridPrCell {
	d: number;
	count: number;
	authors: string[];
}

function dateForDay(start: Date, d: number): Date {
	return new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
}

function dominantCategory(cell: DotGridCell): keyof typeof CATEGORY_COLORS {
	if (cell.terminal >= cell.chat && cell.terminal >= cell.workspace) {
		return "terminal";
	}
	return cell.chat >= cell.workspace ? "chat" : "workspace";
}

function dotRadius(total: number): number {
	if (total >= 20) return 4.5;
	if (total >= 5) return 3.5;
	return 2.5;
}

function cellTooltip(cell: DotGridCell, day: string): string {
	const parts = [
		cell.terminal > 0 && `${cell.terminal} terminal`,
		cell.chat > 0 && `${cell.chat} chat`,
		cell.workspace > 0 && `${cell.workspace} workspace`,
		cell.created > 0 && `${cell.created} workspace created`,
	].filter(Boolean);
	return `${day} — ${parts.join(", ")}`;
}

function RowDots({
	row,
	start,
	rowIndex,
}: {
	row: DotGridRow;
	start: Date;
	rowIndex: number;
}) {
	const cy = HEADER_H + rowIndex * ROW_H + ROW_H / 2;
	return (
		<g>
			{row.firstDayIndex != null && (
				<circle
					cx={row.firstDayIndex * CELL + CELL / 2}
					cy={cy}
					r={4.5}
					fill="none"
					stroke={FIRST_DAY_COLOR}
					strokeWidth={1.5}
				>
					<title>{`${DAY_FORMAT.format(dateForDay(start, row.firstDayIndex))} — first day (signed up)`}</title>
				</circle>
			)}
			{row.cells.map((cell) => {
				const cx = cell.d * CELL + CELL / 2;
				const total = cell.terminal + cell.chat + cell.workspace;
				const day = DAY_FORMAT.format(dateForDay(start, cell.d));
				const categoryCount = [cell.terminal, cell.chat, cell.workspace].filter(
					(count) => count > 0,
				).length;
				if (cell.created > 0) {
					return (
						<rect
							key={cell.d}
							x={cx - 3.5}
							y={cy - 3.5}
							width={7}
							height={7}
							rx={1.5}
							fill={CREATED_COLOR}
						>
							<title>{cellTooltip(cell, day)}</title>
						</rect>
					);
				}
				return (
					<circle
						key={cell.d}
						cx={cx}
						cy={cy}
						r={dotRadius(total)}
						fill={CATEGORY_COLORS[dominantCategory(cell)]}
						stroke={categoryCount > 1 ? "#e2e8f0" : "none"}
						strokeWidth={categoryCount > 1 ? 1 : 0}
						strokeOpacity={0.6}
					>
						<title>{cellTooltip(cell, day)}</title>
					</circle>
				);
			})}
		</g>
	);
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<span
				className="size-2.5 rounded-full"
				style={{ backgroundColor: color }}
			/>
			{label}
		</span>
	);
}

export interface ActivityDotGridProps {
	start: Date;
	days: number;
	rows: DotGridRow[];
	/** Optional company-level "PRs merged" row rendered above the user rows. */
	prCells?: DotGridPrCell[];
	/** Hide the left label column (single-row usage). */
	hideLabels?: boolean;
	isFetching?: boolean;
	footer?: React.ReactNode;
}

export function ActivityDotGrid({
	start,
	days,
	rows,
	prCells,
	hideLabels = false,
	isFetching = false,
	footer,
}: ActivityDotGridProps) {
	const hasPrRow = (prCells?.length ?? 0) > 0;
	const totalRows = rows.length + (hasPrRow ? 1 : 0);
	const gridWidth = days * CELL;
	const gridHeight = HEADER_H + totalRows * ROW_H;
	const rowOffset = hasPrRow ? 1 : 0;

	return (
		<div className="space-y-3">
			<div
				className={isFetching ? "flex opacity-60 transition-opacity" : "flex"}
			>
				{!hideLabels && (
					<div className="w-40 shrink-0">
						<div style={{ height: HEADER_H }} />
						{hasPrRow && (
							<div
								className="text-muted-foreground flex items-center text-xs font-medium"
								style={{ height: ROW_H }}
							>
								PRs merged
							</div>
						)}
						{rows.map((row) => (
							<div
								key={row.key}
								className="flex items-center pr-3"
								style={{ height: ROW_H }}
							>
								{row.label}
							</div>
						))}
					</div>
				)}
				<div className="overflow-x-auto">
					<svg
						width={gridWidth}
						height={gridHeight}
						role="img"
						aria-label="Daily activity dot plot"
					>
						{/* Weekend shading */}
						{Array.from({ length: days }, (_, d) => d)
							.filter((d) => {
								const weekday = dateForDay(start, d).getUTCDay();
								return weekday === 0 || weekday === 6;
							})
							.map((d) => (
								<rect
									key={d}
									x={d * CELL}
									y={HEADER_H}
									width={CELL}
									height={totalRows * ROW_H}
									fill="currentColor"
									opacity={0.04}
								/>
							))}
						{/* Month labels */}
						{Array.from({ length: days }, (_, d) => d)
							.filter((d) => d === 0 || dateForDay(start, d).getUTCDate() === 1)
							.map((d) => (
								<text
									key={d}
									x={d * CELL + 2}
									y={12}
									className="fill-muted-foreground"
									fontSize={10}
								>
									{MONTH_FORMAT.format(dateForDay(start, d))}
								</text>
							))}
						{/* Day-of-week initials */}
						{Array.from({ length: days }, (_, d) => d).map((d) => (
							<text
								key={d}
								x={d * CELL + CELL / 2}
								y={HEADER_H - 6}
								textAnchor="middle"
								className="fill-muted-foreground"
								fontSize={8}
								opacity={0.7}
							>
								{WEEKDAY_LETTERS[dateForDay(start, d).getUTCDay()]}
							</text>
						))}
						{/* Row separators */}
						{Array.from({ length: totalRows }, (_, row) => row).map((row) => (
							<line
								key={row}
								x1={0}
								x2={gridWidth}
								y1={HEADER_H + row * ROW_H}
								y2={HEADER_H + row * ROW_H}
								stroke="currentColor"
								strokeOpacity={0.06}
							/>
						))}
						{/* PR merge diamonds (company-level) */}
						{hasPrRow &&
							prCells?.map((cell) => {
								const cx = cell.d * CELL + CELL / 2;
								const cy = HEADER_H + ROW_H / 2;
								const size = cell.count > 2 ? 4.5 : 3.5;
								return (
									<rect
										key={cell.d}
										x={cx - size}
										y={cy - size}
										width={size * 2}
										height={size * 2}
										rx={1}
										transform={`rotate(45 ${cx} ${cy})`}
										fill={PR_COLOR}
									>
										<title>{`${DAY_FORMAT.format(dateForDay(start, cell.d))} — ${cell.count} PR${cell.count === 1 ? "" : "s"} merged (${cell.authors.join(", ")})`}</title>
									</rect>
								);
							})}
						{rows.map((row, index) => (
							<RowDots
								key={row.key}
								row={row}
								start={start}
								rowIndex={index + rowOffset}
							/>
						))}
					</svg>
				</div>
			</div>
			<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
				<LegendDot color={CATEGORY_COLORS.terminal} label="Terminal" />
				<LegendDot color={CATEGORY_COLORS.chat} label="Chat" />
				<LegendDot color={CATEGORY_COLORS.workspace} label="Workspace" />
				<span className="flex items-center gap-1.5">
					<span
						className="size-2.5 rounded-[3px]"
						style={{ backgroundColor: CREATED_COLOR }}
					/>
					Workspace created
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className="size-2.5 rounded-full border-[1.5px]"
						style={{ borderColor: FIRST_DAY_COLOR }}
					/>
					First day
				</span>
				{hasPrRow && (
					<span className="flex items-center gap-1.5">
						<span
							className="size-2.5 rotate-45 rounded-[2px]"
							style={{ backgroundColor: PR_COLOR }}
						/>
						PR merged
					</span>
				)}
				<span>Dot size = event volume</span>
				{footer}
			</div>
		</div>
	);
}
