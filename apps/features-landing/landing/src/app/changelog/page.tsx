import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Bug, CircleDot, Sparkles, Zap } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import {
  parseChangelog,
  formatDate,
  translateSectionTitle,
} from "@/lib/parse-changelog";
import type { ChangelogEntry, ChangelogSection, ChangelogItem } from "@/lib/parse-changelog";

export const metadata: Metadata = {
  title: "Changelog — Feature Atlas",
  description: "Feature Atlas의 새로운 기능, 개선 사항, 버그 수정 내역을 확인하세요.",
};

const getChangelog = unstable_cache(
  async () => {
    try {
      const raw = readFileSync(join(process.cwd(), "../../CHANGELOG.md"), "utf-8");
      return parseChangelog(raw);
    } catch {
      return [];
    }
  },
  ["changelog"],
  { revalidate: 3600 },
);

export default async function ChangelogPage() {
  const entries = await getChangelog();

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        items={[
          { label: "Features", href: "/#features" },
          { label: "Pricing", href: "/#pricing" },
          { label: "Changelog", href: "/changelog" },
        ]}
      />

      {/* 히어로 */}
      <section className="border-b border-border/40 py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">Changelog</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            새로운 소식
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Feature Atlas의 최신 업데이트를 확인하세요.
          </p>
        </div>
      </section>

      {/* 타임라인 */}
      <main className="mx-auto max-w-2xl px-6 py-16">
        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col">
            {entries.map((entry, i) => (
              <ReleaseEntry
                key={entry.version}
                entry={entry}
                isLast={i === entries.length - 1}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <CircleDot className="mb-4 size-10 text-muted-foreground/40" />
      <p className="text-lg font-medium">아직 릴리스가 없습니다</p>
      <p className="mt-1 text-sm text-muted-foreground">
        첫 번째 릴리스가 발행되면 여기에 표시됩니다.
      </p>
    </div>
  );
}

function ReleaseEntry({
  entry,
  isLast,
}: {
  entry: ChangelogEntry;
  isLast: boolean;
}) {
  return (
    <article className="relative flex gap-8">
      {/* 타임라인 라인 + 도트 */}
      <div className="flex flex-col items-center pt-1">
        <div className="size-2.5 shrink-0 rounded-full bg-foreground" />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>

      {/* 콘텐츠 */}
      <div className={isLast ? "pb-0" : "pb-16"}>
        {/* 날짜 + 버전 */}
        <div className="flex items-center gap-3">
          <time className="text-sm font-medium">{formatDate(entry.date)}</time>
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            v{entry.version}
          </span>
        </div>

        {/* 섹션 */}
        <div className="mt-6 flex flex-col gap-6">
          {entry.sections.map((section) => (
            <ReleaseSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </article>
  );
}

function ReleaseSection({ section }: { section: ChangelogSection }) {
  const Icon = getSectionIcon(section.title);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {translateSectionTitle(section.title)}
        </h3>
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {section.items.map((item, i) => (
          <ChangeItem key={i} item={item} />
        ))}
      </ul>
    </div>
  );
}

function ChangeItem({ item }: { item: ChangelogItem }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed">
      <span className="mt-[9px] block size-1 shrink-0 rounded-full bg-muted-foreground/40" />
      <span>
        {item.scope && (
          <span className="font-medium">{item.scope}: </span>
        )}
        <span className="text-foreground/80">{renderInlineMarkdown(item.message)}</span>
        {item.hash && (
          <a
            href={item.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1.5 font-mono text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            {item.hash.slice(0, 7)}
          </a>
        )}
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getSectionIcon(title: string) {
  if (title.includes("Feature")) return Sparkles;
  if (title.includes("Bug")) return Bug;
  if (title.includes("Performance")) return Zap;
  return CircleDot;
}

/**
 * 인라인 마크다운을 React 요소로 변환 (Server Component, 의존성 없음)
 * 지원: **bold**, `code`, [link](url)
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const tokenRegex = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] != null) {
      parts.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    } else if (match[2] != null) {
      parts.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {match[2]}
        </code>,
      );
    } else if (match[3] != null && match[4] != null) {
      const href = /^https?:\/\//.test(match[4]) || match[4].startsWith("/") ? match[4] : "#";
      parts.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground"
        >
          {match[3]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
