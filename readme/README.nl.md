<div align="center">

<img width="full" alt="Claude en OpenCode werken parallel in Superset-werkruimtes met live diffs" src="../apps/marketing/public/images/readme-hero.gif" />

### Draai 100+ coding agents parallel

<details>
<summary>🌐 Lees in andere talen</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Dit is een vertaling van de Engelse README, die leidend is.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex of elke andere CLI-agent, elk in een eigen geïsoleerde worktree.<br />
Besteed je tijd aan shippen, niet aan wachten.

<br />

[**Download voor macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentatie](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Codeer 10x sneller zonder omschakelkosten

Superset draait CLI-gebaseerde coding agents parallel in geïsoleerde git-worktrees, met ingebouwde workflows voor terminal, review en openen-in-editor.

- **Draai meerdere agents tegelijk** zonder de overhead van contextwisselingen
- **Isoleer elke taak** in een eigen git-worktree zodat agents elkaar niet in de weg zitten
- **Houd al je agents in de gaten** vanaf één plek en krijg een melding wanneer ze aandacht nodig hebben
- **Bekijk en bewerk wijzigingen snel** met de ingebouwde diff-viewer en editor
- **Open elke werkruimte waar je die nodig hebt** met overdracht in één klik naar je editor of terminal
- **Bereik je werkruimtes overal vandaan** via remote hosts, de CLI, de SDK of MCP

Minder wachten, meer shippen.

## Functies

<table>
<tr>
<td width="50%" valign="middle">

### Parallelle werkruimtes

Draai 100+ coding agents tegelijk, elk in een eigen git-worktree met een eigen branch, terminal en omgeving. Vergelijk de resultaten en merge de winnaar.

[Docs →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude streamt een billing-migratie terwijl andere agents in parallelle werkruimtes draaien" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Agent-monitoring

Volg elke agent vanuit de zijbalk, met werkindicatoren, voltooiingsgeluiden en dock-badges wanneer er één je aandacht nodig heeft.

[Docs →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Een agent die zijn taak afrondt terwijl de status in de zijbalk omslaat van bezig naar klaar" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Ingebouwde terminal

Tabbladen, oneindig veel splits, presets en persistente sessies die herstarts overleven. Druk op ⌘I voor een rijke prompteditor met meerregelig bewerken en @-bestandsvermeldingen.

[Docs →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Een vervolgvraag typen met een @-bestandsvermelding in de rijke prompteditor naast een gesplitste terminal" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Ingebouwde diff-viewer

Inspecteer, becommentarieer en bewerk agent-wijzigingen zonder de app te verlaten, en commit en push wanneer het klaar is.

[Docs →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="De wijzigingen van een agent reviewen in de diff-viewer" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### In-app browser & poorten

Bekijk draaiende dev-servers in een browserpaneel. Poorten worden per werkruimte gedetecteerd, dus elke worktree krijgt een eigen preview.

[Docs →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="In-app browser met een preview van een dev-server met gedetecteerde poorten" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatiseringen

Draai agent-sessies volgens schema: trieer issues 's nachts, stel de wekelijkse changelog op, houd dependencies actueel.

[Docs →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Geplande agent-automatiseringen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Externe toegang

Verbind een andere machine en bereik zijn werkruimtes overal vandaan: de desktop-app, de CLI of je telefoon. Wek offline hosts met een aangepast commando.

[Docs →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosts en leden in organisatie-instellingen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Script het vanuit elke shell: maak werkruimtes aan, start agents, lees hun terminals en beheer automatiseringen met één binary. Als een agent een commando kan uitvoeren, kan hij Superset aansturen.

[Docs →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Een werkruimte aanmaken en een agent starten vanuit de Superset CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Commandopalet

Spring naar elke werkruimte, actie of instelling vanuit één zoekvak.

[Docs →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Typen in het commandopalet en live werkruimte-acties filteren" width="100%" /></a>
</td>
</tr>
</table>

**Ook inbegrepen:**

- **[Ingebouwde skills](https://docs.superset.sh/skills)**: agents komen voorgeladen met `superset:*`-skills (parallelle agents orkestreren, automatiseringen inplannen, feedback indienen, problemen diagnosticeren), automatisch klaargezet bij de start
- **[Modelkiezer & aangepaste agents](https://docs.superset.sh/agent-integration)**: kies bij de start een model en redeneerinspanning, en voeg elke terminal-agent toe met een eigen icoon
- **[Setup-scripts voor werkruimtes](https://docs.superset.sh/setup-teardown-scripts)**: automatiseer env-setup, dependency-installaties en dev-servers per werkruimte
- **[Terminal-presets](https://docs.superset.sh/terminal-presets)**: sla agent- en shell-layouts op en open ze met één toetsaanslag
- **[Slack & Linear](https://docs.superset.sh/use-with-linear)**: start werkruimtes vanuit Slack-berichten of Linear-issues
- **[Openen in je IDE](https://docs.superset.sh/use-with-ide)**: overdracht in één klik naar Cursor, VS Code of elke andere editor
- **[Aangepaste thema's](https://docs.superset.sh/custom-themes)**: bouw, bewerk en importeer themabestanden
- **[Sneltoetsen](https://docs.superset.sh/keyboard-shortcuts)**: elke actie is opnieuw toewijsbaar via **Instellingen → Sneltoetsen** (⌘/)
- **[Gebruik je eigen providers](https://docs.superset.sh/providers)**: verbind OpenRouter, Bedrock, Vertex of Vercel AI Gateway
- **En nog veel meer**: we shippen dagelijks, dus deze lijst loopt altijd achter. De [changelog](https://superset.sh/changelog) is de echte featurelijst.

## Ondersteunde agents

Superset werkt met elke CLI-gebaseerde coding agent, waaronder:

| Agent | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Volledig ondersteund |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Volledig ondersteund |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Volledig ondersteund |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Volledig ondersteund |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Volledig ondersteund |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Volledig ondersteund |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Volledig ondersteund |
| Elke andere CLI-agent | Werkt zonder configuratie |

Als het in een terminal draait, draait het op Superset

Agents krijgen meer dan alleen een terminal:

- **Modelkiezer**: kies een model en redeneerinspanning wanneer je een agent start
- **Instellingen per agent**: stem startcommando's, prompt-templates en modeloverrides af in Instellingen → Agents
- **Aangepaste agents**: voeg elke terminal-agent toe met een eigen icoon en hij werkt als een ingebouwde
- **Status en meldingen**: werkindicatoren, voltooiingsgeluiden en dock-badges wanneer een agent je nodig heeft
- **Ingebouwde chat**: praat met modellen in een chatpaneel, met inline toolgoedkeuringen en planreview

## Meer dan een desktop-app

Elk oppervlak praat met dezelfde werkruimtes, dus je kunt een taak in de app starten en er overal op terugkomen.

| Oppervlak | Wat je krijgt |
|:--------|:-------------|
| [**Desktop-app**](https://github.com/superset-sh/superset/releases/latest) | De volledige IDE: terminals, diff-viewer, in-app browser, automatiseringen |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Eén `superset`-binary om werkruimtes, agents, terminals en hosts vanuit elke shell te beheren |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Stuur Superset programmatisch aan met [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) vanuit Node, Bun of Deno |
| [**MCP-server**](https://docs.superset.sh/mcp) | Laat Claude Code, Codex, Cursor en andere agents zelf werkruimtes aanmaken en beheren |

De CLI wordt meegeleverd met de desktop-app, of installeer hem los:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Er komt binnenkort een iOS-app zodat je je agents vanaf je telefoon kunt checken.

## Installatie

Download de desktop-app:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (experimenteel; macOS is het primaire doelplatform)
- **Windows**: nog niet beschikbaar
- [Alle builds](https://github.com/superset-sh/superset/releases/latest)

Het enige dat je geïnstalleerd moet hebben is [Git](https://git-scm.com/). [gh](https://cli.github.com/) is optioneel en ontgrendelt de PR-workflows; Superset biedt aan het voor je te installeren.

## Ontwikkeling

Wil je aan Superset sleutelen of een PR bijdragen? Cloneer de repository, voeg hem toe aan de
geïnstalleerde Superset-app en maak een werkruimte aan voor je wijziging:

```bash
git clone https://github.com/superset-sh/superset.git
```

Draai daarna de development-setup vanuit de terminal van die werkruimte:

```bash
./.superset/setup.local.sh
bun run dev
```

Draai `setup.local.sh` één keer in elke nieuwe worktree. Het configureert werkruimte-specifieke
app-identiteit en poorten, zodat de development-desktop-app naast de geïnstalleerde
Superset-app en andere development-worktrees kan draaien.

Er is geen Neon-account en er zijn geen third-party credentials nodig. `setup.local.sh` zet
een lokale Postgres + Electric-stack op via Docker en seedt een dev-account. Log in
met de knop **"Sign in as dev"** (of `admin@local.test` / `supersetdev`).

Vereisten: [Bun](https://bun.sh/) v1.3.14+ (vastgezet in `.bun-version`), `docker`, `jq` en `caddy`, dat `bun dev` draait als de lokale HTTPS-proxy (`brew install jq caddy && caddy trust`).

Zie [**DEVELOPMENT.md**](../DEVELOPMENT.md) voor de volledige gids: wat het setup-script doet, handmatige setup tegen echte services, veelgebruikte commando's, troubleshooting en hoe je de desktop-app bouwt. Het bijdrageproces staat in [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configuratie

Configureer setup-, teardown- en run-scripts voor werkruimtes in `.superset/config.json`. Zie de [volledige documentatie](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Sneltoetsen zijn aanpasbaar via **Instellingen → Sneltoetsen** (⌘/); zie de [volledige sneltoetsenlijst](https://docs.superset.sh/keyboard-shortcuts).

## Tech-stack

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

## Standaard privé

- **Broncode beschikbaar**: de volledige broncode staat op GitHub onder de Elastic License 2.0 (ELv2).
- **Expliciete verbindingen**: jij kiest welke agents, providers en integraties je verbindt.

## Bijdragen

We verwelkomen bijdragen! Zie [CONTRIBUTING.md](../CONTRIBUTING.md) voor hoe je aan de slag gaat en een PR opent. Bugs en featureverzoeken horen in [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Community

Word lid van de Superset-community om hulp te krijgen, feedback te delen en andere gebruikers te ontmoeten:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chat met het team en de community
- **[Twitter](https://x.com/superset_sh)**: volg voor updates en aankondigingen
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: meld bugs en vraag features aan
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: stel vragen en deel ideeën

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licentie & wat voor altijd gratis is

**De desktop-app is voor altijd gratis.** Agents parallel draaien op je eigen machine zal nooit betaling vereisen. Alles waarvoor we geld vragen, wordt een optionele service daarbovenop.

De hele app staat in deze repo onder de [Elastic License 2.0](../LICENSE.md): gebruik hem, fork hem, pas hem aan, self-host hem voor je team. Het enige dat niet mag, is Superset zelf herverpakken als een service die je aan anderen verkoopt.
