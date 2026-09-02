<div align="center">

<img width="full" alt="Claude und OpenCode arbeiten parallel in Superset-Arbeitsbereichen mit Live-Diffs" src="../apps/marketing/public/images/readme-hero.gif" />

### Führe über 100 Coding-Agenten parallel aus

<details>
<summary>🌐 In anderen Sprachen lesen</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Dies ist eine Übersetzung des [englischen READMEs](../README.md), das die maßgebliche Version ist.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex oder jeder andere CLI-Agent, jeder in seinem eigenen isolierten Worktree.<br />
Verbring deine Zeit mit Shippen, nicht mit Warten.

<br />

[**Für macOS herunterladen**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Dokumentation](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Programmiere 10x schneller, ohne Kosten fürs Kontextwechseln

Superset führt CLI-basierte Coding-Agenten parallel in isolierten Git-Worktrees aus, mit integriertem Terminal, Review und Öffnen-im-Editor-Workflows.

- **Führe mehrere Agenten gleichzeitig aus**, ohne den Overhead ständiger Kontextwechsel
- **Isoliere jede Aufgabe** in ihrem eigenen Git-Worktree, damit sich die Agenten nicht gegenseitig in die Quere kommen
- **Behalte alle deine Agenten im Blick** von einem Ort aus und werde benachrichtigt, wenn sie Aufmerksamkeit brauchen
- **Prüfe und bearbeite Änderungen schnell** mit dem integrierten Diff-Viewer und Editor
- **Öffne jeden Arbeitsbereich dort, wo du ihn brauchst**, mit Ein-Klick-Übergabe an deinen Editor oder dein Terminal
- **Erreiche deine Arbeitsbereiche von überall** über Remote-Hosts, die CLI, das SDK oder MCP

Weniger warten, mehr shippen.

## Funktionen

<table>
<tr>
<td width="50%" valign="middle">

### Parallele Arbeitsbereiche

Führe über 100 Coding-Agenten gleichzeitig aus, jeden in seinem eigenen Git-Worktree mit eigener Branch, eigenem Terminal und eigener Umgebung. Vergleiche die Ergebnisse und merge den Gewinner.

[Docs →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude streamt eine Billing-Migration, während andere Agenten in parallelen Arbeitsbereichen laufen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Agenten-Überwachung

Verfolge jeden Agenten über die Seitenleiste, mit Aktivitätsanzeigen, Abschluss-Klängen und Dock-Badges, wenn einer deine Aufmerksamkeit braucht.

[Docs →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Ein Agent schließt seine Aufgabe ab und der Status in der Seitenleiste springt von „arbeitet“ auf „fertig“" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Integriertes Terminal

Tabs, unbegrenzte Splits, Presets und persistente Sessions, die Neustarts überleben. Drücke ⌘I für einen komfortablen Prompt-Editor mit mehrzeiliger Bearbeitung und @-Datei-Erwähnungen.

[Docs →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Eine Rückfrage mit einer @-Datei-Erwähnung im Prompt-Editor neben einem geteilten Terminal tippen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Integrierter Diff-Viewer

Prüfe, kommentiere und bearbeite Agenten-Änderungen, ohne die App zu verlassen, und mache dann Commit und Push, wenn alles fertig ist.

[Docs →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Die Änderungen eines Agenten im Diff-Viewer prüfen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### In-App-Browser & Ports

Sieh dir laufende Dev-Server in einem Browser-Panel an. Ports werden pro Arbeitsbereich erkannt, sodass jeder Worktree seine eigene Vorschau bekommt.

[Docs →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="In-App-Browser mit Vorschau eines Dev-Servers und erkannten Ports" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatisierungen

Führe Agenten-Sessions nach Zeitplan aus: Issues über Nacht triagieren, den wöchentlichen Changelog entwerfen, Abhängigkeiten aktuell halten.

[Docs →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Geplante Agenten-Automatisierungen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Fernzugriff

Verbinde einen weiteren Rechner und erreiche seine Arbeitsbereiche von überall: über die Desktop-App, die CLI oder dein Smartphone. Wecke Offline-Hosts mit einem eigenen Befehl auf.

[Docs →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosts und Mitglieder in den Organisationseinstellungen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset-CLI

Skripte es aus jeder Shell: Arbeitsbereiche erstellen, Agenten starten, ihre Terminals lesen und Automatisierungen verwalten, alles mit einem einzigen Binary. Wenn ein Agent einen Befehl ausführen kann, kann er Superset steuern.

[Docs →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Einen Arbeitsbereich erstellen und einen Agenten über die Superset-CLI starten" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Befehlspalette

Spring von einem einzigen Suchfeld aus zu jedem Arbeitsbereich, jeder Aktion oder Einstellung.

[Docs →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="In der Befehlspalette tippen und Arbeitsbereich-Aktionen live filtern" width="100%" /></a>
</td>
</tr>
</table>

**Außerdem mit dabei:**

- **[Integrierte Skills](https://docs.superset.sh/skills)**: Agenten kommen mit vorinstallierten `superset:*`-Skills (parallele Agenten orchestrieren, Automatisierungen planen, Feedback einreichen, Probleme diagnostizieren), die beim Start automatisch bereitgestellt werden
- **[Modellauswahl & eigene Agenten](https://docs.superset.sh/agent-integration)**: wähle beim Start ein Modell und den Reasoning-Aufwand und füge jeden Terminal-Agenten mit eigenem Icon hinzu
- **[Setup-Skripte für Arbeitsbereiche](https://docs.superset.sh/setup-teardown-scripts)**: automatisiere Umgebungs-Setup, Abhängigkeitsinstallation und Dev-Server pro Arbeitsbereich
- **[Terminal-Presets](https://docs.superset.sh/terminal-presets)**: speichere Agenten- und Shell-Layouts und öffne sie mit einem Tastendruck
- **[Slack & Linear](https://docs.superset.sh/use-with-linear)**: erstelle Arbeitsbereiche aus Slack-Nachrichten oder Linear-Issues
- **[In deiner IDE öffnen](https://docs.superset.sh/use-with-ide)**: Ein-Klick-Übergabe an Cursor, VS Code oder jeden anderen Editor
- **[Eigene Themes](https://docs.superset.sh/custom-themes)**: erstelle, bearbeite und importiere Theme-Dateien
- **[Tastenkürzel](https://docs.superset.sh/keyboard-shortcuts)**: jede Aktion lässt sich unter **Einstellungen → Tastenkürzel** (⌘/) neu belegen
- **[Bring deine eigenen Provider mit](https://docs.superset.sh/providers)**: verbinde OpenRouter, Bedrock, Vertex oder Vercel AI Gateway
- **Und vieles mehr**: wir shippen täglich, diese Liste hinkt also immer hinterher. Der [Changelog](https://superset.sh/changelog) ist die echte Funktionsliste.

## Unterstützte Agenten

Superset funktioniert mit jedem CLI-basierten Coding-Agenten, unter anderem:

| Agent | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Vollständig unterstützt |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Vollständig unterstützt |
| Jeder andere CLI-Agent | Funktioniert ohne Konfiguration |

Wenn es im Terminal läuft, läuft es auf Superset

Agenten bekommen mehr als nur ein Terminal:

- **Modellauswahl**: wähle beim Start eines Agenten ein Modell und den Reasoning-Aufwand
- **Einstellungen pro Agent**: passe Startbefehle, Prompt-Vorlagen und Modell-Overrides unter Einstellungen → Agenten an
- **Eigene Agenten**: füge jeden Terminal-Agenten mit eigenem Icon hinzu und er funktioniert wie ein integrierter
- **Status und Benachrichtigungen**: Aktivitätsanzeigen, Abschluss-Klänge und Dock-Badges, wenn ein Agent dich braucht
- **Integrierter Chat**: sprich mit Modellen in einem Chat-Panel, mit Inline-Tool-Freigaben und Plan-Review

## Mehr als eine Desktop-App

Jede Oberfläche spricht mit denselben Arbeitsbereichen, du kannst also eine Aufgabe in der App starten und von überall nach ihr sehen.

| Oberfläche | Was du bekommst |
|:--------|:-------------|
| [**Desktop-App**](https://github.com/superset-sh/superset/releases/latest) | Die komplette IDE: Terminals, Diff-Viewer, In-App-Browser, Automatisierungen |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Ein einziges `superset`-Binary, um Arbeitsbereiche, Agenten, Terminals und Hosts aus jeder Shell zu verwalten |
| [**TypeScript-SDK**](https://docs.superset.sh/sdk/getting-started) | Steuere Superset programmatisch mit [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) aus Node, Bun oder Deno |
| [**MCP-Server**](https://docs.superset.sh/mcp) | Lass Claude Code, Codex, Cursor und andere Agenten Arbeitsbereiche selbst erstellen und verwalten |

Die CLI ist in der Desktop-App enthalten, oder installiere sie eigenständig:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Eine iOS-App kommt bald, damit du vom Smartphone aus nach deinen Agenten sehen kannst.

## Installation

Lade die Desktop-App herunter:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64-AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (experimentell; macOS ist die primäre Zielplattform)
- **Windows**: noch nicht verfügbar
- [Alle Builds](https://github.com/superset-sh/superset/releases/latest)

Alles, was du installiert brauchst, ist [Git](https://git-scm.com/). [gh](https://cli.github.com/) ist optional und schaltet die PR-Workflows frei; Superset bietet an, es für dich zu installieren.

## Entwicklung

Du willst an Superset hacken oder eine PR beisteuern? Klone das Repository, füge es der
installierten Superset-App hinzu und erstelle einen Arbeitsbereich für deine Änderung:

```bash
git clone https://github.com/superset-sh/superset.git
```

Führe dann das Entwicklungs-Setup im Terminal dieses Arbeitsbereichs aus:

```bash
./.superset/setup.local.sh
bun run dev
```

Führe `setup.local.sh` einmal in jedem neuen Worktree aus. Es konfiguriert die
arbeitsbereichsspezifische App-Identität und Ports, damit die Entwicklungs-Desktop-App
neben der installierten Superset-App und anderen Entwicklungs-Worktrees laufen kann.

Es sind weder ein Neon-Konto noch Zugangsdaten von Drittanbietern nötig. `setup.local.sh` startet
einen lokalen Postgres-+-Electric-Stack über Docker und legt ein Dev-Konto an. Melde dich
mit dem Button **„Sign in as dev“** an (oder `admin@local.test` / `supersetdev`).

Voraussetzungen: [Bun](https://bun.sh/) v1.3.14+ (in `.bun-version` gepinnt), `docker`, `jq` und `caddy`, das `bun dev` als lokalen HTTPS-Proxy verwendet (`brew install jq caddy && caddy trust`).

Siehe [**DEVELOPMENT.md**](../DEVELOPMENT.md) für die komplette Anleitung: was das Setup-Skript macht, manuelles Setup gegen echte Dienste, gängige Befehle, Fehlerbehebung und wie man die Desktop-App baut. Der Contribution-Prozess steht in [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Konfiguration

Konfiguriere Setup-, Teardown- und Run-Skripte für Arbeitsbereiche in `.superset/config.json`. Siehe die [vollständige Dokumentation](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Tastenkürzel lassen sich unter **Einstellungen → Tastenkürzel** (⌘/) anpassen; siehe die [vollständige Liste der Tastenkürzel](https://docs.superset.sh/keyboard-shortcuts).

## Tech-Stack

<p>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB" alt="React" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white" alt="TailwindCSS" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://turbo.build/"><img src="https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://biomejs.dev/"><img src="https://img.shields.io/badge/Biome-339AF0?logo=biome&logoColor=white" alt="Biome" /></a>
  <a href="https://orm.drizzle.team/"><img src="https://img.shields.io/badge/Drizzle%20ORM-FFE873?logo=drizzle&logoColor=black" alt="Drizzle ORM" /></a>
  <a href="https://neon.tech/"><img src="https://img.shields.io/badge/Neon-00E9CA?logo=neon&logoColor=white" alt="Neon" /></a>
  <a href="https://trpc.io/"><img src="https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white" alt="tRPC" /></a>
</p>

## Standardmäßig privat

- **Source Available**: der komplette Quellcode liegt auf GitHub unter der Elastic License 2.0 (ELv2).
- **Explizite Verbindungen**: du entscheidest, welche Agenten, Provider und Integrationen verbunden werden.

## Mitmachen

Beiträge sind willkommen! Siehe [CONTRIBUTING.md](../CONTRIBUTING.md) für den Einstieg und wie du eine PR öffnest. Bugs und Feature-Wünsche gehören in die [Issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Community

Tritt der Superset-Community bei, um Hilfe zu bekommen, Feedback zu teilen und dich mit anderen auszutauschen:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chatte mit dem Team und der Community
- **[Twitter](https://x.com/superset_sh)**: folge uns für Updates und Ankündigungen
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: melde Bugs und wünsch dir Features
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: stell Fragen und teile Ideen

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Lizenz & was für immer kostenlos bleibt

**Die Desktop-App ist für immer kostenlos.** Agenten parallel auf deinem eigenen Rechner laufen zu lassen wird niemals etwas kosten. Alles, wofür wir Geld verlangen, wird ein optionaler Dienst obendrauf sein.

Die gesamte App liegt in diesem Repository unter der [Elastic License 2.0](../LICENSE.md): nutze sie, forke sie, verändere sie, hoste sie selbst für dein Team. Das Einzige, was nicht geht, ist, Superset selbst als Dienst neu zu verpacken und an andere zu verkaufen.
