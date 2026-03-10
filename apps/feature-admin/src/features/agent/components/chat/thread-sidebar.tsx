import { useAtom, useSetAtom } from "jotai";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Spinner } from "@superbuilder/feature-ui/shadcn/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Plus, MessageSquare, MoreHorizontal, Pin, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  currentThreadIdAtom,
  messagesAtom,
  sidebarOpenAtom,
} from "../../store/chat.atoms";
import { useThreads, useThreadMutations } from "../../hooks/use-threads";

interface Props {
  className?: string;
}

export function ThreadSidebar({ className }: Props) {
  const [sidebarOpen] = useAtom(sidebarOpenAtom);
  const [currentThreadId, setCurrentThreadId] = useAtom(currentThreadIdAtom);
  const setMessages = useSetAtom(messagesAtom);
  const { data: threads, isLoading } = useThreads();
  const { update, remove } = useThreadMutations();

  if (!sidebarOpen) return null;

  const handleNewChat = () => {
    setCurrentThreadId(null);
    setMessages([]);
  };

  const handleSelectThread = (threadId: string) => {
    setCurrentThreadId(threadId);
    // 메시지는 별도 로드 (useThreadMessages)
  };

  const handlePin = async (id: string, isPinned: boolean) => {
    try {
      await update.mutateAsync({ id, data: { isPinned: !isPinned } });
    } catch {
      toast.error("핀 설정에 실패했습니다.");
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await update.mutateAsync({ id, data: { isArchived: true } });
      if (currentThreadId === id) handleNewChat();
      toast.success("대화가 아카이브되었습니다.");
    } catch {
      toast.error("아카이브에 실패했습니다.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync({ id });
      if (currentThreadId === id) handleNewChat();
      toast.success("대화가 삭제되었습니다.");
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  const grouped = groupThreadsByDate(threads ?? []);

  return (
    <div
      className={cn(
        "flex h-full w-64 flex-col border-r bg-muted/30",
        className,
      )}
    >
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-medium">대화 목록</span>
        <Button variant="ghost" size="icon-sm" onClick={handleNewChat}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : !threads?.length ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            대화가 없습니다.
          </p>
        ) : (
          <div className="space-y-4 p-2">
            {grouped.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((thread) => (
                    <div
                      key={thread.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50",
                        currentThreadId === thread.id && "bg-muted",
                      )}
                      onClick={() => handleSelectThread(thread.id)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">
                        {thread.title ?? "새 대화"}
                      </span>
                      {thread.isPinned && (
                        <Pin className="h-3 w-3 text-muted-foreground" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePin(thread.id, thread.isPinned);
                            }}
                          >
                            <Pin className="mr-2 h-4 w-4" />
                            {thread.isPinned ? "핀 해제" : "핀 고정"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(thread.id);
                            }}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            아카이브
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(thread.id);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

type ThreadItem = {
  id: string;
  title: string | null;
  isPinned: boolean;
  lastMessageAt: string | Date | null;
};

function groupThreadsByDate(threads: ThreadItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: ThreadItem[] }[] = [
    { label: "핀 고정", items: [] },
    { label: "오늘", items: [] },
    { label: "어제", items: [] },
    { label: "이번 주", items: [] },
    { label: "이전", items: [] },
  ];

  for (const thread of threads) {
    if (thread.isPinned) {
      groups[0]!.items.push(thread);
      continue;
    }
    const date = thread.lastMessageAt
      ? new Date(thread.lastMessageAt)
      : new Date(0);
    if (date >= today) groups[1]!.items.push(thread);
    else if (date >= yesterday) groups[2]!.items.push(thread);
    else if (date >= weekAgo) groups[3]!.items.push(thread);
    else groups[4]!.items.push(thread);
  }

  return groups.filter((g) => g.items.length > 0);
}
