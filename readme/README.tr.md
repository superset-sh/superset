<div align="center">

<img width="full" alt="Claude ve OpenCode, canlı farklarla paralel Superset çalışma alanlarında çalışıyor" src="../apps/marketing/public/images/readme-hero.gif" />

### 100'den Fazla Kodlama Ajanını Paralel Çalıştırın

<details>
<summary>🌐 Diğer dillerde oku</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Bu, İngilizce README'nin çevirisidir; esas sürüm İngilizce olandır.*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex veya herhangi bir CLI ajanı — her biri kendi izole worktree'sinde.<br />
Zamanınızı beklemeye değil, ürün çıkarmaya ayırın.

<br />

[**macOS için indirin**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Belgeler](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Bağlam Değiştirme Maliyeti Olmadan 10 Kat Hızlı Kod Yazın

Superset, CLI tabanlı kodlama ajanlarını izole git worktree'lerinde paralel çalıştırır; yerleşik terminal, inceleme ve editörde açma iş akışlarıyla birlikte gelir.

- **Birden fazla ajanı aynı anda çalıştırın** — bağlam değiştirme yükü olmadan
- **Her görevi kendi git worktree'sinde izole edin** — ajanlar birbirine karışmaz
- **Tüm ajanlarınızı tek yerden izleyin** ve ilgi gerektirdiklerinde bildirim alın
- **Değişiklikleri hızlıca inceleyip düzenleyin** — yerleşik fark görüntüleyici ve editörle
- **Herhangi bir çalışma alanını ihtiyacınız olan yerde açın** — tek tıkla editörünüze veya terminalinize devredin
- **Çalışma alanlarınıza her yerden erişin** — uzak ana bilgisayarlar, CLI, SDK veya MCP üzerinden

Daha az bekleyin, daha çok ürün çıkarın.

## Özellikler

<table>
<tr>
<td width="50%" valign="middle">

### Paralel Çalışma Alanları

Aynı anda 100'den fazla kodlama ajanı çalıştırın; her biri kendi dalı, terminali ve ortamıyla kendi git worktree'sinde. Sonuçları karşılaştırın ve kazananı merge edin.

[Belgeler →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Diğer ajanlar paralel çalışma alanlarında çalışırken Claude bir faturalama migrasyonunu akış halinde yazıyor" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Ajan İzleme

Her ajanı kenar çubuğundan takip edin: çalışma göstergeleri, tamamlanma sesleri ve bir ajan ilginizi gerektirdiğinde dock rozetleri.

[Belgeler →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Bir ajan görevini bitiriyor ve kenar çubuğundaki durum çalışıyordan tamamlandıya geçiyor" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Yerleşik Terminal

Sekmeler, sınırsız bölmeler, ön ayarlar ve yeniden başlatmalara dayanan kalıcı oturumlar. Çok satırlı düzenleme ve @-dosya bahisleri içeren zengin istem editörü için ⌘I tuşlarına basın.

[Belgeler →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Bölünmüş bir terminalin yanında, zengin istem editöründe @-dosya bahsiyle bir devam mesajı yazılıyor" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Yerleşik Fark Görüntüleyici

Ajan değişikliklerini uygulamadan çıkmadan inceleyin, yorumlayın ve düzenleyin; hazır olduğunda commit ve push yapın.

[Belgeler →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Bir ajanın değişiklikleri fark görüntüleyicide inceleniyor" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Uygulama İçi Tarayıcı ve Portlar

Çalışan geliştirme sunucularını bir tarayıcı bölmesinde önizleyin. Portlar çalışma alanı başına algılanır, böylece her worktree kendi önizlemesine sahip olur.

[Belgeler →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Uygulama içi tarayıcı, algılanan portlarla bir geliştirme sunucusunu önizliyor" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Otomasyonlar

Ajan oturumlarını zamanlamayla çalıştırın: geceleri issue triyajı yapın, haftalık changelog taslağını hazırlayın, bağımlılıkları güncel tutun.

[Belgeler →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Zamanlanmış ajan otomasyonları" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Uzaktan Erişim

Başka bir makineyi bağlayın ve çalışma alanlarına her yerden erişin: masaüstü uygulaması, CLI veya telefonunuz. Çevrimdışı ana bilgisayarları özel bir komutla uyandırın.

[Belgeler →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Organizasyon ayarlarında ana bilgisayarlar ve üyeler" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

Herhangi bir kabuktan betikleyin: tek bir ikili dosyayla çalışma alanları oluşturun, ajanlar başlatın, terminallerini okuyun ve otomasyonları yönetin. Bir ajan komut çalıştırabiliyorsa Superset'i de yönetebilir.

[Belgeler →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Superset CLI ile bir çalışma alanı oluşturuluyor ve bir ajan başlatılıyor" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Komut Paleti

Tek bir arama kutusundan herhangi bir çalışma alanına, eyleme veya ayara atlayın.

[Belgeler →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Komut paletine yazılıyor ve çalışma alanı eylemleri canlı filtreleniyor" width="100%" /></a>
</td>
</tr>
</table>

**Kutudan çıkanlar:**

- **[Yerleşik beceriler](https://docs.superset.sh/skills)**: ajanlar `superset:*` becerileriyle önceden yüklü gelir (paralel ajanları orkestre etme, otomasyon zamanlama, geri bildirim gönderme, sorun teşhisi) ve başlatmada otomatik sağlanır
- **[Model seçici ve özel ajanlar](https://docs.superset.sh/agent-integration)**: başlatmada model ve akıl yürütme seviyesi seçin, kendi simgesiyle herhangi bir terminal ajanı ekleyin
- **[Çalışma alanı kurulum betikleri](https://docs.superset.sh/setup-teardown-scripts)**: ortam kurulumunu, bağımlılık yüklemelerini ve geliştirme sunucularını çalışma alanı başına otomatikleştirin
- **[Terminal ön ayarları](https://docs.superset.sh/terminal-presets)**: ajan ve kabuk düzenlerini kaydedin, tek tuşla açın
- **[Slack ve Linear](https://docs.superset.sh/use-with-linear)**: Slack mesajlarından veya Linear issue'larından çalışma alanları oluşturun
- **[IDE'nizde açın](https://docs.superset.sh/use-with-ide)**: tek tıkla Cursor'a, VS Code'a veya herhangi bir editöre devredin
- **[Özel temalar](https://docs.superset.sh/custom-themes)**: tema dosyaları oluşturun, düzenleyin ve içe aktarın
- **[Klavye kısayolları](https://docs.superset.sh/keyboard-shortcuts)**: her eylem **Ayarlar → Klavye kısayolları** (⌘/) üzerinden yeniden atanabilir
- **[Kendi sağlayıcılarınızı getirin](https://docs.superset.sh/providers)**: OpenRouter, Bedrock, Vertex veya Vercel AI Gateway bağlayın
- **Ve çok daha fazlası**: her gün yeni sürüm çıkarıyoruz, bu yüzden bu liste hep geride kalıyor. Gerçek özellik listesi [changelog](https://superset.sh/changelog) sayfasıdır.

## Desteklenen Ajanlar

Superset, aşağıdakiler dahil CLI tabanlı her kodlama ajanıyla çalışır:

| Ajan | Durum |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Tam destek |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Tam destek |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Tam destek |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Tam destek |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Tam destek |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Tam destek |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Tam destek |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Tam destek |
| Başka herhangi bir CLI ajanı | Yapılandırma gerektirmeden çalışır |

Bir terminalde çalışıyorsa Superset üzerinde de çalışır

Ajanlar bir terminalden fazlasını elde eder:

- **Model seçici**: bir ajanı başlatırken model ve akıl yürütme seviyesi seçin
- **Ajan başına ayarlar**: Ayarlar → Ajanlar altında başlatma komutlarını, istem şablonlarını ve model geçersiz kılmalarını ayarlayın
- **Özel ajanlar**: kendi simgesiyle herhangi bir terminal ajanı ekleyin; yerleşik bir ajan gibi çalışır
- **Durum ve bildirimler**: çalışma göstergeleri, tamamlanma sesleri ve bir ajan sizi beklediğinde dock rozetleri
- **Yerleşik sohbet**: bir sohbet bölmesinde modellerle konuşun; satır içi araç onayları ve plan incelemesiyle

## Bir Masaüstü Uygulamasından Fazlası

Her yüzey aynı çalışma alanlarıyla konuşur; bir görevi uygulamada başlatıp her yerden kontrol edebilirsiniz.

| Yüzey | Ne elde edersiniz |
|:--------|:-------------|
| [**Masaüstü Uygulaması**](https://github.com/superset-sh/superset/releases/latest) | Eksiksiz IDE: terminaller, fark görüntüleyici, uygulama içi tarayıcı, otomasyonlar |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | Herhangi bir kabuktan çalışma alanlarını, ajanları, terminalleri ve ana bilgisayarları yönetmek için tek bir `superset` ikili dosyası |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | Node, Bun veya Deno üzerinden [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) ile Superset'i programatik olarak yönetin |
| [**MCP Sunucusu**](https://docs.superset.sh/mcp) | Claude Code, Codex, Cursor ve diğer ajanların çalışma alanlarını kendilerinin oluşturup yönetmesine izin verin |

CLI, masaüstü uygulamasıyla birlikte gelir; tek başına da kurabilirsiniz:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

Ajanlarınızı telefonunuzdan kontrol edebilmeniz için bir iOS uygulaması da yakında geliyor.

## Kurulum

Masaüstü uygulamasını indirin:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage) (deneysel; birincil hedef macOS)
- **Windows**: henüz mevcut değil
- [Tüm derlemeler](https://github.com/superset-sh/superset/releases/latest)

Kurulu olması gereken tek şey [Git](https://git-scm.com/). [gh](https://cli.github.com/) isteğe bağlıdır ve PR iş akışlarının kilidini açar; Superset sizin için kurmayı önerir.

## Geliştirme

Superset üzerinde çalışmak veya bir PR ile katkıda bulunmak mı istiyorsunuz? Depoyu klonlayın,
kurulu Superset uygulamasına ekleyin ve değişikliğiniz için bir çalışma alanı oluşturun:

```bash
git clone https://github.com/superset-sh/superset.git
```

Ardından o çalışma alanı terminalinden geliştirme kurulumunu çalıştırın:

```bash
./.superset/setup.local.sh
bun run dev
```

`setup.local.sh` betiğini her yeni worktree'de bir kez çalıştırın. Betik, çalışma alanına özgü
uygulama kimliğini ve portları yapılandırır; böylece geliştirme masaüstü uygulaması, kurulu
Superset uygulaması ve diğer geliştirme worktree'leriyle yan yana çalışabilir.

Neon hesabı veya üçüncü taraf kimlik bilgileri gerekmez. `setup.local.sh`, Docker üzerinden
yerel bir Postgres + Electric yığını başlatır ve bir geliştirme hesabı oluşturur.
**"Sign in as dev"** düğmesiyle (veya `admin@local.test` / `supersetdev`) oturum açın.

Önkoşullar: [Bun](https://bun.sh/) v1.3.14+ (`.bun-version` dosyasında sabitlenmiştir), `docker`, `jq` ve `bun dev` komutunun yerel HTTPS proxy'si olarak çalıştırdığı `caddy` (`brew install jq caddy && caddy trust`).

Tam kılavuz için [**DEVELOPMENT.md**](../DEVELOPMENT.md) dosyasına bakın: kurulum betiğinin ne yaptığı, gerçek servislerle manuel kurulum, yaygın komutlar, sorun giderme ve masaüstü uygulamasının nasıl derleneceği. Katkı süreci [**CONTRIBUTING.md**](../CONTRIBUTING.md) dosyasındadır.

## Yapılandırma

Çalışma alanı kurulum, kaldırma ve çalıştırma betiklerini `.superset/config.json` dosyasında yapılandırın. [Tam belgelere](https://docs.superset.sh/setup-teardown-scripts) bakın.

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

Klavye kısayolları **Ayarlar → Klavye kısayolları** (⌘/) üzerinden özelleştirilebilir; [tam kısayol listesine](https://docs.superset.sh/keyboard-shortcuts) bakın.

## Teknoloji Yığını

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

## Varsayılan Olarak Gizli

- **Source Available**: kaynak kodun tamamı Elastic License 2.0 (ELv2) altında GitHub'dadır.
- **Açık Bağlantılar**: hangi ajanları, sağlayıcıları ve entegrasyonları bağlayacağınızı siz seçersiniz.

## Katkıda Bulunma

Katkılarınızı bekliyoruz! Kurulum ve PR açma adımları için [CONTRIBUTING.md](../CONTRIBUTING.md) dosyasına bakın. Hatalar ve özellik istekleri [issues](https://github.com/superset-sh/superset/issues) sayfasına gider.

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Topluluk

Yardım almak, geri bildirim paylaşmak ve diğer kullanıcılarla bağlantı kurmak için Superset topluluğuna katılın:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: ekiple ve toplulukla sohbet edin
- **[Twitter](https://x.com/superset_sh)**: güncellemeler ve duyurular için takip edin
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: hata bildirin ve özellik isteyin
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: soru sorun ve fikirlerinizi paylaşın

### Ekip

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Lisans ve Sonsuza Kadar Ücretsiz Olanlar

**Masaüstü uygulaması sonsuza kadar ücretsizdir.** Kendi makinenizde ajanları paralel çalıştırmak hiçbir zaman ödeme gerektirmeyecek. Ücretlendireceğimiz her şey, bunun üzerine isteğe bağlı bir hizmet olacak.

Uygulamanın tamamı bu depoda [Elastic License 2.0](../LICENSE.md) altındadır: kullanın, fork edin, değiştirin, ekibiniz için kendiniz barındırın. Tek yasak, Superset'in kendisini başkalarına sattığınız bir hizmet olarak yeniden paketlemektir.
