/**
 * CHANGELOG.md 파서
 *
 * semantic-release가 생성하는 conventional-changelog 형식을 파싱하여
 * 구조화된 데이터로 변환한다.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  url: string | null;
  sections: ChangelogSection[];
}

export interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

export interface ChangelogItem {
  scope: string | null;
  message: string;
  hash: string | null;
  url: string | null;
}

export function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = raw.split("\n");

  let current: ChangelogEntry | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const line of lines) {
    // ## [0.2.0](url) (2026-02-18)
    const versionMatch = line.match(
      /^## \[(\d+\.\d+\.\d+)\](?:\(([^)]*)\))?\s*\((\d{4}-\d{2}-\d{2})\)/,
    );
    if (versionMatch) {
      current = {
        version: versionMatch[1]!,
        url: versionMatch[2] ?? null,
        date: versionMatch[3]!,
        sections: [],
      };
      entries.push(current);
      currentSection = null;
      continue;
    }

    // ### Features / ### Bug Fixes / etc.
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && current) {
      currentSection = { title: sectionMatch[1]!, items: [] };
      current.sections.push(currentSection);
      continue;
    }

    // * **scope:** message ([hash](url))
    // * message ([hash](url))
    const itemMatch = line.match(
      /^\* (?:\*\*([^*]+)\*\*:\s*)?(.+?)(?:\s*\(\[([^\]]+)\]\(([^)]*)\)\))?$/,
    );
    if (itemMatch && currentSection) {
      currentSection.items.push({
        scope: itemMatch[1] ?? null,
        message: itemMatch[2]!.trim(),
        hash: itemMatch[3] ?? null,
        url: itemMatch[4] ?? null,
      });
    }
  }

  return entries;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const SECTION_TITLES: Record<string, string> = {
  Features: "새로운 기능",
  "Bug Fixes": "버그 수정",
  "Performance Improvements": "성능 개선",
  Refactoring: "리팩토링",
  "BREAKING CHANGES": "주요 변경사항",
};

export function translateSectionTitle(title: string): string {
  return SECTION_TITLES[title] ?? title;
}
