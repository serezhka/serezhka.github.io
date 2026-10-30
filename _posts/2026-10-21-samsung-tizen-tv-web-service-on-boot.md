---
layout: post
title: Samsung Tizen TV — autostart a custom Web Service on boot
date: 2026-10-21
last_modified_at: 2026-10-30
categories: [Hack]
tags: [samsung, tizen, tv, webservice, partner, on-boot]
---

## Goal

Run a **background Web Service** on a consumer Samsung Smart TV so it starts again after a **real power cycle** — without opening the UI app by hand.

This post is about the **platform autostart surface** (Partner cert, `on-boot`, JS process limits). For volatile root, disk paths, UEP, microphone capture, and **owner `systemd --user`** (the reliable native cold-boot path), see the [root / access write-up](/posts/samsung-tizen-tv-archive-root/).

Verified on:

| | |
|--|--|
| Model | **QE65Q70CATXXH** (65″ QLED, 2023) |
| Platform | **Tizen 9.0** |
| Profile | `tv-samsung` |

> Instant On / standby is **not** a reboot. To test boot behaviour, unplug the TV (or use a full restart), then power on again.
{: .prompt-warning }

## Why a plain UI app is not enough

A normal Tizen Web app with `background-support="enable"` can survive Home / hide for a while, but it is still a UI process. For a long-lived background worker Samsung documents a separate **Web Service** packaged with a UI app (`http://tizen.org/feature/web.service`).

Interesting attributes: `on-boot` and `auto-restart`:

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

Package ID limits still apply (package part typically **≤ 10 characters**). Application IDs look like `YourPkg.UI` / `YourPkg.Service`.

Reuse a stable package id for updates — inventing new ids repeatedly can trip pkgmgr / “Load archive info fail” on this TV.

## The catch: Public vs Partner

Putting `on-boot="true"` in XML is **not** enough on a commercial TV.

| Distributor privilege | Service runs when launched | Survives Instant On | Auto-start after cold boot |
|--|--|--|--|
| **Public** | yes | yes | **no** |
| **Partner** (DUID bound) | yes | yes | **yes** |

Partner for **testing** is available with a normal Samsung developer account: distributor certificate privilege **Partner**, TV **DUID** in the cert SAN (`URN:tizen:deviceid=…`). Store publishing is a separate story; DUID-bound sideload is enough for a lab TV.

## Setup outline

### 1. Developer Mode

Apps → `12345` → Developer Mode **On** → PC IPv4 → reboot.

### 2. Connect and read DUID

```shell
sdb connect <tv-host>
sdb devices
sdb -s <tv-host>:26101 capability
```

### 3. Certificates

1. Author certificate (keep stable — updates must reuse the same author).
2. Distributor certificate: privilege **Partner**, device DUID attached.
3. Security profile in Tizen Studio / CLI pointing at those `.p12` files.

If `tizen package` reports **Invalid password** on a fresh `.p12`, re-export with legacy PKCS#12 (3DES / SHA1). Newer OpenSSL defaults (AES-PBES2) often break the Java signer.

### 4. Build / install

```shell
rm -f *.wgt author-signature.xml signature1.xml .manifest.tmp
tizen package -t wgt -s <PartnerProfile> -- <project-dir>
tizen install -n YourApp.wgt -s <tv-host>:26101
```

Do **not** run `tizen run` if you are testing auto-start. With Partner + `on-boot="true"`, the platform should start the service after install/update and again after unplug.

## What the service can (and cannot) do after cold boot

Observed on this QE65Q70C:

| Works | Often fails |
|-------|-------------|
| Service `onStart` after Partner cold boot | `child_process.exec` → `/bin/sh` → **`EACCES`** |
| `execFile` / `spawn` of stock binaries | Relying on `systemctl` (system bus) from WGT |
| `app_launcher -s …` | Reading Smack **`User`** files under `/opt/usr/share/systemd` |
| Read/write under `/opt/usr/home/owner/…` | Assuming unsigned `/opt/.../*.sh` will execute (UEP) |

Practical keeper pattern: keep unit / config copies under **owner home**, use `execFile("systemctl", ["--user", …])` with `XDG_RUNTIME_DIR` / session bus env, and treat the WGT as a **best-effort** watchdog. Durable native workers belong in **owner `systemd --user`** units (see the [root post](/posts/samsung-tizen-tv-archive-root/)).

Avoid ghost / always-visible UI hacks — the panel watchdog can blank the screen after wake.

## How we verified

1. **Public** build: service runs when launched; after unplug — dead until manual launch.
2. **Partner** rebuild + install (no `tizen run`): service starts on its own after install and again after cold boot.
3. `sdb` may stay offline until the TV is fully awake — that does not block `on-boot`; the service starts on-device.

## Notes

- Consumer QLED is not SSSP: no “URL Launcher / Auto Start Application” menu. Autostart here is Web Service + Partner (and/or user-systemd), not a Home-screen autorun toggle.
- `auto-restart="true"` helps after crashes while the package may run; it does **not** replace Partner for boot.
- Developer Mode stays useful for sideload; a Partner-signed installed package still boots the service without `sdb` after cold boot.

## References

- [Root / disk / mic / user-systemd access notes](/posts/samsung-tizen-tv-archive-root/)
- [Tizen — Service application (Web)](https://docs.tizen.org/application/web/guides/applications/service-app/)
- [Samsung — Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Samsung — Privileges FAQ](https://developer.samsung.com/smarttv/develop/faq/privileges.html)
