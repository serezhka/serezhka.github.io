---
layout: post
title: Samsung Tizen TV — autostart a custom Web Service on boot
date: 2026-10-21
last_modified_at: 2026-10-21
categories: [Hack]
tags: [samsung, tizen, tv, webservice, telegram]
---

## Goal

Run a **background Web Service** on a consumer Samsung Smart TV so it starts again after a real power cycle — without opening the UI app by hand.

Concrete demo that worked end-to-end: a **Telegram echo bot** living inside the TV Web Service (long-poll `getUpdates`, reply with the same text). After cold boot the bot comes back by itself and keeps echoing.

Verified on:

| | |
|--|--|
| Model | **QE65Q70CATXXH** (65″ QLED, 2023) |
| Platform | **Tizen 9.0** (`platform_version` / `platform_build_version` via `sdb capability`) |
| Profile | `tv-samsung` |

> Instant On / standby is **not** a reboot. The service can keep running while the panel is off. To test boot behaviour, unplug the TV (or use a full restart), then power on again.
{: .prompt-warning }

## Why a plain UI app is not enough

A normal Tizen Web app with `background-support="enable"` can survive Home / hide for a while, but it is still a UI process. For a long-lived background worker Samsung documents a separate **Web Service** packaged together with a UI app (`http://tizen.org/feature/web.service`).

The service is declared in `config.xml`. The interesting attributes are `on-boot` and `auto-restart`:

```xml
<tizen:feature name="http://tizen.org/feature/web.service"/>

<tizen:privilege name="http://tizen.org/privilege/internet"/>
<tizen:privilege name="http://tizen.org/privilege/application.launch"/>
<access origin="*" subdomains="true"/>

<tizen:service id="YourPkg.Service" auto-restart="true" on-boot="true" type="ui">
  <tizen:content src="service/service.js"/>
  <tizen:name>TgEcho</tizen:name>
  <tizen:description>Telegram echo bot</tizen:description>
  <tizen:icon src="icon.png"/>
  <tizen:category name="http://tizen.org/category/service"/>
</tizen:service>
```

Package ID must stay within Tizen limits (typically **10 characters** for the package part). Application IDs look like `YourPkg.UI` / `YourPkg.Service`.

UI side can start the service once (lab convenience) via classic `tizen.application.launch` or modern `import("wrt:service")` → `startService(id)`. With Partner + `on-boot`, you should not need that after reboot.

## Example: Telegram echo bot in the service

The Web Service on this TV is a Node-like JS runtime (`require("https")` works). The bot does not need a public webhook URL — it **long-polls** Bot API from the TV:

1. `getUpdates?timeout=25&offset=…`
2. for each text message → `sendMessage` with the **same** `text`
3. advance `offset` and poll again

Sketch of `service/service.js`:

```javascript
var BOT_TOKEN = "<your-bot-token>";
var TG = "/bot" + BOT_TOKEN;
var offset = 0;
var running = false;

function httpsJson(method, path, bodyObj, cb) {
  var https = require("https");
  var body = bodyObj ? JSON.stringify(bodyObj) : null;
  var opts = {
    hostname: "api.telegram.org",
    port: 443,
    path: path,
    method: method,
    headers: { Accept: "application/json" }
  };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.headers["Content-Length"] = Buffer.byteLength(body);
  }
  var req = https.request(opts, function (res) {
    var chunks = [];
    res.on("data", function (c) { chunks.push(c); });
    res.on("end", function () {
      try { cb(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { cb(e); }
    });
  });
  req.on("error", cb);
  if (body) req.write(body);
  req.end();
}

function echo(chatId, text) {
  httpsJson("POST", TG + "/sendMessage", { chat_id: chatId, text: text }, function () {});
}

function poll() {
  if (!running) return;
  var path = TG + "/getUpdates?timeout=25&offset=" + offset +
    "&allowed_updates=" + encodeURIComponent('["message"]');
  httpsJson("GET", path, null, function (err, data) {
    if (!running) return;
    if (err || !data || !data.ok) {
      setTimeout(poll, 3000);
      return;
    }
    (data.result || []).forEach(function (u) {
      if (typeof u.update_id === "number" && u.update_id >= offset) {
        offset = u.update_id + 1;
      }
      var msg = u.message;
      if (msg && msg.chat && typeof msg.text === "string") {
        echo(msg.chat.id, msg.text);
      }
    });
    setTimeout(poll, 50);
  });
}

module.exports = {
  onStart: function () {
    running = true;
    // skip backlog accumulated while the TV was off
    httpsJson("GET", TG + "/getUpdates?timeout=0&offset=-1", null, function (err, data) {
      if (!err && data && data.ok && data.result && data.result.length) {
        var last = data.result[data.result.length - 1];
        offset = last.update_id + 1;
      }
      poll();
    });
  },
  onStop: function () { running = false; },
  onRequest: function () {}
};
```

Create the bot with [@BotFather](https://t.me/BotFather), put the token in the service (or load it from a local config you do not publish). Open a chat with the bot, send any text — it should come back unchanged while the service is running.

> Do not commit real bot tokens to a public repo. Treat the token like a password; revoke/regenerate in BotFather if it leaks.
{: .prompt-danger }

## The catch: Public vs Partner certificate

Putting `on-boot="true"` in XML is **not** enough on a commercial TV.

Official Tizen / Samsung docs: system launch of a TV Web Service via `on-boot` requires a **partner-level** distributor certificate. With a **Public** Samsung distributor cert the service still installs and runs when you launch it, but after a cold boot it stays dead — and the Telegram bot stays silent until you start the package again.

What we observed on this QE65Q70C:

| Distributor privilege | Service runs when launched | Survives standby (Instant On) | Auto-start after cold boot / after install |
|--|--|--|--|
| **Public** | yes | yes | **no** |
| **Partner** (DUID bound) | yes | yes | **yes** |

Partner for **testing** is available to a normal Samsung developer account: create a distributor certificate with privilege **Partner** and add the TV **DUID**. Publishing Partner APIs to the Store is a separate Seller Office story; sideload for your own DUID is enough for a lab TV.

## Setup outline

### 1. Developer Mode on the TV

Apps → type `12345` → Developer Mode **On** → enter the PC IP that will run Tizen Studio / `sdb` → reboot. After reboot, “Develop Mode” should show on the Apps screen.

### 2. Connect and read DUID

```shell
sdb connect <tv-host>
sdb devices
sdb -s <tv-host>:26101 capability
```

DUID is also shown under the TV’s device / support info. The same value must be listed on the distributor certificate (SAN `URN:tizen:deviceid=…`).

### 3. Certificates

In Certificate Manager (Samsung → TV):

1. Author certificate (keep it stable — updates must reuse the same author).
2. Distributor certificate with privilege **Partner**, device DUID attached.

CLI packaging uses a security profile that points at those `.p12` files. If `tizen package` reports **Invalid password** on a freshly generated `.p12`, re-export it with legacy PKCS#12 (3DES / SHA1). Newer OpenSSL/Python defaults (AES-PBES2) often break Tizen Studio’s Java signer.

### 4. Build / install

```shell
tizen package -t wgt -s <PartnerProfile> -- <project-dir>
tizen install -n YourApp.wgt -s <tv-host>:26101
```

Do **not** run `tizen run` if you are testing auto-start.

With Partner + `on-boot="true"`, the platform should start the service:

- right after install / update;
- again after a real reboot (unplug / full power cycle).

Then message the bot: if echo works with no UI on screen, the service is alive.

## How we verified

1. **Public** build: service heartbeats while running; after unplug — no new activity until a manual launch.
2. **Partner** rebuild + install (no `tizen run`): service started on its own; Telegram `getUpdates` offset advanced (HTTPS from the TV to `api.telegram.org` OK).
3. Echo: send text to the bot → same text comes back.
4. Cold boot (no PC-side launcher): TV back in standby; service `onStart` again; echo works without opening the app.

`sdb` may stay offline until the TV is fully awake; that does not block `on-boot` — the service starts on the device itself.

## Notes

- Consumer QLED is not SSSP digital signage: there is no “URL Launcher / Auto Start Application” menu like on commercial displays. Autostart here is the Web Service + Partner path, not a Home-screen autorun hack.
- Soft power (remote) only toggles standby when Instant On is enabled — useless as an `on-boot` test.
- `auto-restart="true"` helps after crashes while the package is allowed to run; it does not replace Partner for boot.
- Keep Developer Mode on for sideload; for day-to-day use the installed Partner-signed package still boots the service without `sdb`.
- Syncing `offset` with `getUpdates&offset=-1` on start avoids replaying the whole backlog after a long power-off.

## References

- [Tizen — Service application (Web)](https://docs.tizen.org/application/web/guides/applications/service-app/)
- [Samsung — Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Samsung — Privileges FAQ](https://developer.samsung.com/smarttv/develop/faq/privileges.html) (Partner for testing = Partner distributor + DUID)
- [Telegram Bot API](https://core.telegram.org/bots/api)
