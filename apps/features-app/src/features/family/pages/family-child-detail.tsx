/**
 * Family Child Detail - 아이 상세 (Auth + Member)
 */
import { useState } from "react";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Baby, Calendar, Pencil, Power, PowerOff, UserMinus, UserPlus } from "lucide-react";
import {
  useAssignTherapist,
  useChildAssignments,
  useDeactivateChild,
  useFamilyChild,
  useFamilyGroup,
  useReactivateChild,
  useUnassignTherapist,
  useUpdateChild,
} from "../hooks";
import { calculateAge } from "../utils";

interface Props {}

export function FamilyChildDetail({}: Props) {
  const { childId } = useParams({ strict: false }) as { childId: string };
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { groupId?: string };
  const groupId = search.groupId ?? "";

  const { data: child, isLoading } = useFamilyChild(childId);
  const { data: group } = useFamilyGroup(groupId);
  const { data: assignments } = useChildAssignments(childId);
  const [showEditDialog, setShowEditDialog] = useState(false);

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center">로딩 중...</div>;
  }

  if (!child) {
    return (
      <div className="text-muted-foreground py-12 text-center">아이 정보를 찾을 수 없습니다.</div>
    );
  }

  const myRole = group?.myRole as string | undefined;
  const canManage = myRole === "owner" || myRole === "guardian";
  const age = calculateAge(child.birthDate);

  return (
    <div className="space-y-8">
      <div>
        <button
          type="button"
          onClick={() => navigate({ to: "/family/$groupId", params: { groupId } })}
          className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm"
        >
          &larr; 그룹으로 돌아가기
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex size-12 items-center justify-center rounded-full">
              <Baby className="text-primary size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">{child.name}</h1>
                {!child.isActive && <Badge variant="secondary">비활성</Badge>}
              </div>
              <p className="text-muted-foreground">
                만 {age}세
                {child.gender &&
                  ` · ${child.gender === "male" ? "남" : child.gender === "female" ? "여" : child.gender}`}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
                <Pencil className="mr-1 size-4" />
                수정
              </Button>
              <ToggleActiveButton childId={childId} isActive={child.isActive} />
            </div>
          )}
        </div>
      </div>

      <ChildInfoSection child={child} />

      {canManage && (
        <TherapistSection
          childId={childId}
          assignments={assignments ?? []}
          groupMembers={group?.members ?? []}
        />
      )}

      {showEditDialog && (
        <EditChildDialog open={showEditDialog} onOpenChange={setShowEditDialog} child={child} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ChildInfoSectionProps {
  child: {
    birthDate: string;
    notes: string | null;
    createdAt: string;
  };
}

function ChildInfoSection({ child }: ChildInfoSectionProps) {
  return (
    <div className="space-y-4 rounded-lg border p-6">
      <h2 className="font-semibold">기본 정보</h2>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Calendar className="text-muted-foreground size-4" />
          <span className="text-muted-foreground">생년월일:</span>
          <span>{child.birthDate}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="text-muted-foreground size-4" />
          <span className="text-muted-foreground">등록일:</span>
          <span>{new Date(child.createdAt).toLocaleDateString("ko-KR")}</span>
        </div>
      </div>
      {child.notes && (
        <div>
          <p className="text-muted-foreground mb-1 text-sm">특이사항</p>
          <p className="text-sm whitespace-pre-wrap">{child.notes}</p>
        </div>
      )}
    </div>
  );
}

interface ToggleActiveButtonProps {
  childId: string;
  isActive: boolean;
}

function ToggleActiveButton({ childId, isActive }: ToggleActiveButtonProps) {
  const deactivate = useDeactivateChild();
  const reactivate = useReactivateChild();

  const handleToggle = () => {
    if (isActive) {
      if (!confirm("아이를 비활성화하시겠습니까?")) return;
      deactivate.mutate({ childId });
    } else {
      reactivate.mutate({ childId });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={deactivate.isPending || reactivate.isPending}
    >
      {isActive ? (
        <>
          <PowerOff className="mr-1 size-4" />
          비활성화
        </>
      ) : (
        <>
          <Power className="mr-1 size-4" />
          재활성화
        </>
      )}
    </Button>
  );
}

interface TherapistSectionProps {
  childId: string;
  assignments: Array<{
    id: string;
    therapistId: string;
    therapistName: string;
    therapistEmail: string;
    therapistAvatar: string | null;
  }>;
  groupMembers: Array<{
    id: string;
    role: string;
    userId: string;
    userName: string;
    userEmail: string;
    userAvatar: string | null;
  }>;
}

function TherapistSection({ childId, assignments, groupMembers }: TherapistSectionProps) {
  const assignTherapist = useAssignTherapist();
  const unassignTherapist = useUnassignTherapist();

  const therapistMembers = groupMembers.filter((m) => m.role === "therapist");
  const assignedIds = new Set(assignments.map((a) => a.therapistId));
  const availableTherapists = therapistMembers.filter((m) => !assignedIds.has(m.userId));

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <h2 className="font-semibold">배정된 치료사</h2>

      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">배정된 치료사가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-green-600/10 text-xs font-medium text-green-600">
                  {assignment.therapistName?.charAt(0) ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-medium">{assignment.therapistName}</p>
                  <p className="text-muted-foreground text-xs">{assignment.therapistEmail}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive size-8"
                onClick={() =>
                  unassignTherapist.mutate({
                    childId,
                    therapistId: assignment.therapistId,
                  })
                }
              >
                <UserMinus className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {availableTherapists.length > 0 && (
        <div className="pt-2">
          <p className="text-muted-foreground mb-2 text-sm">치료사 배정</p>
          <div className="flex flex-wrap gap-2">
            {availableTherapists.map((member) => (
              <Button
                key={member.id}
                variant="outline"
                size="sm"
                onClick={() =>
                  assignTherapist.mutate({
                    childId,
                    therapistId: member.userId,
                  })
                }
                disabled={assignTherapist.isPending}
              >
                <UserPlus className="mr-1 size-4" />
                {member.userName}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface EditChildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: {
    id: string;
    name: string;
    birthDate: string;
    gender: string | null;
    notes: string | null;
  };
}

function EditChildDialog({ open, onOpenChange, child }: EditChildDialogProps) {
  const [name, setName] = useState(child.name);
  const [birthDate, setBirthDate] = useState(child.birthDate);
  const [notes, setNotes] = useState(child.notes ?? "");
  const updateChild = useUpdateChild();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateChild.mutate(
      {
        childId: child.id,
        name: name.trim() || undefined,
        birthDate: birthDate || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>아이 정보 수정</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label htmlFor="edit-name" className="text-sm font-medium">
              이름
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="edit-birth" className="text-sm font-medium">
              생년월일
            </label>
            <Input
              id="edit-birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="edit-notes" className="text-sm font-medium">
              특이사항
            </label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-background mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={updateChild.isPending}>
              {updateChild.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
