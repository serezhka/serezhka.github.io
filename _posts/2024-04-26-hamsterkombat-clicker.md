---
layout: post
title: Launch Hamster Kombat in Telegram Web + Auto Click
date: 2024-04-26
categories: [Hack]
tags: [telegram, hamsterkombat]
image:
  path: /assets/img/posts/2024-04-26/hamster.png
---

## Intro

[Hamster Kombat](ttps://hamsterkombat.io/) is a popular clicker game in Telegram.
The problem is that it is not available in Telegram Web, only in the mobile app.
Let's try to launch it in Chrome browser and automate the click process.

## Option 1: Use Resource Override extension

1. Download [Resource Override](https://chromewebstore.google.com/detail/pkoacgokdfckfpndoffpifphamojphii) extension for Chrome browser
2. Add new rule: From https://hamsterkombat.io/js/telegram-web-app.js -> To https://serezhka.github.io/hamsterkombat/js/telegram-web-app.js
3. Launch Telegram Web, open [Hamster Kombat](https://web.telegram.org/k/#@hamster_kombat_bot) game
4. Open Chrome DevTools, go to Console, select javascript context "clicker (hamsterkombat.io)"
5. Copy and paste the following [script](#auto-click-script) to the console and press Enter

## Option 2: Use Chrome Local Overrides

1. Launch Telegram Web, open [Hamster Kombat](https://web.telegram.org/k/#@hamster_kombat_bot) game
2. Open Chrome DevTools, go to Sources, find `telegram-web-app.js` and replace
```javascript
Object.defineProperty(WebApp, 'platform', {
        get: function () {
            return webAppPlatform;
        },
        enumerable: true,
    });
```
with
```javascript
Object.defineProperty(WebApp, 'platform', {
        get: function () {
            return 'ios';
        }, enumerable: true,
    });
```
3. Right click on the file, select "Override content"
![Replace platform](/assets/img/posts/2024-04-26/replace_platform.png){: .shadow width="450" height="450" .normal }
4. Refresh the page, launch the game, go to Console, select javascript context "clicker (hamsterkombat.io)"
5. Copy and paste the following [script](#auto-click-script) to the console and press Enter

## Auto Click script

```javascript
(function () {
    const evt1 = new PointerEvent('pointerdown', {clientX: 150, clientY: 300});
    const evt2 = new PointerEvent('pointerup', {clientX: 150, clientY: 300});
    setInterval((function fn() {
        const energy = parseInt(document.getElementsByClassName("user-tap-energy")[0].getElementsByTagName("p")[0].textContent.split(" / ")[0]);
        if (energy > 25) {
            document.getElementsByClassName('user-tap-button')[0].dispatchEvent(evt1);
            document.getElementsByClassName('user-tap-button')[0].dispatchEvent(evt2);
        }
        return fn;
    })(), 50);
})();
```

## Enjoy

![Enjoy](/assets/img/posts/2024-04-26/proof.gif){: .shadow width="450" height="450" .normal }