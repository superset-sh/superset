/**
 * BoardList - 게시판 목록 컴포넌트
 */
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { MessageSquare, Image, HelpCircle } from "lucide-react";
import { useBoards } from "../hooks";
import type { BoardType } from "../types";

const BOARD_TYPE_ICON: Record<BoardType, React.ReactNode> = {
  general: <MessageSquare className="size-5" />,
  gallery: <Image className="size-5" />,
  qna: <HelpCircle className="size-5" />,
};

const BOARD_TYPE_LABEL: Record<BoardType, string> = {
  general: "일반",
  gallery: "갤러리",
  qna: "Q&A",
};

export function BoardList() {
  const { data: boards, isLoading, error } = useBoards();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">오류가 발생했습니다.</div>
      </div>
    );
  }

  if (!boards || boards.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">게시판이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <Link key={board.id} to={`/board/${board.slug}` as "/"}>
          <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                {BOARD_TYPE_ICON[board.type]}
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">{board.name}</CardTitle>
                <CardDescription className="line-clamp-1">
                  {board.description || "설명이 없습니다."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{BOARD_TYPE_LABEL[board.type]}</Badge>
                <span className="text-muted-foreground text-sm">
                  게시물 {board.postCount}개
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
