import { useState, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Plus, MessageSquare, Trash2, Search } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { ko, enUS } from "date-fns/locale";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { useSessions, useCreateSession, useDeleteSession } from "../hooks";
import { StatusBadge } from "../components/status-badge";
import type { SessionType } from "../types";

interface Props {
  type: SessionType;
}

export function SessionList({ type }: Props) {
  const navigate = useNavigate();
  const { t, i18n } = useFeatureTranslation("agent-desk");
  const dateFnsLocale = i18n.language === "en" ? enUS : ko;
  const [searchQuery, setSearchQuery] = useState("");
  const { data: sessions, isLoading, error } = useSessions(type);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const getNewSessionTitle = () => {
    if (type === "customer") return t("customerNewSession");
    if (type === "designer") return t("newDesignerSession");
    return t("operatorNewSession");
  };

  const getSessionDescription = () => {
    if (type === "customer") return t("customerDescription");
    if (type === "designer") return t("designerDescription");
    return t("operatorDescription");
  };

  const getSessionLink = (sessionId: string, sessionType?: string) => {
    if (sessionType === "designer" || type === "designer") {
      return { to: "/agent-desk/designer/$sessionId" as const, params: { sessionId } };
    }
    return { to: "/agent-desk/$sessionId" as const, params: { sessionId } };
  };

  const handleCreate = async () => {
    const result = await createSession.mutateAsync({
      type,
      title: getNewSessionTitle(),
    });
    const link = getSessionLink(result.session.id);
    navigate(link);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteSession.mutate({ id });
  };

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title?.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, typeof filteredSessions> = {};

    for (const session of filteredSessions) {
      const date = new Date(session.createdAt);
      let group: string;

      if (isToday(date)) {
        group = t("groupToday");
      } else if (isYesterday(date)) {
        group = t("groupYesterday");
      } else if (isThisWeek(date)) {
        group = t("groupThisWeek");
      } else {
        group = t("groupOlder");
      }

      if (!groups[group]) groups[group] = [];
      groups[group]!.push(session);
    }

    return groups;
  }, [filteredSessions, t]);

  const groupOrder = [t("groupToday"), t("groupYesterday"), t("groupThisWeek"), t("groupOlder")];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">{t("error")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground/80 font-light">
          {getSessionDescription()}
        </p>
        <Button onClick={handleCreate} disabled={createSession.isPending} className="rounded-full shadow-sm px-6">
          <Plus className="mr-2 size-4" />
          {t("newSession")}
        </Button>
      </div>

      {sessions && sessions.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("sessionSearch")}
            className="pl-10 h-11 bg-muted/40 border-none rounded-2xl shadow-none focus-visible:ring-1 focus-visible:bg-background transition-colors"
          />
        </div>
      )}

      {!sessions || sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <MessageSquare className="text-muted-foreground size-12" />
          <p className="text-muted-foreground">{t("noSessions")}</p>
          <Button onClick={handleCreate} disabled={createSession.isPending}>
            {t("startSession")}
          </Button>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-muted-foreground">{t("noSearchResults")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupOrder.map((group) => {
            const items = groupedSessions[group];
            if (!items || items.length === 0) return null;

            return (
              <div key={group} className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-muted-foreground">{group}</h3>
                <div className="flex flex-col gap-1">
                  {items.map((session) => {
                    const relativeTime = formatDistanceToNow(new Date(session.createdAt), {
                      addSuffix: true,
                      locale: dateFnsLocale,
                    });

                    const link = getSessionLink(session.id, session.type);

                    return (
                      <Link
                        key={session.id}
                        to={link.to}
                        params={link.params}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
                      >
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <span className="font-medium text-foreground truncate">
                            {session.title ?? t("noTitle")}
                          </span>
                          <span className="text-xs text-muted-foreground/70 font-light">
                            {relativeTime}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <StatusBadge status={session.status} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleDelete(session.id, e)}
                          >
                            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
