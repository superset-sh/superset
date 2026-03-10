import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { NotificationSettings } from "@superbuilder/widgets/notification";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { useUpdateProfile } from "@/features/profile/hooks/use-profile-mutations";
import { LanguageSelector } from "../language-selector";
import { ThemeSelector } from "../theme-selector";

interface Props {}

export function GeneralPanel({}: Props) {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState("");
  const [isNameDirty, setIsNameDirty] = useState(false);

  // 프로필 로드 시 이름 초기화
  if (profile?.name && !isNameDirty && name !== profile.name) {
    setName(profile.name);
  }

  const handleNameSave = () => {
    if (!name.trim()) return;
    updateProfile.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          toast.success("프로필이 저장되었습니다");
          setIsNameDirty(false);
        },
        onError: () => {
          toast.error("프로필 저장에 실패했습니다");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 프로필 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">프로필</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-sm">이름</label>
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setIsNameDirty(true);
                  }}
                  placeholder="이름을 입력하세요"
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  onClick={handleNameSave}
                  disabled={!isNameDirty || !name.trim() || updateProfile.isPending}
                >
                  {updateProfile.isPending ? <Loader2 className="size-4 animate-spin" /> : "저장"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-sm">이메일</label>
              <p className="text-sm">{profile?.email ?? "-"}</p>
            </div>
          </div>
        )}
      </section>

      <Separator />

      {/* 언어 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">언어</h3>
        <LanguageSelector />
      </section>

      <Separator />

      {/* 모양 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">모양</h3>
        <ThemeSelector />
      </section>

      <Separator />

      {/* 알림 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">알림</h3>
        <NotificationSettings />
      </section>
    </div>
  );
}
