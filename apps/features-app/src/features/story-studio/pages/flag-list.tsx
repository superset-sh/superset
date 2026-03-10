/**
 * FlagList - 플래그 목록 관리
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Flag, Plus, Trash2 } from "lucide-react";
import { useCreateFlag, useDeleteFlag, useFlags } from "../hooks";

const CATEGORY_TABS = [
  { value: "all", label: "전체" },
  { value: "character", label: "캐릭터" },
  { value: "quest", label: "퀘스트" },
  { value: "world", label: "월드" },
  { value: "system", label: "시스템" },
];

const TYPE_OPTIONS = [
  { value: "boolean", label: "Boolean" },
  { value: "number", label: "Number" },
  { value: "string", label: "String" },
  { value: "enum", label: "Enum" },
];

export function FlagList() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const projectId = id ?? "";

  const { data: flags, isLoading } = useFlags(projectId);
  const createFlag = useCreateFlag(projectId);
  const deleteFlag = useDeleteFlag(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [name, setName] = useState("");
  const [type, setType] = useState("boolean");
  const [defaultValue, setDefaultValue] = useState("");
  const [category, setCategory] = useState("character");
  const [description, setDescription] = useState("");

  const filteredFlags =
    activeTab === "all" ? flags : flags?.filter((f) => f.category === activeTab);

  const handleCreate = () => {
    if (!name.trim()) return;
    createFlag.mutate(
      {
        projectId,
        name: name.trim(),
        type,
        defaultValue: defaultValue.trim() || undefined,
        category,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      },
    );
  };

  const resetForm = () => {
    setName("");
    setType("boolean");
    setDefaultValue("");
    setCategory("character");
    setDescription("");
  };

  const handleDelete = (flagId: string) => {
    if (window.confirm("이 플래그를 삭제하시겠습니까?")) {
      deleteFlag.mutate({ id: flagId });
    }
  };

  if (isLoading) {
    return <FlagSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/story-studio/$id", params: { id: projectId } })}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            프로젝트
          </Button>
          <h1 className="text-2xl font-bold">플래그 관리</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            플래그 추가
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 플래그 추가</DialogTitle>
              <DialogDescription>스토리 분기에 사용할 플래그를 정의합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>이름</Label>
                <Input
                  placeholder="예: has_key, courage_level"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>타입</Label>
                  <Select value={type} onValueChange={(val) => setType(val ?? "boolean")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>카테고리</Label>
                  <Select value={category} onValueChange={(val) => setCategory(val ?? "character")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_TABS.filter((t) => t.value !== "all").map((tab) => (
                        <SelectItem key={tab.value} value={tab.value}>
                          {tab.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>기본값</Label>
                <Input
                  placeholder="예: false, 0, 빈 문자열"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>설명</Label>
                <Textarea
                  placeholder="이 플래그의 용도를 설명하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
              >
                취소
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || createFlag.isPending}>
                {createFlag.isPending ? "추가 중..." : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {CATEGORY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {!filteredFlags || filteredFlags.length === 0 ? (
            <Card className="py-12 text-center">
              <CardContent>
                <Flag className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
                <p className="text-muted-foreground">
                  {activeTab === "all"
                    ? "플래그가 없습니다"
                    : `${CATEGORY_TABS.find((t) => t.value === activeTab)?.label ?? ""} 카테고리에 플래그가 없습니다`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>타입</TableHead>
                    <TableHead>기본값</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>설명</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFlags.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell className="font-mono text-sm font-medium">{flag.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {flag.type ?? "boolean"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {flag.defaultValue ?? "-"}
                      </TableCell>
                      <TableCell>
                        <CategoryBadge category={flag.category} />
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                        {flag.description ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(flag.id)}
                        >
                          <Trash2 className="text-muted-foreground h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* Components */

interface CategoryBadgeProps {
  category: string | null;
}

function CategoryBadge({ category }: CategoryBadgeProps) {
  const colorMap: Record<string, string> = {
    character: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    quest: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    world: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    system: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  const labelMap: Record<string, string> = {
    character: "캐릭터",
    quest: "퀘스트",
    world: "월드",
    system: "시스템",
  };

  const cat = category ?? "system";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colorMap[cat] ?? colorMap.system,
      )}
    >
      {labelMap[cat] ?? cat}
    </span>
  );
}

function FlagSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
