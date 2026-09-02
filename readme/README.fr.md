<div align="center">

<img width="full" alt="Claude et OpenCode travaillant en parallèle dans des espaces de travail Superset avec des diffs en direct" src="../apps/marketing/public/images/readme-hero.gif" />

### Exécutez plus de 100 agents de codage en parallèle

<details>
<summary>🌐 Lire dans une autre langue</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Ceci est une traduction du [README anglais](../README.md), qui reste la version de référence.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex ou n'importe quel agent CLI, chacun dans son propre worktree isolé.<br />
Passez votre temps à livrer, pas à attendre.

<br />

[**Télécharger pour macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentation](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Codez 10x plus vite, sans coût de changement de contexte

Superset exécute des agents de codage en ligne de commande en parallèle dans des worktrees git isolés, avec terminal, revue de code et ouverture dans l'éditeur intégrés.

- **Exécutez plusieurs agents simultanément** sans la surcharge du changement de contexte
- **Isolez chaque tâche** dans son propre worktree git pour que les agents n'interfèrent pas entre eux
- **Surveillez tous vos agents** depuis un seul endroit et soyez notifié quand ils ont besoin de vous
- **Relisez et modifiez les changements rapidement** avec la visionneuse de diff et l'éditeur intégrés
- **Ouvrez n'importe quel espace de travail là où vous en avez besoin** avec une passation en un clic vers votre éditeur ou votre terminal
- **Accédez à vos espaces de travail depuis n'importe où** via les hôtes distants, la CLI, le SDK ou MCP

Attendez moins, livrez plus.

## Fonctionnalités

<table>
<tr>
<td width="50%" valign="middle">

### Espaces de travail parallèles

Exécutez plus de 100 agents de codage à la fois, chacun dans son propre worktree git avec sa propre branche, son terminal et son environnement. Comparez les résultats et mergez le gagnant.

[Docs →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude diffusant une migration de facturation pendant que d'autres agents tournent dans des espaces de travail parallèles" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Supervision des agents

Suivez chaque agent depuis la barre latérale, avec indicateurs d'activité, carillons de fin de tâche et badges sur le dock quand l'un d'eux a besoin de votre attention.

[Docs →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Un agent terminant sa tâche et le statut de la barre latérale passant de « en cours » à « terminé »" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal intégré

Onglets, divisions illimitées, préréglages et sessions persistantes qui survivent aux redémarrages. Appuyez sur ⌘I pour un éditeur de prompt enrichi avec édition multiligne et mentions de fichiers via @.

[Docs →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Saisie d'une relance avec une mention de fichier @ dans l'éditeur de prompt enrichi à côté d'un terminal divisé" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Visionneuse de diff intégrée

Inspectez, commentez et modifiez les changements des agents sans quitter l'app, puis faites commit et push quand c'est prêt.

[Docs →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Revue des changements d'un agent dans la visionneuse de diff" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Navigateur intégré et ports

Prévisualisez les serveurs de dev en cours d'exécution dans un panneau navigateur. Les ports sont détectés par espace de travail, chaque worktree a donc son propre aperçu.

[Docs →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Navigateur intégré prévisualisant un serveur de dev avec les ports détectés" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatisations

Exécutez des sessions d'agent selon un planning : triez les issues pendant la nuit, rédigez le changelog hebdomadaire, gardez les dépendances à jour.

[Docs →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Automatisations d'agents planifiées" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Accès distant

Connectez une autre machine et accédez à ses espaces de travail depuis n'importe où : l'app de bureau, la CLI ou votre téléphone. Réveillez les hôtes hors ligne avec une commande personnalisée.

[Docs →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hôtes et membres dans les paramètres de l'organisation" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### CLI Superset

Scriptez tout depuis n'importe quel shell : créez des espaces de travail, lancez des agents, lisez leurs terminaux et gérez les automatisations avec un seul binaire. Si un agent peut exécuter une commande, il peut piloter Superset.

[Docs →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Création d'un espace de travail et lancement d'un agent depuis la CLI Superset" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Palette de commandes

Accédez à n'importe quel espace de travail, action ou paramètre depuis une seule zone de recherche.

[Docs →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Saisie dans la palette de commandes et filtrage en direct des actions d'espace de travail" width="100%" /></a>
</td>
</tr>
</table>

**Également inclus :**

- **[Compétences intégrées](https://docs.superset.sh/skills)** : les agents arrivent préchargés avec les compétences `superset:*` (orchestrer des agents parallèles, planifier des automatisations, envoyer des retours, diagnostiquer des problèmes), provisionnées automatiquement au lancement
- **[Sélecteur de modèle et agents personnalisés](https://docs.superset.sh/agent-integration)** : choisissez un modèle et un niveau de raisonnement au lancement, et ajoutez n'importe quel agent de terminal avec sa propre icône
- **[Scripts de configuration d'espace de travail](https://docs.superset.sh/setup-teardown-scripts)** : automatisez la configuration de l'environnement, l'installation des dépendances et les serveurs de dev par espace de travail
- **[Préréglages de terminal](https://docs.superset.sh/terminal-presets)** : enregistrez des dispositions d'agents et de shells et ouvrez-les d'une seule touche
- **[Slack et Linear](https://docs.superset.sh/use-with-linear)** : créez des espaces de travail depuis des messages Slack ou des issues Linear
- **[Ouvrir dans votre IDE](https://docs.superset.sh/use-with-ide)** : passation en un clic vers Cursor, VS Code ou n'importe quel éditeur
- **[Thèmes personnalisés](https://docs.superset.sh/custom-themes)** : créez, modifiez et importez des fichiers de thème
- **[Raccourcis clavier](https://docs.superset.sh/keyboard-shortcuts)** : chaque action est remappable via **Paramètres → Raccourcis clavier** (⌘/)
- **[Apportez vos propres fournisseurs](https://docs.superset.sh/providers)** : connectez OpenRouter, Bedrock, Vertex ou Vercel AI Gateway
- **Et bien plus encore** : nous livrons tous les jours, cette liste est donc perpétuellement en retard. Le [changelog](https://superset.sh/changelog) est la vraie liste des fonctionnalités.

## Agents pris en charge

Superset fonctionne avec n'importe quel agent de codage en ligne de commande, notamment :

| Agent | Statut |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Entièrement pris en charge |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Entièrement pris en charge |
| Tout autre agent CLI | Fonctionne sans configuration |

S'il tourne dans un terminal, il tourne sur Superset

Les agents obtiennent plus qu'un terminal :

- **Sélecteur de modèle** : choisissez un modèle et un niveau de raisonnement quand vous lancez un agent
- **Paramètres par agent** : ajustez les commandes de lancement, les modèles de prompt et les modèles de langage dans Paramètres → Agents
- **Agents personnalisés** : ajoutez n'importe quel agent de terminal avec sa propre icône et il fonctionne comme un agent intégré
- **Statut et notifications** : indicateurs d'activité, carillons de fin de tâche et badges sur le dock quand un agent a besoin de vous
- **Chat intégré** : discutez avec les modèles dans un panneau de chat, avec approbation des outils en ligne et revue de plan

## Plus qu'une app de bureau

Chaque surface parle aux mêmes espaces de travail : vous pouvez démarrer une tâche dans l'app et la suivre depuis n'importe où.

| Surface | Ce que vous obtenez |
|:--------|:-------------|
| [**App de bureau**](https://github.com/superset-sh/superset/releases/latest) | L'IDE complet : terminaux, visionneuse de diff, navigateur intégré, automatisations |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Un seul binaire `superset` pour gérer espaces de travail, agents, terminaux et hôtes depuis n'importe quel shell |
| [**SDK TypeScript**](https://docs.superset.sh/sdk/getting-started) | Pilotez Superset par programmation avec [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) depuis Node, Bun ou Deno |
| [**Serveur MCP**](https://docs.superset.sh/mcp) | Laissez Claude Code, Codex, Cursor et d'autres agents créer et gérer eux-mêmes des espaces de travail |

La CLI est fournie avec l'app de bureau, ou installez-la seule :

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Une app iOS arrive bientôt pour que vous puissiez suivre vos agents depuis votre téléphone.

## Installation

Téléchargez l'app de bureau :

- **macOS** : [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux** : [AppImage x64](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (expérimental ; macOS est la cible principale)
- **Windows** : pas encore disponible
- [Tous les builds](https://github.com/superset-sh/superset/releases/latest)

Tout ce dont vous avez besoin est [Git](https://git-scm.com/). [gh](https://cli.github.com/) est facultatif et débloque les workflows de PR ; Superset propose de l'installer pour vous.

## Développement

Envie de bidouiller Superset ou de contribuer une PR ? Clonez le dépôt, ajoutez-le à
l'app Superset installée et créez un espace de travail pour votre changement :

```bash
git clone https://github.com/superset-sh/superset.git
```

Puis lancez la configuration de développement depuis le terminal de cet espace de travail :

```bash
./.superset/setup.local.sh
bun run dev
```

Exécutez `setup.local.sh` une fois dans chaque nouveau worktree. Il configure l'identité
d'app et les ports propres à l'espace de travail pour que l'app de bureau de développement
puisse tourner à côté de l'app Superset installée et des autres worktrees de développement.

Aucun compte Neon ni identifiant tiers n'est nécessaire. `setup.local.sh` démarre
une pile locale Postgres + Electric via Docker et amorce un compte de dev. Connectez-vous
avec le bouton **« Sign in as dev »** (ou `admin@local.test` / `supersetdev`).

Prérequis : [Bun](https://bun.sh/) v1.3.14+ (épinglé dans `.bun-version`), `docker`, `jq` et `caddy`, que `bun dev` exécute comme proxy HTTPS local (`brew install jq caddy && caddy trust`).

Voir [**DEVELOPMENT.md**](../DEVELOPMENT.md) pour le guide complet : ce que fait le script de configuration, la configuration manuelle avec de vrais services, les commandes courantes, le dépannage et comment builder l'app de bureau. Le processus de contribution est décrit dans [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configuration

Configurez les scripts de setup, de teardown et de run des espaces de travail dans `.superset/config.json`. Voir la [documentation complète](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Les raccourcis clavier sont personnalisables via **Paramètres → Raccourcis clavier** (⌘/) ; voir la [liste complète des raccourcis](https://docs.superset.sh/keyboard-shortcuts).

## Pile technique

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

## Privé par défaut

- **Source disponible** : le code source complet est sur GitHub sous licence Elastic License 2.0 (ELv2).
- **Connexions explicites** : c'est vous qui choisissez quels agents, fournisseurs et intégrations connecter.

## Contribuer

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](../CONTRIBUTING.md) pour savoir comment vous installer et ouvrir une PR. Les bugs et demandes de fonctionnalités vont dans les [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Communauté

Rejoignez la communauté Superset pour obtenir de l'aide, partager vos retours et échanger avec d'autres utilisateurs :

- **[Discord](https://discord.gg/cZeD9WYcV7)** : discutez avec l'équipe et la communauté
- **[Twitter](https://x.com/superset_sh)** : suivez-nous pour les mises à jour et les annonces
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)** : signalez des bugs et demandez des fonctionnalités
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)** : posez des questions et partagez vos idées

### Équipe

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licence et ce qui est gratuit pour toujours

**L'app de bureau est gratuite pour toujours.** Exécuter des agents en parallèle sur votre propre machine ne nécessitera jamais de paiement. Tout ce que nous facturerons sera un service optionnel en plus.

L'app entière est dans ce dépôt sous [Elastic License 2.0](../LICENSE.md) : utilisez-la, forkez-la, modifiez-la, hébergez-la vous-même pour votre équipe. La seule chose exclue est de reconditionner Superset lui-même en un service que vous vendez à d'autres.
