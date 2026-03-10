/**
 * TrackerDetail - 트래커 상세 페이지 콘텐츠
 *
 * 차트/데이터 탭으로 구성. 차트 탭은 기간 필터와 스코프 토글을 제공하고,
 * 데이터 탭은 엔트리 테이블, 입력/수정/삭제, CSV 가져오기를 제공합니다.
 */
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@superbuilder/feature-ui/shadcn/tabs";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Plus, Upload } from "lucide-react";
import { useTrackerEntries, useTrackerChartData } from "../hooks";
import { TrackerChart } from "../components/tracker-chart";
import { EntryTable } from "../components/entry-table";
import { EntryFormDialog } from "../components/entry-form-dialog";
import { CsvImportDialog } from "../components/csv-import-dialog";

interface TrackerColumnInfo {
  id: string;
  key: string;
  label: string;
  dataType: "text" | "number";
  isRequired: boolean;
  sortOrder: number;
  trackerId: string;
}

interface Props {
  tracker: {
    id: string;
    name: string;
    description: string | null;
    chartType: "line" | "bar" | "pie";
    chartConfig: {
      yAxisKey?: string;
      groupByKey?: string;
      categoryKey?: string;
      valueKey?: string;
      aggregation: "sum" | "avg" | "count" | "min" | "max";
    };
    scope: "personal" | "organization" | "all";
    columns: TrackerColumnInfo[];
  };
}

export function TrackerDetail({ tracker }: Props) {
  const [activeTab, setActiveTab] = useState("chart");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="chart">차트</TabsTrigger>
        <TabsTrigger value="data">데이터</TabsTrigger>
      </TabsList>

      <TabsContent value="chart">
        <ChartTab tracker={tracker} />
      </TabsContent>

      <TabsContent value="data">
        <DataTab tracker={tracker} />
      </TabsContent>
    </Tabs>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface TabProps {
  tracker: Props["tracker"];
}

function ChartTab({ tracker }: TabProps) {
  const [days, setDays] = useState(30);
  const [viewMode, setViewMode] = useState<"personal" | "organization">(
    "organization",
  );

  const { data: entries, isLoading } = useTrackerChartData(
    tracker.id,
    days,
    viewMode,
  );

  return (
    <div className="flex flex-col gap-6 pt-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={days === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {tracker.scope === "all" && (
          <div className="flex gap-1">
            <Button
              variant={viewMode === "organization" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("organization")}
            >
              조직
            </Button>
            <Button
              variant={viewMode === "personal" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("personal")}
            >
              개인
            </Button>
          </div>
        )}
      </div>

      {/* Chart */}
      {isLoading ? (
        <Skeleton className="h-80 w-full rounded-lg" />
      ) : (
        <TrackerChart
          chartType={tracker.chartType}
          chartConfig={tracker.chartConfig}
          columns={tracker.columns}
          entries={entries ?? []}
        />
      )}
    </div>
  );
}

function DataTab({ tracker }: TabProps) {
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"personal" | "organization">(
    "organization",
  );
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<{
    id: string;
    date: Date | string;
    data: Record<string, string | number>;
  } | null>(null);

  const { data: entriesResult, isLoading } = useTrackerEntries(
    tracker.id,
    page,
    20,
    viewMode,
  );

  const handleEditEntry = (entry: {
    id: string;
    date: Date | string;
    data: Record<string, string | number>;
  }) => {
    setEditEntry(entry);
    setEntryDialogOpen(true);
  };

  const handleAddEntry = () => {
    setEditEntry(null);
    setEntryDialogOpen(true);
  };

  const handleEntryDialogClose = (open: boolean) => {
    setEntryDialogOpen(open);
    if (!open) {
      setEditEntry(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAddEntry}>
            <Plus className="mr-2 size-4" />
            데이터 입력
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCsvDialogOpen(true)}
          >
            <Upload className="mr-2 size-4" />
            CSV 가져오기
          </Button>
        </div>

        {tracker.scope === "all" && (
          <div className="flex gap-1">
            <Button
              variant={viewMode === "organization" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("organization")}
            >
              조직
            </Button>
            <Button
              variant={viewMode === "personal" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("personal")}
            >
              개인
            </Button>
          </div>
        )}
      </div>

      {/* Entry Table */}
      <EntryTable
        columns={tracker.columns}
        entries={entriesResult?.data ?? []}
        total={entriesResult?.total ?? 0}
        page={page}
        totalPages={entriesResult?.totalPages ?? 1}
        isLoading={isLoading}
        onPageChange={setPage}
        onEditEntry={handleEditEntry}
      />

      {/* Entry Form Dialog */}
      <EntryFormDialog
        open={entryDialogOpen}
        onOpenChange={handleEntryDialogClose}
        trackerId={tracker.id}
        columns={tracker.columns}
        editEntry={editEntry}
      />

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={csvDialogOpen}
        onOpenChange={setCsvDialogOpen}
        trackerId={tracker.id}
        columns={tracker.columns}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const DATE_RANGE_OPTIONS = [
  { label: "7일", value: 7 },
  { label: "30일", value: 30 },
  { label: "90일", value: 90 },
  { label: "전체", value: 365 },
];
