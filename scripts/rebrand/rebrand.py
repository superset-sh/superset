#!/usr/bin/env python3
"""Swap the user-facing brand name in a checkout of superset-sh/superset.

Usage:
  python3 rebrand.py --repo PATH [--write] [--plugins] [--report-dir DIR]
                     [--baseline FILE]

Without --write it only reports (and exits 1 if anything would change), so a
second run after --write is the idempotency check. See README.md.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def git_files(repo: Path) -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(repo), "ls-files", "-z"],
        check=True,
        capture_output=True,
    ).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def match_any(path: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, g) for g in globs)


def area_of(path: str) -> str:
    parts = path.split("/")
    if parts[0] in ("apps", "packages", "plugins") and len(parts) > 2:
        if parts[:2] == ["packages", "i18n"] and parts[2] == "locales":
            return "packages/i18n/locales"
        return "/".join(parts[:2])
    if parts[0] in ("readme", ".github") and len(parts) > 1:
        return parts[0]
    return parts[0] if len(parts) > 1 else "(root files)"


def lang_of(path: str) -> str | None:
    m = re.search(r"(?:^|[/.])(ko|tr)(?:[/.]|$)", path)
    return m.group(1) if m else None


class Rebrander:
    def __init__(self, cfg: dict, flags: set[str]):
        self.cfg = cfg
        self.old = cfg["old"]
        self.new = cfg["new"]
        suffixes = "|".join(re.escape(s) for s in cfg.get("inflection_suffixes", []))
        tail = rf"(?![A-Za-z0-9_])"
        if suffixes:
            tail = rf"(?:(?![A-Za-z0-9_])|(?=(?:{suffixes})(?![A-Za-z0-9_])))"
        self.word = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(self.old)}{tail}")
        self.upper = re.compile(
            rf"(?<![A-Za-z0-9_]){re.escape(cfg['old_upper'])}(?![A-Za-z0-9_])"
        )
        self.excludes = [
            r
            for r in cfg["exclude_files"]
            if not (r.get("unless_flag") and r["unless_flag"] in flags)
        ]
        self.protect = [
            (r["rule"], re.compile(r["regex"]), tuple(r.get("skip_ext", [])))
            for r in cfg["protect_patterns"]
        ]
        self.protect_lines = [
            (r["rule"], r["glob"], re.compile(r["regex"])) for r in cfg["protect_lines"]
        ]
        self.flag_lines = [
            (r["note"], r.get("glob"), re.compile(r["regex"])) for r in cfg["flag_lines"]
        ]
        self.upper_lines = [
            (r["glob"], re.compile(r["regex"])) for r in cfg["upper_display_lines"]
        ]
        self.postfix = [
            (r["lang"], re.compile(r["regex"]), r["to"]) for r in cfg["postfix"]
        ]

        self.changed = Counter()
        self.skipped = Counter()
        self.skipped_by_area = defaultdict(Counter)
        self.excluded_files = defaultdict(list)
        self.flags_hit: list[tuple[str, str, int, str]] = []
        self.legal_hits: list[tuple[str, int, str]] = []
        self.postfix_hits: list[tuple[str, int, str]] = []
        self.changed_lines: list[tuple[str, str]] = []
        self.skipped_lines: list[tuple[str, str, int, str]] = []
        self.files_changed = 0

    def excluded_rule(self, path: str) -> str | None:
        for r in self.excludes:
            if match_any(path, r["globs"]):
                return r["rule"]
        return None

    def protected_rule(self, path: str, line: str, start: int, end: int) -> str | None:
        for rule, glob, rx in self.protect_lines:
            if fnmatch.fnmatchcase(path, glob) and rx.search(line):
                return rule
        ext = os.path.splitext(path)[1]
        for rule, rx, skip_ext in self.protect:
            if ext in skip_ext:
                continue
            for m in rx.finditer(line):
                if m.start() <= start and end <= m.end():
                    return rule
        return None

    def rewrite_line(self, path: str, lineno: int, line: str) -> str:
        area = area_of(path)
        pieces = []
        last = 0
        swapped = 0
        for m in self.word.finditer(line):
            rule = self.protected_rule(path, line, m.start(), m.end())
            if rule:
                self.skipped[rule] += 1
                self.skipped_by_area[area][rule] += 1
                if rule == "legal-entity":
                    self.legal_hits.append((path, lineno, line.strip()[:160]))
                self.skipped_lines.append((rule, path, lineno, line.strip()[:200]))
                continue
            pieces.append(line[last : m.start()])
            pieces.append(self.new)
            last = m.end()
            swapped += 1
        pieces.append(line[last:])
        out = "".join(pieces)
        for glob, rx in self.upper_lines:
            if fnmatch.fnmatchcase(path, glob) and rx.search(out):
                out, n = self.upper.subn(self.cfg["new_upper"], out)
                swapped += n
        if not swapped:
            return line
        self.changed[area] += swapped
        lang = lang_of(path)
        for plang, rx, to in self.postfix:
            if plang == lang or (plang == "ko" and re.search("[가-힣]", out)):
                fixed = rx.sub(to, out)
                if fixed != out:
                    self.postfix_hits.append((path, lineno, fixed.strip()[:160]))
                    out = fixed
        for note, glob, rx in self.flag_lines:
            if glob and not fnmatch.fnmatchcase(path, glob):
                continue
            if rx.search(line):
                self.flags_hit.append((note, path, lineno, line.strip()[:160]))
        self.changed_lines.append((path, line.rstrip("\n")))
        return out

    def run_file(self, repo: Path, path: str, write: bool) -> None:
        full = repo / path
        if full.is_symlink() or not full.is_file():
            return
        raw = full.read_bytes()
        if b"\0" in raw[:8192]:
            return
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            return
        if self.old not in text and not any(
            fnmatch.fnmatchcase(path, g) for g, _ in self.upper_lines
        ):
            return
        rule = self.excluded_rule(path)
        if rule:
            n = len(self.word.findall(text))
            if n:
                self.excluded_files[rule].append((path, n))
                self.skipped[f"file:{rule}"] += n
                self.skipped_by_area[area_of(path)][f"file:{rule}"] += n
            return
        lines = text.splitlines(keepends=True)
        out = [self.rewrite_line(path, i + 1, ln) for i, ln in enumerate(lines)]
        new_text = "".join(out)
        if new_text != text:
            self.files_changed += 1
            if write:
                full.write_text(new_text, encoding="utf-8")


def check_prework(repo: Path, cfg: dict) -> list[str]:
    missing = []
    for m in cfg.get("prework_markers", []):
        f = repo / m["file"]
        if not f.exists() or m["contains"] not in f.read_text(encoding="utf-8"):
            missing.append(f"{m['file']} (expected to contain {m['contains']!r})")
    return missing


def write_reports(rb: Rebrander, report_dir: Path, baseline: Path | None) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "files_changed": rb.files_changed,
        "changed_by_area": dict(rb.changed.most_common()),
        "skipped_by_rule": dict(rb.skipped.most_common()),
        "skipped_by_area": {a: dict(c) for a, c in sorted(rb.skipped_by_area.items())},
        "excluded_files": {
            r: sorted(v, key=lambda x: -x[1]) for r, v in rb.excluded_files.items()
        },
        "flagged": [
            {"note": n, "file": p, "line": l, "text": t} for n, p, l, t in rb.flags_hit
        ],
        "legal_entity_occurrences": [
            {"file": p, "line": l, "text": t} for p, l, t in rb.legal_hits
        ],
        "locale_grammar_fixups": [
            {"file": p, "line": l, "text": t} for p, l, t in rb.postfix_hits
        ],
    }
    (report_dir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (report_dir / "skipped-lines.tsv").write_text(
        "\n".join(f"{r}\t{p}:{l}\t{t}" for r, p, l, t in sorted(set(rb.skipped_lines))) + "\n"
    )
    reviewed = sorted({f"{p}\t{t}" for p, t in rb.changed_lines})
    (report_dir / "changed-lines.tsv").write_text("\n".join(reviewed) + "\n")
    if baseline and baseline.exists():
        known = set(baseline.read_text().splitlines())
        fresh = [r for r in reviewed if r not in known]
        (report_dir / "new-since-baseline.tsv").write_text("\n".join(fresh) + "\n")
        print(f"\n{len(fresh)} changed lines are not in the reviewed baseline:")
        print(f"  {report_dir / 'new-since-baseline.tsv'}  (review the code ones by hand)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--config", type=Path, default=HERE / "config.json")
    ap.add_argument("--write", action="store_true", help="apply changes in place")
    ap.add_argument("--plugins", action="store_true", help="also rewrite plugins/ (needs republish)")
    ap.add_argument("--report-dir", type=Path, default=HERE / "reports" / "latest")
    ap.add_argument("--baseline", type=Path, default=HERE / "reports" / "baseline-changed-lines.tsv")
    args = ap.parse_args()

    repo = args.repo.resolve()
    cfg = load_config(args.config)
    missing = check_prework(repo, cfg)
    if missing:
        print("WARNING: desktop/mobile display-name prework is not applied:")
        for m in missing:
            print(f"  - {m}")
        print("  Apply prework/*.patch first (README step 2) or the bundle name stays.\n")

    rb = Rebrander(cfg, {"plugins"} if args.plugins else set())
    for path in git_files(repo):
        rb.run_file(repo, path, args.write)

    write_reports(rb, args.report_dir, args.baseline)
    total = sum(rb.changed.values())
    print(f"{'Changed' if args.write else 'Would change'} {total} occurrences in {rb.files_changed} files")
    for area, n in rb.changed.most_common():
        print(f"  {n:6d}  {area}")
    print(f"Skipped {sum(rb.skipped.values())} occurrences on purpose:")
    for rule, n in rb.skipped.most_common():
        print(f"  {n:6d}  {rule}")
    print(f"Flagged for a human: {len(rb.flags_hit)} lines; legal entity: {len(rb.legal_hits)}; "
          f"locale grammar fixups: {len(rb.postfix_hits)}")
    print(f"Reports: {args.report_dir}")
    if not args.write and total:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
