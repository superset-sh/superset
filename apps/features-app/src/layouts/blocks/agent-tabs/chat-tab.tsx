/**
 * Chat Tab - 에이전트 운영 화면
 *
 * Claude Desktop과 유사한 2-패널 구조
 * - 좌측: 세션 목록 (세션 선택/생성/삭제)
 * - 우측: 채팅 영역 (선택된 세션의 대화)
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import {
  Bot,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { Chat } from "@/features/agent-desk/pages/chat";
import {
  useSessions,
  useCreateSession,
  useDeleteSession,
} from "@/features/agent-desk/hooks";
import { StatusBadge } from "@/features/agent-desk/components/status-badge";

export function ChatTab() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    <div className="flex h-full">
      {/* 좌측: 세션 목록 사이드바 */}
      <SessionSidebar
        selectedId={selectedSessionId}
        onSelect={setSelectedSessionId}
      />
      {/* 우측: 채팅 영역 */}
      <div className="flex-1 min-w-0">
        {selectedSessionId ? (
          <Chat sessionId={selectedSessionId} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function SessionSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: sessions, isLoading } = useSessions("operator");
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const handleCreate = async () => {
    const result = await createSession.mutateAsync({
      type: "operator",
      title: "새 대화",
    });
    onSelect(result.session.id);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate({ id });
    if (selectedId === id) {
      onSelect("");
    }
  };

  const filtered = (sessions ?? []).filter((s) =>
    searchQuery.trim()
      ? s.title?.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  const grouped = groupSessions(filtered);
  const groupOrder = ["오늘", "어제", "이번 주", "이전"];

  return (
    <div className="flex w-72 shrink-0 flex-col border-r">
      {/* 사이드바 헤더 */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">대화 목록</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleCreate}
          disabled={createSession.isPending}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* 검색 */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="대화 검색..."
            className="h-8 pl-8 text-sm bg-muted/40 border-none rounded-lg"
          />
        </div>
      </div>

      <Separator />

      {/* 세션 리스트 */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">불러오는 중...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-4">
            <MessageSquare className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground text-center">
              {sessions?.length === 0
                ? "새 대화를 시작해보세요"
                : "검색 결과가 없습니다"}
            </p>
            {sessions?.length === 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreate}
                disabled={createSession.isPending}
              >
                <Plus className="mr-1.5 size-3.5" />
                새 대화
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="p-2">
            {groupOrder.map((group) => {
              const items = grouped[group];
              if (!items || items.length === 0) return null;

              return (
                <div key={group} className="mb-3">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {group}
                  </p>
                  {items.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => onSelect(session.id)}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                        selectedId === session.id
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">
                          {session.title ?? "제목 없음"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(session.createdAt), {
                            addSuffix: true,
                            locale: ko,
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <StatusBadge status={session.status} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDelete(session.id, e)}
                        >
                          <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-2xl bg-muted/50 p-6">
          <Bot className="size-12 text-muted-foreground/50" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Atlas 에이전트</h3>
          <p className="text-sm text-muted-foreground mt-1">
            좌측에서 대화를 선택하거나 새 대화를 시작하세요
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function groupSessions(
  sessions: Array<{ id: string; title: string | null; createdAt: string; status: string }>,
): Record<string, typeof sessions> {
  const groups: Record<string, typeof sessions> = {};

  for (const session of sessions) {
    const date = new Date(session.createdAt);
    let group: string;

    if (isToday(date)) {
      group = "오늘";
    } else if (isYesterday(date)) {
      group = "어제";
    } else if (isThisWeek(date)) {
      group = "이번 주";
    } else {
      group = "이전";
    }

    if (!groups[group]) groups[group] = [];
    groups[group]!.push(session);
  }

  return groups;
}
