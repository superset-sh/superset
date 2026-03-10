/**
 * BoardManager - Admin 게시판 관리
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Plus, Edit, Trash2, MessageSquare, Image, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useBoards } from "../hooks";
import { useTRPC } from "../../../lib/trpc";
import type { BoardType } from "../types";

const BOARD_TYPE_ICON: Record<BoardType, React.ReactNode> = {
  general: <MessageSquare className="size-4" />,
  gallery: <Image className="size-4" />,
  qna: <HelpCircle className="size-4" />,
};

const BOARD_TYPE_LABEL: Record<BoardType, string> = {
  general: "일반",
  gallery: "갤러리",
  qna: "Q&A",
};

const BOARD_TYPES: BoardType[] = ["general", "gallery", "qna"];

export function BoardManager() {
  const trpc = useTRPC();
  const { data: boards, isLoading, refetch } = useBoards(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<string | null>(null);

  // 폼 상태
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<BoardType>("general");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [order, setOrder] = useState(0);

  const createBoard = useMutation({
    ...trpc.board.create.mutationOptions(),
    onSuccess: () => {
      toast.success("게시판이 생성되었습니다.");
      refetch();
      resetForm();
      setIsCreateOpen(false);
    },
    onError: () => {
      toast.error("생성에 실패했습니다.");
    },
  });

  const updateBoard = useMutation({
    ...trpc.board.update.mutationOptions(),
    onSuccess: () => {
      toast.success("게시판이 수정되었습니다.");
      refetch();
      resetForm();
      setEditingBoard(null);
    },
    onError: () => {
      toast.error("수정에 실패했습니다.");
    },
  });

  const deleteBoard = useMutation({
    ...trpc.board.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("게시판이 삭제되었습니다.");
      refetch();
    },
    onError: () => {
      toast.error("삭제에 실패했습니다.");
    },
  });

  const resetForm = () => {
    setName("");
    setSlug("");
    setType("general");
    setDescription("");
    setIsActive(true);
    setOrder(0);
  };

  const handleEdit = (board: NonNullable<typeof boards>[number]) => {
    setName(board.name);
    setSlug(board.slug);
    setType(board.type);
    setDescription(board.description ?? "");
    setIsActive(board.isActive);
    setOrder(board.order);
    setEditingBoard(board.id);
  };

  const handleSubmit = () => {
    if (!name.trim() || !slug.trim()) {
      toast.error("이름과 슬러그를 입력해주세요.");
      return;
    }

    const data = { name, slug, type, description, isActive, order };

    if (editingBoard) {
      updateBoard.mutate({ id: editingBoard, data });
    } else {
      createBoard.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteBoard.mutate({ id });
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">로딩 중...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>게시판 관리</CardTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button onClick={resetForm} />}>
            <Plus className="mr-2 size-4" />
            새 게시판
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 게시판 만들기</DialogTitle>
            </DialogHeader>
            <BoardForm
              name={name}
              slug={slug}
              type={type}
              description={description}
              isActive={isActive}
              order={order}
              onNameChange={setName}
              onSlugChange={setSlug}
              onTypeChange={setType}
              onDescriptionChange={setDescription}
              onIsActiveChange={setIsActive}
              onOrderChange={setOrder}
              onSubmit={handleSubmit}
              isLoading={createBoard.isPending}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>슬러그</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>게시물</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>순서</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boards?.map((board) => (
              <TableRow key={board.id}>
                <TableCell className="font-medium">{board.name}</TableCell>
                <TableCell className="text-muted-foreground">{board.slug}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="flex w-fit items-center gap-1">
                    {BOARD_TYPE_ICON[board.type]}
                    {BOARD_TYPE_LABEL[board.type]}
                  </Badge>
                </TableCell>
                <TableCell>{board.postCount}</TableCell>
                <TableCell>
                  <Badge variant={board.isActive ? "default" : "secondary"}>
                    {board.isActive ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell>{board.order}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Dialog
                      open={editingBoard === board.id}
                      onOpenChange={(open) => !open && setEditingBoard(null)}
                    >
                      <DialogTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(board)}
                          />
                        }
                      >
                        <Edit className="size-4" />
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>게시판 수정</DialogTitle>
                        </DialogHeader>
                        <BoardForm
                          name={name}
                          slug={slug}
                          type={type}
                          description={description}
                          isActive={isActive}
                          order={order}
                          onNameChange={setName}
                          onSlugChange={setSlug}
                          onTypeChange={setType}
                          onDescriptionChange={setDescription}
                          onIsActiveChange={setIsActive}
                          onOrderChange={setOrder}
                          onSubmit={handleSubmit}
                          isLoading={updateBoard.isPending}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(board.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface BoardFormProps {
  name: string;
  slug: string;
  type: BoardType;
  description: string;
  isActive: boolean;
  order: number;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onTypeChange: (v: BoardType) => void;
  onDescriptionChange: (v: string) => void;
  onIsActiveChange: (v: boolean) => void;
  onOrderChange: (v: number) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

function BoardForm(props: BoardFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">이름</Label>
        <Input
          id="name"
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
          placeholder="게시판 이름"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">슬러그</Label>
        <Input
          id="slug"
          value={props.slug}
          onChange={(e) => props.onSlugChange(e.target.value)}
          placeholder="url-friendly-slug"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">유형</Label>
        <select
          id="type"
          value={props.type}
          onChange={(e) => props.onTypeChange(e.target.value as BoardType)}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {BOARD_TYPES.map((t: BoardType) => (
            <option key={t} value={t}>
              {BOARD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          value={props.description}
          onChange={(e) => props.onDescriptionChange(e.target.value)}
          placeholder="게시판 설명"
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="isActive"
            checked={props.isActive}
            onCheckedChange={props.onIsActiveChange}
          />
          <Label htmlFor="isActive">활성화</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="order">순서</Label>
          <Input
            id="order"
            type="number"
            value={props.order}
            onChange={(e) => props.onOrderChange(parseInt(e.target.value) || 0)}
            className="w-20"
          />
        </div>
      </div>
      <Button onClick={props.onSubmit} disabled={props.isLoading} className="w-full">
        저장
      </Button>
    </div>
  );
}
