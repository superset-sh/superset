/**
 * Family Groups - 내 가족 그룹 목록 (Auth)
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Link } from "@tanstack/react-router";
import { Baby, ChevronRight, Plus, Users } from "lucide-react";
import { useCreateGroup, useMyFamilyGroups } from "../hooks";
import { ROLE_LABELS } from "../utils";

interface Props {}

export function FamilyGroups({}: Props) {
  const { data: groups, isLoading } = useMyFamilyGroups();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">가족 관리</h1>
          <p className="text-muted-foreground mt-2">
            가족 그룹을 만들고 구성원과 아이를 관리하세요.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-1 size-4" />
          그룹 만들기
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-12 text-center">로딩 중...</div>
      ) : !groups?.length ? (
        <EmptyState onCreateClick={() => setShowCreateDialog(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}

      <CreateGroupDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface GroupCardProps {
  group: {
    id: string;
    name: string;
    memberCount: number;
    childCount: number;
    myRole: string;
  };
}

function GroupCard({ group }: GroupCardProps) {
  return (
    <Link
      to="/family/$groupId"
      params={{ groupId: group.id }}
      className="group bg-background hover:border-primary/50 block rounded-lg border p-5 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="group-hover:text-primary text-lg font-medium transition-colors">
            {group.name}
          </h3>
          <RoleBadge role={group.myRole} />
        </div>
        <ChevronRight className="text-muted-foreground group-hover:text-primary size-5 transition-colors" />
      </div>
      <div className="text-muted-foreground mt-4 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <Users className="size-4" />
          구성원 {group.memberCount}명
        </span>
        <span className="flex items-center gap-1">
          <Baby className="size-4" />
          아이 {group.childCount}명
        </span>
      </div>
    </Link>
  );
}

interface RoleBadgeProps {
  role: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  guardian: "bg-blue-500/10 text-blue-600",
  therapist: "bg-green-600/10 text-green-600",
  viewer: "bg-muted text-muted-foreground",
};

function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? ROLE_COLORS.viewer}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

interface EmptyStateProps {
  onCreateClick: () => void;
}

function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="space-y-4 py-16 text-center">
      <Users className="text-muted-foreground mx-auto size-12" />
      <div className="space-y-1">
        <p className="text-lg font-medium">아직 가족 그룹이 없습니다</p>
        <p className="text-muted-foreground">가족 그룹을 만들어 구성원과 아이를 관리해보세요.</p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus className="mr-1 size-4" />첫 그룹 만들기
      </Button>
    </div>
  );
}

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const createGroup = useCreateGroup();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createGroup.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setName("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>가족 그룹 만들기</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <label htmlFor="group-name" className="text-sm font-medium">
              그룹 이름
            </label>
            <Input
              id="group-name"
              placeholder="우리 가족"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={!name.trim() || createGroup.isPending}>
              {createGroup.isPending ? "생성 중..." : "만들기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
