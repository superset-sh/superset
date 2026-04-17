# Superset Fresh Spawn — Design Document

**Tarih:** 2026-04-17
**Durum:** Draft
**Hedef:** macOS'ta stale Mach bootstrap context sorunu için Superset.sh çözümü — çalışan session'ları öldürmeden.

---

## 1. Problem Statement

### Tek Cümle
macOS'ta uzun-ömürlü `terminal-host` daemon fork ettiğinde, child process daemon'ın **stale bootstrap port**'unu miras alır; sonuç olarak Go binary'leri (`gh`, `terraform`, `kubectl`) TLS doğrulaması yapamaz:

```
tls: failed to verify certificate: x509: OSStatus -26276
```

### Kök Sebep
- Go stdlib `crypto/x509` macOS'ta `Security.framework → trustd` → Mach IPC yolu kullanır
- Bu çağrı process'in bootstrap port'u üzerinden lookup yapar
- Bootstrap port process doğduğunda parent'tan **snapshot olarak miras alınır**; runtime'da değiştirilemez
- `terminal-host` daemon uzun süredir çalışıyorsa (Fast User Switch, sistem crash sonrası) bootstrap port stale olur
- Child'lar stale port'u inherit eder, `trustd`'ye ulaşamaz

### Somut Vaka
[superset-sh/superset#2570](https://github.com/superset-sh/superset/issues/2570)

### Mevcut Çözümler ve Kusurları

| Yaklaşım | Çalışır mı? | Kusur |
|----------|-------------|-------|
| [PR #2571](https://github.com/superset-sh/superset/pull/2571): Her startup'ta daemon restart | ✅ | Çalışan session'ları öldürür (dev server, build) |
| `launchctl bsexec` | ❌ | macOS 10.7'den beri security context'i doğru kopyalamıyor |
| `task_set_special_port` runtime swap | ❌ | Lion+ XPC cache'i kırıyor, deprecated |
| `posix_spawnattr_setspecialport_np` | ✅ (teorik) | Mach port transfer infrastructure'ı çok karmaşık, native C gerekir |

---

## 2. Çözüm: Spawn'ı Electron Main'e Delegate Et

### Anahtar İçgörü

**Electron main process her Superset açılışında yeniden doğar.** Bu demektir ki:
- Her Superset açılışında Electron main **fresh Mach bootstrap context** alır
- Bu context çağdaş, canlı kullanıcı oturumunun kimliğini taşır
- Fresh Electron main'den spawn edilen her child **fresh context inherit eder**

O zaman: pty-subprocess'leri terminal-host yerine Electron main doğursun. Terminal-host sadece sessionları yönetsin, fork yapmasın.

### Mimari

**Önce (stale chain):**
```
terminal-host (STALE ctx)
    ↓ fork/exec
pty-subprocess (STALE ctx inherit)
    ↓ fork
zsh (STALE)
    ↓ exec
gh ❌
```

**Sonra (fresh chain):**
```
Electron main (FRESH ctx — her restart'ta yenilenir)
    ↓ IPC-triggered spawn
pty-subprocess (FRESH ctx ✅)
    │
    │ stdin/stdout FD'leri UDS üzerinden pass edilir
    ▼
terminal-host (STALE ctx — ama fork etmiyor!)
    │
    │ sadece I/O forwarding yapar, ChildProcess referansı tutar
    ▼
zsh (FRESH)
    ↓ exec
gh ✅
```

### Yeni Terminal Akışı

```
1. Kullanıcı "yeni terminal" → Electron renderer
2. Electron renderer → terminal-host "bana session aç"
3. terminal-host → Electron main UDS (spawn-server): "pty-subprocess spawn et"
4. Electron main: fresh child_process.spawn(pty-subprocess.js)
   - Child fresh context alır
5. Electron main: child'ın stdin/stdout/stderr FD'lerini UDS üzerinden SCM_RIGHTS ile terminal-host'a pass eder
6. terminal-host: FD'leri alır, Session class'ına bağlar, I/O akışı başlar
7. Kullanıcıya "session hazır"
```

### Eski Terminal Akışı (Shell Wrapper ile)

Eski session'ların içindeki zsh stale. Onları düzeltemeyiz. Ama zsh'in içindeki **komutları** fresh context'te çalıştırabiliriz.

```
1. Kullanıcı eski terminalde: gh auth login
2. zsh preexec hook devreye girer
3. Hook: gh whitelist'te → komutu yakalar
4. Hook: komutu `fresh-exec gh auth login` ile replace eder
5. fresh-exec → Electron main UDS: "bu komutu fresh ctx'te çalıştır"
6. Electron main: fresh child_process.spawn(gh, [auth, login], { stdio: "pipe" })
   - gh fresh context alır, trustd'ye ulaşır
7. Electron main: gh'nin stdin/stdout/stderr'ını fresh-exec'e UDS üzerinden pipe'lar
8. fresh-exec: kendi TTY'sine (eski terminal) yönlendirir
9. gh çalışır ✅
```

### Neden Çalışır?

**Fork inheritance kritik:** Mach bootstrap port **fork anında snapshot** olarak geçer. Electron main fresh'se, ondan fork edilen her şey fresh. Terminal-host'un stale olması önemli değil — o artık fork etmiyor, sadece FD'ler üzerinden I/O yönetiyor.

**Elektron kapalıyken?** Fallback: terminal-host yine eski stale spawn yapar. Degradation, crash değil.

---

## 3. Bileşenler

### 3.1 Superset Fork — Değişecek Dosyalar

#### 3.1.1 Electron Main: Spawn Server

**Yeni dosya:** `apps/desktop/src/main/fresh-spawn/spawn-server.ts`

Unix Domain Socket server. İki RPC destekler:

1. **`spawn-pty-subprocess`**: pty-subprocess.js'i fresh spawn et, FD'leri client'a pass et
2. **`fresh-exec`**: Arbitrary komut fresh spawn et (shell wrapper tarafından çağrılır)

Socket konumu: `~/.superset/fresh-spawn.sock`
Token-based auth: `~/.superset/fresh-spawn.token`

**Değişim:** `apps/desktop/src/main/index.ts` — startup'ta spawn-server'ı başlat, shutdown'da kapat.

#### 3.1.2 Terminal-Host: Spawn Client

**Yeni dosya:** `apps/desktop/src/main/terminal-host/fresh-spawn-client.ts`

Spawn-server'a bağlanır, FD'ler alır, `net.Socket` + synthetic `ChildProcess` oluşturur (node-pty uyumlu).

**Değişim:** `apps/desktop/src/main/terminal-host/session.ts:268` — `spawnProcess`'i yeni bir `spawnViaFreshClient()` fonksiyonu ile değiştir. Fallback: spawn-client fail ederse eski stale spawn.

#### 3.1.3 Shell Wrapper

**Yeni dosyalar:**
- `apps/desktop/resources/shell-hooks/zsh-fresh-exec.zsh`
- `apps/desktop/resources/shell-hooks/bash-fresh-exec.sh` (v1.1)

**Değişim:** Shell wrapper sistemi (`apps/desktop/src/main/terminal-host/shell-wrappers.ts`) — kullanıcının `.zshrc`'sine source satırı ekler ya da ZDOTDIR pattern'iyle rcfile inject eder.

#### 3.1.4 fresh-exec Helper Binary

**Yeni dosya:** `apps/desktop/src/main/fresh-spawn/fresh-exec.ts`

Küçük Node.js script, Electron main UDS'ine client olarak bağlanır. stdin/stdout/stderr'ı proxy eder.

Build output: `/Applications/Superset.app/Contents/Resources/app.asar.unpacked/bin/fresh-exec`

### 3.2 FD Passing over UDS

Node.js'in built-in IPC (`child.send(msg, handle)`) sadece fork edilmiş child'lar arasında çalışır. Bağımsız process'ler arası FD passing için `SCM_RIGHTS` gerekir.

**Seçenek 1: Mevcut npm package**
- `node-unix-socket` — `sendmsg`/`recvmsg` SCM_RIGHTS desteği var
- `pass-fds` — daha küçük, sadece FD passing
- Risk: Dependency ekler, ama proven

**Seçenek 2: Minimal inline native addon**
- ~50 satır C, sadece 2 fonksiyon: `sendFdsOverUds()`, `recvFdsOverUds()`
- Build node-gyp ile
- Tam kontrol

**Tercih:** Seçenek 1 denenecek (`node-unix-socket`). Çalışmazsa Seçenek 2.

### 3.3 Protocol

UDS mesaj formatı (length-prefixed JSON + FD'ler SCM_RIGHTS ile):

```typescript
// Client → Server
type SpawnRequest =
  | {
      type: "spawn-pty-subprocess";
      token: string;
      env: Record<string, string>;
    }
  | {
      type: "fresh-exec";
      token: string;
      command: string;
      args: string[];
      cwd: string;
      env: Record<string, string>;
      ttyName: string; // e.g., "/dev/ttys003"
    };

// Server → Client
type SpawnResponse = {
  type: "ok";
  pid: number;
  // Accompanied by 3 FDs via SCM_RIGHTS: stdin, stdout, stderr
} | {
  type: "error";
  message: string;
  code: string;
};
```

---

## 4. Failure Modes & Fallbacks

| Senaryo | Davranış |
|---------|----------|
| Non-macOS platform | Spawn-server başlamaz, terminal-host fallback'e düşer (eski davranış) |
| Electron main kapalı, daemon standalone | UDS bağlantısı fail → stale spawn + `console.warn` |
| UDS socket dosyası yok | Timeout (500ms) → stale spawn + warn |
| Token dosyası invalid | Auth fail → stale spawn |
| FD passing exception | Stale spawn + warn + metric log |
| Kullanıcı `~/.zshrc`'sine el yapımı mod yaptı | Source satırı idempotent, ikinci kez eklemez |
| fresh-exec helper binary yok | Whitelist komut normal çalışır (stale) + warn banner |

**Prensip:** Superset hiçbir senaryoda çökmez. En kötü senaryo: mevcut stale davranış.

---

## 5. Test Stratejisi

### Unit Tests
- `spawn-server.test.ts`: Mock UDS client, spawn request → FD yanıtı doğru mu
- `fresh-spawn-client.test.ts`: Mock UDS server, received FD'ler ChildProcess-like obje yaratıyor mu
- `shell-wrappers.test.ts`: ZDOTDIR inject mekanizması temiz mi

### Integration Tests (macOS only)
- Manuel FastUserSwitch simulasyon script: `sudo killall -USR1 launchd` gibi bir proxy
- `launchctl procinfo <pid>` ile bootstrap port namespace kontrolü
- `security list-keychains` fresh child'da OK, stale'de EPERM

### E2E Test (Manual, local Superset build)
```
Setup:
  - Local Superset build+install
  - Terminal 1: "python3 -m http.server 9999" başlat (long-running)
  - Taint the daemon: launchctl kickstart -k system/com.apple.trustd (veya sistem crash simulate)
  - Superset'i kapat-aç
  
Verify:
  1. Terminal 1 hâlâ yaşıyor mu? [python3 server hâlâ hizmet veriyor mu?] → PASS
  2. Terminal 2 (yeni): gh auth status → fresh spawn path → PASS
  3. Terminal 1'de: gh auth status → shell wrapper → fresh-exec → PASS
  4. Fallback: fresh-spawn.sock'u sil, yeni terminal aç, stale spawn'a düşmeli, warn basmalı
```

### CI
- macOS 14 + 15 GitHub Actions runner
- Unit + integration testler
- E2E testler skip (user-interactive, not automatable)

---

## 6. PR Stratejisi

- **PR başlığı:** `fix(desktop): spawn PTY subprocesses via Electron main to avoid stale Mach context on macOS`
- **Approach:** PR #2571'i REPLACE ediyoruz, kapatılmasını öneriyoruz
- **Issue #2570 comment:** Yaklaşımı özetle, link ver
- **PR body:** Problem + PR #2571'in sorunu + yeni yaklaşım + E2E sonuçları + fallback garantileri
- **Commit organization:**
  1. `feat(main): add fresh-spawn UDS server`
  2. `feat(terminal-host): delegate pty-subprocess spawn to Electron main`
  3. `feat(terminal-host): shell wrappers for fresh-exec whitelist`
  4. `feat(fresh-exec): client binary for shell wrapper integration`
  5. `test: e2e fresh-spawn scenarios`
  6. `docs: explain Mach context problem and fresh-spawn architecture`

---

## 7. Open Questions

- [ ] FD passing npm package güvenilir mi? → Spike olarak ilk task'ta test
- [ ] Kullanıcı kendi `.zshrc`'sinde `precmd`/`preexec` kullanıyorsa sıralama sorunu? → Append behavior + test
- [ ] `fresh-exec`'e gönderilen env hangi env olmalı? Eski terminalin mi, fresh process'in mi? → Mix: kullanıcı env'i + fresh bootstrap
- [ ] Whitelist kullanıcı tarafından editlenebilmeli mi? Settings'e eklensin mi? → v1'de hardcode, v1.1'de UI

---

## 8. Kaynaklar

- [posix_spawn(2) - Apple](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/posix_spawn.2.html)
- [Bootstrap Contexts - Apple](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/KernelProgramming/contexts/contexts.html)
- [superset-sh/superset#2570](https://github.com/superset-sh/superset/issues/2570)
- [superset-sh/superset#2571](https://github.com/superset-sh/superset/pull/2571) (replace)
- [mobile-shell/mosh#249](https://github.com/mobile-shell/mosh/issues/249) (benzer problem, mosh'ta çözülmedi)
- [node-unix-socket](https://www.npmjs.com/package/node-unix-socket) — potansiyel FD passing lib
