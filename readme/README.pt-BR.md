<div align="center">

<img width="full" alt="Claude e OpenCode trabalhando em paralelo em áreas de trabalho do Superset com diffs ao vivo" src="../apps/marketing/public/images/readme-hero.gif" />

### Execute mais de 100 agentes de código em paralelo

<details>
<summary>🌐 Ler em outros idiomas</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Esta é uma tradução do [README em inglês](../README.md), que é a versão canônica.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex ou qualquer agente de CLI, cada um em seu próprio worktree isolado.<br />
Passe seu tempo entregando, não esperando.

<br />

[**Baixar para macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentação](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Programe 10x mais rápido sem custo de troca de contexto

O Superset executa agentes de código baseados em CLI em paralelo em worktrees git isolados, com terminal, revisão e fluxos de abrir no editor integrados.

- **Execute vários agentes ao mesmo tempo** sem a sobrecarga da troca de contexto
- **Isole cada tarefa** em seu próprio worktree git para que os agentes não interfiram uns nos outros
- **Monitore todos os seus agentes** de um só lugar e seja notificado quando precisarem de atenção
- **Revise e edite mudanças rapidamente** com o visualizador de diff e o editor integrados
- **Abra qualquer área de trabalho onde você precisar** com passagem em um clique para o seu editor ou terminal
- **Acesse suas áreas de trabalho de qualquer lugar** via hosts remotos, CLI, SDK ou MCP

Espere menos, entregue mais.

## Recursos

<table>
<tr>
<td width="50%" valign="middle">

### Áreas de trabalho paralelas

Execute mais de 100 agentes de código de uma vez, cada um em seu próprio worktree git com sua própria branch, terminal e ambiente. Compare os resultados e faça merge do vencedor.

[Docs →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude transmitindo uma migração de cobrança enquanto outros agentes rodam em áreas de trabalho paralelas" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Monitoramento de agentes

Acompanhe cada agente pela barra lateral, com indicadores de atividade, sons de conclusão e badges no dock quando algum precisar da sua atenção.

[Docs →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Um agente terminando sua tarefa e o status na barra lateral mudando de trabalhando para concluído" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal integrado

Abas, divisões infinitas, presets e sessões persistentes que sobrevivem a reinicializações. Pressione ⌘I para um editor de prompt avançado com edição em várias linhas e menções de arquivos com @.

[Docs →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Digitando uma mensagem de acompanhamento com uma menção de arquivo @ no editor de prompt avançado ao lado de um terminal dividido" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Visualizador de diff integrado

Inspecione, comente e edite as mudanças dos agentes sem sair do app, e depois faça commit e push quando estiver pronto.

[Docs →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Revisando as mudanças de um agente no visualizador de diff" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Navegador integrado e portas

Visualize servidores de dev em execução em um painel de navegador. As portas são detectadas por área de trabalho, então cada worktree tem sua própria prévia.

[Docs →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Navegador integrado exibindo a prévia de um servidor de dev com as portas detectadas" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automações

Execute sessões de agentes de forma agendada: faça triagem de issues durante a noite, redija o changelog semanal, mantenha as dependências em dia.

[Docs →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Automações de agentes agendadas" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Acesso remoto

Conecte outra máquina e acesse as áreas de trabalho dela de qualquer lugar: pelo app desktop, pela CLI ou pelo celular. Acorde hosts offline com um comando personalizado.

[Docs →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosts e membros nas configurações da organização" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### CLI do Superset

Automatize de qualquer shell: crie áreas de trabalho, inicie agentes, leia seus terminais e gerencie automações com um único binário. Se um agente consegue executar um comando, ele consegue controlar o Superset.

[Docs →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Criando uma área de trabalho e iniciando um agente pela CLI do Superset" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paleta de comandos

Vá para qualquer área de trabalho, ação ou configuração a partir de uma única caixa de busca.

[Docs →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Digitando na paleta de comandos e filtrando ações de áreas de trabalho ao vivo" width="100%" /></a>
</td>
</tr>
</table>

**Também na caixa:**

- **[Habilidades integradas](https://docs.superset.sh/skills)**: os agentes já vêm carregados com as habilidades `superset:*` (orquestrar agentes em paralelo, agendar automações, enviar feedback, diagnosticar problemas), provisionadas automaticamente na inicialização
- **[Seletor de modelo e agentes personalizados](https://docs.superset.sh/agent-integration)**: escolha um modelo e o nível de raciocínio na inicialização, e adicione qualquer agente de terminal com seu próprio ícone
- **[Scripts de configuração de área de trabalho](https://docs.superset.sh/setup-teardown-scripts)**: automatize a configuração do ambiente, a instalação de dependências e os servidores de dev por área de trabalho
- **[Presets de terminal](https://docs.superset.sh/terminal-presets)**: salve layouts de agentes e shells e abra-os com uma única tecla
- **[Slack e Linear](https://docs.superset.sh/use-with-linear)**: crie áreas de trabalho a partir de mensagens do Slack ou issues do Linear
- **[Abrir na sua IDE](https://docs.superset.sh/use-with-ide)**: passagem em um clique para o Cursor, o VS Code ou qualquer editor
- **[Temas personalizados](https://docs.superset.sh/custom-themes)**: crie, edite e importe arquivos de tema
- **[Atalhos de teclado](https://docs.superset.sh/keyboard-shortcuts)**: toda ação pode ser remapeada em **Configurações → Atalhos de teclado** (⌘/)
- **[Traga seus próprios provedores](https://docs.superset.sh/providers)**: conecte OpenRouter, Bedrock, Vertex ou Vercel AI Gateway
- **E muito mais**: lançamos todo dia, então esta lista está perpetuamente atrasada. O [changelog](https://superset.sh/changelog) é a verdadeira lista de recursos.

## Agentes compatíveis

O Superset funciona com qualquer agente de código baseado em CLI, incluindo:

| Agente | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Totalmente compatível |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Totalmente compatível |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Totalmente compatível |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Totalmente compatível |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Totalmente compatível |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Totalmente compatível |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Totalmente compatível |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Totalmente compatível |
| Qualquer outro agente de CLI | Funciona sem configuração |

Se roda em um terminal, roda no Superset

Os agentes recebem mais do que um terminal:

- **Seletor de modelo**: escolha um modelo e o nível de raciocínio ao iniciar um agente
- **Configurações por agente**: ajuste comandos de inicialização, templates de prompt e substituições de modelo em Configurações → Agentes
- **Agentes personalizados**: adicione qualquer agente de terminal com seu próprio ícone e ele funciona como um integrado
- **Status e notificações**: indicadores de atividade, sons de conclusão e badges no dock quando um agente precisar de você
- **Chat integrado**: converse com os modelos em um painel de chat, com aprovações de ferramentas inline e revisão de planos

## Mais do que um app desktop

Todas as superfícies conversam com as mesmas áreas de trabalho, então você pode começar uma tarefa no app e acompanhá-la de qualquer lugar.

| Superfície | O que você ganha |
|:--------|:-------------|
| [**App desktop**](https://github.com/superset-sh/superset/releases/latest) | A IDE completa: terminais, visualizador de diff, navegador integrado, automações |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Um único binário `superset` para gerenciar áreas de trabalho, agentes, terminais e hosts de qualquer shell |
| [**SDK TypeScript**](https://docs.superset.sh/sdk/getting-started) | Controle o Superset programaticamente com [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) a partir de Node, Bun ou Deno |
| [**Servidor MCP**](https://docs.superset.sh/mcp) | Deixe o Claude Code, o Codex, o Cursor e outros agentes criarem e gerenciarem áreas de trabalho por conta própria |

A CLI vem junto com o app desktop, ou instale-a separadamente:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Um app para iOS chega em breve para você acompanhar seus agentes pelo celular.

## Instalação

Baixe o app desktop:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [AppImage x64](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (experimental; o macOS é o alvo principal)
- **Windows**: ainda não disponível
- [Todas as builds](https://github.com/superset-sh/superset/releases/latest)

Tudo o que você precisa ter instalado é o [Git](https://git-scm.com/). O [gh](https://cli.github.com/) é opcional e desbloqueia os fluxos de PR; o Superset se oferece para instalá-lo para você.

## Desenvolvimento

Quer mexer no Superset ou contribuir com uma PR? Clone o repositório, adicione-o ao
app do Superset instalado e crie uma área de trabalho para a sua mudança:

```bash
git clone https://github.com/superset-sh/superset.git
```

Depois execute a configuração de desenvolvimento no terminal dessa área de trabalho:

```bash
./.superset/setup.local.sh
bun run dev
```

Execute `setup.local.sh` uma vez em cada worktree novo. Ele configura a identidade
do app e as portas específicas da área de trabalho para que o app desktop de desenvolvimento
possa rodar ao lado do app do Superset instalado e de outros worktrees de desenvolvimento.

Não é preciso conta na Neon nem credenciais de terceiros. O `setup.local.sh` sobe
uma stack local de Postgres + Electric via Docker e cria uma conta de dev. Entre
com o botão **"Sign in as dev"** (ou `admin@local.test` / `supersetdev`).

Pré-requisitos: [Bun](https://bun.sh/) v1.3.14+ (fixado em `.bun-version`), `docker`, `jq` e `caddy`, que o `bun dev` executa como proxy HTTPS local (`brew install jq caddy && caddy trust`).

Veja [**DEVELOPMENT.md**](../DEVELOPMENT.md) para o guia completo: o que o script de configuração faz, configuração manual com serviços reais, comandos comuns, solução de problemas e como compilar o app desktop. O processo de contribuição está em [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configuração

Configure os scripts de setup, teardown e run das áreas de trabalho em `.superset/config.json`. Veja a [documentação completa](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Os atalhos de teclado são personalizáveis em **Configurações → Atalhos de teclado** (⌘/); veja a [lista completa de atalhos](https://docs.superset.sh/keyboard-shortcuts).

## Stack de tecnologia

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

## Privado por padrão

- **Código-fonte disponível**: o código completo está no GitHub sob a Elastic License 2.0 (ELv2).
- **Conexões explícitas**: você escolhe quais agentes, provedores e integrações conectar.

## Contribuindo

Contribuições são bem-vindas! Veja [CONTRIBUTING.md](../CONTRIBUTING.md) para saber como se preparar e abrir uma PR. Bugs e pedidos de recursos vão nas [issues](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Comunidade

Junte-se à comunidade do Superset para obter ajuda, compartilhar feedback e se conectar com outros usuários:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: converse com o time e a comunidade
- **[Twitter](https://x.com/superset_sh)**: siga para novidades e anúncios
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: relate bugs e peça recursos
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: faça perguntas e compartilhe ideias

### Time

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licença e o que é grátis para sempre

**O app desktop é grátis para sempre.** Executar agentes em paralelo na sua própria máquina nunca exigirá pagamento. Qualquer coisa que cobrarmos será um serviço opcional por cima.

O app inteiro está neste repositório sob a [Elastic License 2.0](../LICENSE.md): use, faça fork, modifique, hospede você mesmo para o seu time. A única coisa fora de questão é reempacotar o próprio Superset como um serviço que você vende para terceiros.
