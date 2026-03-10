/**
 * Family Group Detail - 가족 그룹 상세 (Auth + Member)
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Baby, LogOut, Mail, Plus, Settings, Trash2, UserMinus, Users } from "lucide-react";
import {
  useCreateChild,
  useDeleteGroup,
  useFamilyChildren,
  useFamilyGroup,
  useInviteMember,
  useLeaveGroup,
  useRemoveMember,
  useUpdateMemberRole,
} from "../hooks";
import { ROLE_LABELS, calculateAge } from "../utils";

interface Props {}

export function FamilyGroupDetail({}: Props) {
  const { groupId } = useParams({ strict: false }) as { groupId: string };
  const navigate = useNavigate();
  const { data: group, isLoading } = useFamilyGroup(groupId);
  const { data: children } = useFamilyChildren(groupId);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAddChildDialog, setShowAddChildDialog] = useState(false);

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center">로딩 중...</div>;
  }

  if (!group) {
    return <div className="text-muted-foreground py-12 text-center">그룹을 찾을 수 없습니다.</div>;
  }

  const myRole = group.myRole as string;
  const canManage = myRole === "owner" || myRole === "guardian";

  return (
    <div className="space-y-8">
      <GroupHeader
        group={group}
        myRole={myRole}
        onNavigateBack={() => navigate({ to: "/family" })}
      />

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="mr-1 size-4" />
            구성원 ({group.members?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="children">
            <Baby className="mr-1 size-4" />
            아이 ({children?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-1 size-4" />
            설정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6 space-y-4">
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(true)}>
              <Mail className="mr-1 size-4" />
              구성원 초대
            </Button>
          )}
          <MemberList members={group.members ?? []} myRole={myRole} groupId={groupId} />
        </TabsContent>

        <TabsContent value="children" className="mt-6 space-y-4">
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setShowAddChildDialog(true)}>
              <Plus className="mr-1 size-4" />
              아이 등록
            </Button>
          )}
          <ChildList children={children ?? []} groupId={groupId} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <GroupSettings groupId={groupId} myRole={myRole} />
        </TabsContent>
      </Tabs>

      <InviteMemberDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        groupId={groupId}
      />
      <AddChildDialog
        open={showAddChildDialog}
        onOpenChange={setShowAddChildDialog}
        groupId={groupId}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface GroupHeaderProps {
  group: { name: string };
  myRole: string;
  onNavigateBack: () => void;
}

function GroupHeader({ group, myRole, onNavigateBack }: GroupHeaderProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onNavigateBack}
        className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm"
      >
        &larr; 가족 관리
      </button>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{group.name}</h1>
        <Badge variant="secondary">{ROLE_LABELS[myRole] ?? myRole}</Badge>
      </div>
    </div>
  );
}

interface MemberListProps {
  members: Array<{
    id: string;
    role: string;
    userId: string;
    userName: string;
    userEmail: string;
    userAvatar: string | null;
  }>;
  myRole: string;
  groupId: string;
}

function MemberList({ members, myRole, groupId }: MemberListProps) {
  const removeMember = useRemoveMember();
  const updateRole = useUpdateMemberRole();
  const canManage = myRole === "owner" || myRole === "guardian";

  if (!members.length) {
    return <p className="text-muted-foreground py-4">구성원이 없습니다.</p>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {members.map((member) => (
        <div key={member.id} className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-9 items-center justify-center rounded-full text-sm font-medium">
              {member.userName?.charAt(0) ?? "?"}
            </div>
            <div>
              <p className="text-sm font-medium">{member.userName}</p>
              <p className="text-muted-foreground text-xs">{member.userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && member.role !== "owner" ? (
              <Select
                value={member.role}
                onValueChange={(value: string | null) => {
                  if (!value) return;
                  updateRole.mutate({
                    groupId,
                    memberId: member.id,
                    newRole: value as "guardian" | "therapist" | "viewer",
                  });
                }}
              >
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guardian">보호자</SelectItem>
                  <SelectItem value="therapist">치료사</SelectItem>
                  <SelectItem value="viewer">조회자</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{ROLE_LABELS[member.role] ?? member.role}</Badge>
            )}
            {canManage && member.role !== "owner" && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive size-8"
                onClick={() => removeMember.mutate({ groupId, memberId: member.id })}
              >
                <UserMinus className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChildListProps {
  children: Array<{
    id: string;
    name: string;
    birthDate: string;
    gender: string | null;
    isActive: boolean;
  }>;
  groupId: string;
}

function ChildList({ children: childList, groupId }: ChildListProps) {
  if (!childList.length) {
    return <p className="text-muted-foreground py-4">등록된 아이가 없습니다.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {childList.map((child) => (
        <ChildCard key={child.id} child={child} groupId={groupId} />
      ))}
    </div>
  );
}

interface ChildCardProps {
  child: {
    id: string;
    name: string;
    birthDate: string;
    gender: string | null;
    isActive: boolean;
  };
  groupId: string;
}

function ChildCard({ child, groupId }: ChildCardProps) {
  const age = calculateAge(child.birthDate);

  return (
    <Link
      to="/family/child/$childId"
      params={{ childId: child.id }}
      search={{ groupId }}
      className="hover:border-primary/50 block rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{child.name}</p>
          <p className="text-muted-foreground text-sm">
            만 {age}세
            {child.gender &&
              ` · ${child.gender === "male" ? "남" : child.gender === "female" ? "여" : child.gender}`}
          </p>
        </div>
        {!child.isActive && <Badge variant="secondary">비활성</Badge>}
      </div>
    </Link>
  );
}

interface GroupSettingsProps {
  groupId: string;
  myRole: string;
}

function GroupSettings({ groupId, myRole }: GroupSettingsProps) {
  const navigate = useNavigate();
  const leaveGroup = useLeaveGroup();
  const deleteGroup = useDeleteGroup();

  const handleLeave = () => {
    if (!confirm("정말 이 그룹에서 탈퇴하시겠습니까?")) return;
    leaveGroup.mutate({ groupId }, { onSuccess: () => navigate({ to: "/family" }) });
  };

  const handleDelete = () => {
    if (!confirm("정말 이 그룹을 삭제하시겠습니까? 모든 데이터가 삭제됩니다.")) return;
    deleteGroup.mutate({ groupId }, { onSuccess: () => navigate({ to: "/family" }) });
  };

  return (
    <div className="space-y-6">
      {myRole !== "owner" && (
        <div className="border-destructive/50 space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">그룹 탈퇴</h3>
          <p className="text-muted-foreground text-sm">
            그룹에서 탈퇴하면 더 이상 이 그룹의 데이터에 접근할 수 없습니다.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLeave}
            disabled={leaveGroup.isPending}
          >
            <LogOut className="mr-1 size-4" />
            {leaveGroup.isPending ? "처리 중..." : "그룹 탈퇴"}
          </Button>
        </div>
      )}
      {myRole === "owner" && (
        <div className="border-destructive/50 space-y-3 rounded-lg border p-4">
          <h3 className="text-destructive font-medium">그룹 삭제</h3>
          <p className="text-muted-foreground text-sm">
            그룹을 삭제하면 모든 구성원, 아이, 초대 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수
            없습니다.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteGroup.isPending}
          >
            <Trash2 className="mr-1 size-4" />
            {deleteGroup.isPending ? "삭제 중..." : "그룹 삭제"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
}

function InviteMemberDialog({ open, onOpenChange, groupId }: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"guardian" | "therapist" | "viewer">("guardian");
  const inviteMember = useInviteMember();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    inviteMember.mutate(
      { groupId, email: email.trim(), role },
      {
        onSuccess: () => {
          setEmail("");
          setRole("guardian");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>구성원 초대</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label htmlFor="invite-email" className="text-sm font-medium">
              이메일
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="text-sm font-medium">
              역할
            </label>
            <Select
              value={role}
              onValueChange={(v: string | null) =>
                setRole((v ?? "guardian") as "guardian" | "therapist" | "viewer")
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guardian">보호자</SelectItem>
                <SelectItem value="therapist">치료사</SelectItem>
                <SelectItem value="viewer">조회자</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={!email.trim() || inviteMember.isPending}>
              {inviteMember.isPending ? "초대 중..." : "초대하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AddChildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
}

function AddChildDialog({ open, onOpenChange, groupId }: AddChildDialogProps) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const createChild = useCreateChild();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !birthDate) return;

    createChild.mutate(
      {
        groupId,
        name: name.trim(),
        birthDate,
        gender: gender || undefined,
      },
      {
        onSuccess: () => {
          setName("");
          setBirthDate("");
          setGender("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>아이 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label htmlFor="child-name" className="text-sm font-medium">
              이름
            </label>
            <Input
              id="child-name"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="child-birth" className="text-sm font-medium">
              생년월일
            </label>
            <Input
              id="child-birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="child-gender" className="text-sm font-medium">
              성별 (선택)
            </label>
            <Select value={gender} onValueChange={(v: string | null) => setGender(v ?? "")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="선택 안 함" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">선택 안 함</SelectItem>
                <SelectItem value="male">남</SelectItem>
                <SelectItem value="female">여</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={!name.trim() || !birthDate || createChild.isPending}>
              {createChild.isPending ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
