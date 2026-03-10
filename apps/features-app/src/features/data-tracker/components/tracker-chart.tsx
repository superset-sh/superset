/**
 * TrackerChart - 트래커 차트 시각화 컴포넌트
 *
 * chartType에 따라 Line/Bar/Pie 차트를 렌더링합니다.
 */
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { format } from "date-fns";
import type { DataTrackerChartConfig } from "@superbuilder/drizzle";

interface ColumnInfo {
  id: string;
  key: string;
  label: string;
  dataType: "text" | "number";
}

interface Props {
  chartType: "line" | "bar" | "pie";
  chartConfig: DataTrackerChartConfig;
  columns: ColumnInfo[];
  entries: {
    date: Date | string;
    data: Record<string, string | number>;
    createdBy?: { name: string } | null;
  }[];
}

export function TrackerChart({ chartType, chartConfig, columns, entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">데이터가 없습니다</p>
      </div>
    );
  }

  if (chartType === "pie") {
    return (
      <PieChartView
        chartConfig={chartConfig}
        columns={columns}
        entries={entries}
      />
    );
  }

  const chartData = buildTimeSeriesData(entries, chartConfig, columns);
  const dataKeys = getDataKeys(chartConfig, columns);

  if (chartType === "bar") {
    return (
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="date"
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
            />
            <YAxis className="text-muted-foreground" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
              }}
            />
            <Legend />
            {dataKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis
            dataKey="date"
            className="text-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <YAxis className="text-muted-foreground" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          />
          <Legend />
          {dataKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface PieChartViewProps {
  chartConfig: DataTrackerChartConfig;
  columns: ColumnInfo[];
  entries: Props["entries"];
}

function PieChartView({ chartConfig, columns, entries }: PieChartViewProps) {
  const pieData = buildPieData(entries, chartConfig, columns);

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            outerRadius={100}
            dataKey="value"
            nameKey="name"
            label={(props: PieLabelRenderProps) => {
              const name = String(props.name ?? "");
              const percent = Number(props.percent ?? 0);
              return `${name} (${(percent * 100).toFixed(0)}%)`;
            }}
            labelLine={true}
          >
            {pieData.map((_entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function buildTimeSeriesData(
  entries: Props["entries"],
  chartConfig: DataTrackerChartConfig,
  columns: ColumnInfo[],
) {
  const yAxisKey = chartConfig.yAxisKey;
  const groupByKey = chartConfig.groupByKey;

  if (groupByKey) {
    const grouped = new Map<string, Map<string, number[]>>();

    for (const entry of entries) {
      const dateStr = formatDate(entry.date);
      const groupValue = String(entry.data[groupByKey] ?? "unknown");

      if (!grouped.has(dateStr)) {
        grouped.set(dateStr, new Map());
      }
      const dateMap = grouped.get(dateStr)!;

      if (!dateMap.has(groupValue)) {
        dateMap.set(groupValue, []);
      }

      const value = yAxisKey ? Number(entry.data[yAxisKey] ?? 0) : 1;
      dateMap.get(groupValue)!.push(value);
    }

    return Array.from(grouped.entries()).map(([dateStr, groupMap]) => {
      const row: Record<string, string | number> = { date: dateStr };
      for (const [group, values] of groupMap.entries()) {
        row[group] = aggregate(values, chartConfig.aggregation);
      }
      return row;
    });
  }

  const dateMap = new Map<string, number[]>();
  for (const entry of entries) {
    const dateStr = formatDate(entry.date);
    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, []);
    }
    const value = yAxisKey ? Number(entry.data[yAxisKey] ?? 0) : 1;
    dateMap.get(dateStr)!.push(value);
  }

  const label =
    columns.find((c) => c.key === yAxisKey)?.label ?? yAxisKey ?? "count";

  return Array.from(dateMap.entries()).map(([dateStr, values]) => ({
    date: dateStr,
    [label]: aggregate(values, chartConfig.aggregation),
  }));
}

function buildPieData(
  entries: Props["entries"],
  chartConfig: DataTrackerChartConfig,
  _columns: ColumnInfo[],
) {
  const categoryKey = chartConfig.categoryKey;
  const valueKey = chartConfig.valueKey;

  if (!categoryKey) {
    return [];
  }

  const categoryMap = new Map<string, number[]>();

  for (const entry of entries) {
    const category = String(entry.data[categoryKey] ?? "unknown");
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    const value = valueKey ? Number(entry.data[valueKey] ?? 0) : 1;
    categoryMap.get(category)!.push(value);
  }

  return Array.from(categoryMap.entries()).map(([name, values]) => ({
    name,
    value: aggregate(values, chartConfig.aggregation),
  }));
}

function getDataKeys(
  chartConfig: DataTrackerChartConfig,
  columns: ColumnInfo[],
): string[] {
  if (chartConfig.groupByKey) {
    return [];
  }

  const yAxisKey = chartConfig.yAxisKey;
  const label =
    columns.find((c) => c.key === yAxisKey)?.label ?? yAxisKey ?? "count";
  return [label];
}

function aggregate(
  values: number[],
  method: DataTrackerChartConfig["aggregation"],
): number {
  if (values.length === 0) return 0;

  switch (method) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    case "count":
      return values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MM/dd");
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 210 70% 50%))",
  "hsl(var(--chart-3, 150 60% 45%))",
  "hsl(var(--chart-4, 40 90% 55%))",
  "hsl(var(--chart-5, 0 70% 55%))",
];
