/**
 * DataTrackerFormPage - 데이터 트래커 생성/수정 폼
 */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDataTrackerAdminGetById,
  useDataTrackerAdminCreate,
  useDataTrackerAdminUpdate,
} from "../hooks";

interface Props {}

export function DataTrackerFormPage({}: Props) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { trackerId?: string };
  const isEditMode = !!params.trackerId;

  const { data: existingTracker, isLoading: isLoadingTracker } =
    useDataTrackerAdminGetById(params.trackerId ?? "");
  const createTracker = useDataTrackerAdminCreate();
  const updateTracker = useDataTrackerAdminUpdate();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"personal" | "organization" | "all">("all");
  const [chartType, setChartType] = useState<"line" | "bar" | "pie">("line");
  const [columns, setColumns] = useState<ColumnRow[]>([
    { key: "", label: "", dataType: "text", isRequired: false },
  ]);

  // Chart config
  const [yAxisKey, setYAxisKey] = useState("");
  const [groupByKey, setGroupByKey] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [valueKey, setValueKey] = useState("");
  const [aggregation, setAggregation] = useState<AggregationType>("sum");

  // Pre-fill form for edit mode
  useEffect(() => {
    if (isEditMode && existingTracker) {
      setName(existingTracker.name);
      setDescription(existingTracker.description ?? "");
      setScope(existingTracker.scope);
      setChartType(existingTracker.chartType);

      if (existingTracker.columns.length > 0) {
        setColumns(
          existingTracker.columns.map((col) => ({
            key: col.key,
            label: col.label,
            dataType: col.dataType,
            isRequired: col.isRequired,
          })),
        );
      }

      const config = existingTracker.chartConfig;
      if (config) {
        setYAxisKey(config.yAxisKey ?? "");
        setGroupByKey(config.groupByKey ?? "");
        setCategoryKey(config.categoryKey ?? "");
        setValueKey(config.valueKey ?? "");
        setAggregation(config.aggregation ?? "sum");
      }
    }
  }, [isEditMode, existingTracker]);

  const numberColumns = columns.filter((c) => c.dataType === "number" && c.key);
  const textColumns = columns.filter((c) => c.dataType === "text" && c.key);

  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      { key: "", label: "", dataType: "text", isRequired: false },
    ]);
  };

  const handleRemoveColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleColumnChange = (
    index: number,
    field: keyof ColumnRow,
    value: string | boolean,
  ) => {
    setColumns((prev) =>
      prev.map((col, i) => (i === index ? { ...col, [field]: value } : col)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("트래커 이름을 입력해주세요.");
      return;
    }

    const validColumns = columns.filter((c) => c.key.trim() && c.label.trim());
    if (validColumns.length === 0) {
      toast.error("최소 1개의 컬럼을 정의해주세요.");
      return;
    }

    const chartConfig = buildChartConfig();

    const columnsData = validColumns.map((col, index) => ({
      key: col.key,
      label: col.label,
      dataType: col.dataType as "text" | "number",
      isRequired: col.isRequired,
      sortOrder: index,
    }));

    if (isEditMode && params.trackerId) {
      updateTracker.mutate(
        {
          id: params.trackerId,
          name,
          description: description || undefined,
          chartType,
          chartConfig,
          scope,
          columns: columnsData,
        },
        {
          onSuccess: () => {
            toast.success("트래커가 수정되었습니다.");
            navigate({ to: "/data-tracker" });
          },
          onError: () => toast.error("트래커 수정에 실패했습니다."),
        },
      );
    } else {
      createTracker.mutate(
        {
          name,
          description: description || undefined,
          chartType,
          chartConfig,
          scope,
          columns: columnsData,
        },
        {
          onSuccess: () => {
            toast.success("트래커가 생성되었습니다.");
            navigate({ to: "/data-tracker" });
          },
          onError: () => toast.error("트래커 생성에 실패했습니다."),
        },
      );
    }
  };

  const buildChartConfig = () => {
    if (chartType === "pie") {
      return {
        categoryKey: categoryKey || undefined,
        valueKey: valueKey || undefined,
        aggregation,
      };
    }
    return {
      yAxisKey: yAxisKey || undefined,
      groupByKey: groupByKey || undefined,
      aggregation,
    };
  };

  const isPending = createTracker.isPending || updateTracker.isPending;

  if (isEditMode && isLoadingTracker) {
    return (
      <div className="container mx-auto py-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full max-w-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title={isEditMode ? "트래커 수정" : "새 트래커"}
        description={
          isEditMode
            ? "트래커 설정을 수정합니다"
            : "새로운 데이터 트래커를 생성합니다"
        }
        icon={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/data-tracker" })}
          >
            <ArrowLeft className="size-4" />
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-8">
        {/* 기본 정보 */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">기본 정보</h2>
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="트래커 이름"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">설명 (선택)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="트래커에 대한 설명"
              rows={3}
            />
          </div>
        </section>

        {/* 범위 */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">범위</h2>
          <div className="space-y-2">
            <Label>범위 (Scope)</Label>
            <Select value={scope} onValueChange={(v) => { if (v) setScope(v as typeof scope); }}>
              <SelectTrigger>
                <SelectValue placeholder="범위를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">개인</SelectItem>
                <SelectItem value="organization">조직</SelectItem>
                <SelectItem value="all">전체</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* 컬럼 정의 */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">컬럼 정의</h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddColumn}>
              <Plus className="mr-1 size-3.5" />
              컬럼 추가
            </Button>
          </div>
          <div className="space-y-3">
            {columns.map((col, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">키</Label>
                      <Input
                        value={col.key}
                        onChange={(e) =>
                          handleColumnChange(index, "key", e.target.value)
                        }
                        placeholder="column_key"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">라벨</Label>
                      <Input
                        value={col.label}
                        onChange={(e) =>
                          handleColumnChange(index, "label", e.target.value)
                        }
                        placeholder="표시 이름"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">데이터 타입</Label>
                      <Select
                        value={col.dataType}
                        onValueChange={(v) => {
                          if (v) handleColumnChange(index, "dataType", v);
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">텍스트</SelectItem>
                          <SelectItem value="number">숫자</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Checkbox
                        id={`required-${index}`}
                        checked={col.isRequired}
                        onCheckedChange={(checked) =>
                          handleColumnChange(index, "isRequired", !!checked)
                        }
                      />
                      <Label
                        htmlFor={`required-${index}`}
                        className="text-sm text-muted-foreground"
                      >
                        필수
                      </Label>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveColumn(index)}
                  disabled={columns.length <= 1}
                  className="mt-6 shrink-0"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* 차트 설정 */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">차트 설정</h2>
          <div className="space-y-2">
            <Label>차트 타입</Label>
            <Select
              value={chartType}
              onValueChange={(v) => { if (v) setChartType(v as typeof chartType); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">라인 차트</SelectItem>
                <SelectItem value="bar">바 차트</SelectItem>
                <SelectItem value="pie">파이 차트</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* line/bar 설정 */}
          {(chartType === "line" || chartType === "bar") && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Y축 키 (숫자 컬럼)</Label>
                <Select value={yAxisKey} onValueChange={(v) => setYAxisKey(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="숫자 컬럼을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {numberColumns.length > 0 ? (
                      numberColumns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label || col.key}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_none" disabled>
                        숫자 타입 컬럼을 먼저 추가하세요
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>그룹 키 (텍스트 컬럼, 선택)</Label>
                <Select value={groupByKey} onValueChange={(v) => setGroupByKey(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="선택 안 함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안 함</SelectItem>
                    {textColumns.map((col) => (
                      <SelectItem key={col.key} value={col.key}>
                        {col.label || col.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* pie 설정 */}
          {chartType === "pie" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>카테고리 키 (텍스트 컬럼)</Label>
                <Select value={categoryKey} onValueChange={(v) => setCategoryKey(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="텍스트 컬럼을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {textColumns.length > 0 ? (
                      textColumns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label || col.key}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_none" disabled>
                        텍스트 타입 컬럼을 먼저 추가하세요
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>값 키 (숫자 컬럼)</Label>
                <Select value={valueKey} onValueChange={(v) => setValueKey(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="숫자 컬럼을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {numberColumns.length > 0 ? (
                      numberColumns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label || col.key}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_none" disabled>
                        숫자 타입 컬럼을 먼저 추가하세요
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* 집계 함수 (공통) */}
          <div className="space-y-2">
            <Label>집계 함수</Label>
            <Select
              value={aggregation}
              onValueChange={(v) => { if (v) setAggregation(v as AggregationType); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">합계 (Sum)</SelectItem>
                <SelectItem value="avg">평균 (Avg)</SelectItem>
                <SelectItem value="count">개수 (Count)</SelectItem>
                <SelectItem value="min">최솟값 (Min)</SelectItem>
                <SelectItem value="max">최댓값 (Max)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* 저장 버튼 */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "저장 중..." : isEditMode ? "수정" : "생성"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/data-tracker" })}
          >
            취소
          </Button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface ColumnRow {
  key: string;
  label: string;
  dataType: string;
  isRequired: boolean;
}

type AggregationType = "sum" | "avg" | "count" | "min" | "max";
