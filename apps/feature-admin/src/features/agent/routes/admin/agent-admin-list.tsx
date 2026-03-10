import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Spinner } from "@superbuilder/feature-ui/shadcn/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAgents, useAgentMutations } from "../../hooks/use-agents";

function AgentAdminListPage() {
  const navigate = useNavigate();
  const { data: agents, isLoading } = useAgents();
  const { remove } = useAgentMutations();

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync({ id });
      toast.success("에이전트가 비활성화되었습니다.");
    } catch {
      toast.error("에이전트 비활성화에 실패했습니다.");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI 에이전트 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            에이전트를 생성하고 관리합니다.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/agent/new" })}>
          <Plus className="mr-1.5 h-4 w-4" />
          에이전트 생성
        </Button>
      </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : !agents?.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <p>등록된 에이전트가 없습니다.</p>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/agent/new" })}
            >
              첫 에이전트 만들기
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>슬러그</TableHead>
                <TableHead>도구</TableHead>
                <TableHead>기본값</TableHead>
                <TableHead className="w-[100px]">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">{agent.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.slug}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {agent.enabledTools?.length ?? 0}개
                    </span>
                  </TableCell>
                  <TableCell>
                    {agent.isDefault && <Badge variant="secondary">기본</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          navigate({ to: `/agent/${agent.id}/edit` })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="ghost" size="icon-sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              에이전트 비활성화
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {agent.name}을(를) 비활성화하시겠습니까?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(agent.id)}
                            >
                              비활성화
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
    </div>
  );
}

export const createAgentAdminListRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent",
    component: AgentAdminListPage,
  });
