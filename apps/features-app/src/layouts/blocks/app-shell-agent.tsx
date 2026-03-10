/**
 * App Shell Agent - 에이전트 중심 레이아웃
 *
 * Claude Desktop과 유사한 3탭 구조
 * - 채팅: 에이전트 운영 (좌: 세션 목록 / 우: 채팅)
 * - 보유기능: Feature 카탈로그
 * - 임시: 추후 기능
 */
import { useCallback, useState } from "react";
import {
  AuthGuard,
  authenticatedAtom,
  getSupabaseAtom,
  profileAtom,
} from "@superbuilder/features-client/core/auth";
import LogoSvg from "@superbuilder/feature-ui/assets/svg/logo";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  Boxes,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import { SettingsModal, useSettingsModal } from "@/features/settings";
import { ChatTab } from "./agent-tabs/chat-tab";
import { FeaturesTab } from "./agent-tabs/features-tab";
import { LabTab } from "./agent-tabs/lab-tab";

type TabId = "chat" | "features" | "lab";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: "chat", label: "채팅", icon: <MessageSquare className="size-4" /> },
  { id: "features", label: "보유기능", icon: <Boxes className="size-4" /> },
  { id: "lab", label: "임시", icon: <Sparkles className="size-4" /> },
];

export function AppShellAgent() {
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  const handleUnauthenticated = useCallback(() => {
    navigate({ to: "/sign-in", replace: true });
  }, [navigate]);

  return (
    <AuthGuard authenticated={authenticated} onUnauthenticated={handleUnauthenticated}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <AgentHeader activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1 overflow-hidden">
          {activeTab === "chat" ? <ChatTab /> : null}
          {activeTab === "features" ? <FeaturesTab /> : null}
          {activeTab === "lab" ? <LabTab /> : null}
        </div>
      </div>
      <SettingsModal />
    </AuthGuard>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function AgentHeader({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  const profile = useAtomValue(profileAtom);
  const supabase = useAtomValue(getSupabaseAtom);
  const navigate = useNavigate();
  const { setOpen: setSettingsOpen } = useSettingsModal();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", replace: true });
  };

  return (
    <header className="bg-background flex h-12 shrink-0 items-center border-b px-4">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mr-6">
        <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
          <LogoSvg className="size-4" />
        </div>
        <span className="text-sm font-semibold hidden sm:inline">Atlas</span>
      </Link>

      {/* Tabs */}
      <nav className="flex items-center gap-1">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1.5 px-3 h-8 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </Button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* User Menu */}
      <DropdownMenu>
        <Button variant="ghost" size="icon" className="size-8" render={<DropdownMenuTrigger />}>
          <Avatar className="size-7">
            <AvatarImage src={profile?.avatar ?? undefined} />
            <AvatarFallback className="text-xs">
              {profile?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
        </Button>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar className="size-8">
              <AvatarImage src={profile?.avatar ?? undefined} />
              <AvatarFallback className="text-xs">
                {profile?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col text-left text-sm leading-tight">
              <span className="truncate font-medium">{profile?.name ?? "User"}</span>
              <span className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ""}
              </span>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Link to="/profile" className="flex w-full cursor-pointer items-center">
              <User className="mr-2 size-4" />
              프로필
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="cursor-pointer">
            <Settings className="mr-2 size-4" />
            설정
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
            <LogOut className="mr-2 size-4" />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
