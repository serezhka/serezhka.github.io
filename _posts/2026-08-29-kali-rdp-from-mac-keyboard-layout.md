---
layout: post
title: RDP to Kali Linux from Mac with US/RU keyboard layout
date: 2026-08-29
categories: [Kali]
tags: [kali, mac, rdp, keyboard]
---

## Stack

| Side | Software |
|------|----------|
| Kali | **xrdp** + **XFCE** |
| Mac | [**Windows App**](https://apps.apple.com/app/windows-app/id1295203466) (formerly Microsoft Remote Desktop) |

RDP gives a **separate desktop session**, not a mirror of the laptop screen. Port **3389**.

## Kali — xrdp + XFCE

```shell
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  xrdp xorgxrdp dbus-x11 xfce4-session

echo "xfce4-session" > ~/.xsession
chmod +x ~/.xsession
sudo adduser "$USER" ssl-cert
sudo systemctl enable --now xrdp xrdp-sesman
ss -tlnp | grep 3389
```

Black screen after login is a common xrdp + XFCE issue. Fix `/etc/xrdp/startwm.sh`:

```shell
sudo tee /etc/xrdp/startwm.sh > /dev/null << 'EOF'
#!/bin/sh
if test -r /etc/profile; then . /etc/profile; fi
if test -r ~/.profile; then . ~/.profile; fi
unset DBUS_SESSION_BUS_ADDRESS
unset XDG_RUNTIME_DIR
$HOME/bin/apply-kbd >/dev/null 2>&1 || true
if test -r ~/.xprofile; then . ~/.xprofile; fi
systemctl --user start kbd-watchdog.service >/dev/null 2>&1 || true
exec startxfce4
EOF
sudo chmod 755 /etc/xrdp/startwm.sh
sudo systemctl restart xrdp xrdp-sesman
```

> Do not paste `startwm.sh` over SSH with nested heredocs — the file can get corrupted. Write locally, `scp` to Kali, then `sudo cp`.
{: .prompt-info }

## Mac — Windows App

1. Add PC → Kali IP (e.g. `192.168.0.208`)
2. User / password
3. **PC → Connections → Keyboard Mode → Scancode** (not Unicode)

Keep **Mac input source = English (U.S./ABC)**. Switch **US/RU inside Kali**, not on Mac.

> **Unicode** keyboard mode breaks Cyrillic over RDP — keys stop working when Mac layout is Russian.
{: .prompt-warning }

## Kali — US/RU layouts

xrdp resets keyboard to `us` on connect/reconnect. Three layers fix this:

### 1. xrdp keyboard map

```shell
sudo sed -i 's/^rdp_layout_us=us$/rdp_layout_us=us,ru/' /etc/xrdp/xrdp_keyboard.ini
```

### 2. Reconnect hook — `/etc/xrdp/reconnectwm.sh`

```shell
sudo tee /etc/xrdp/reconnectwm.sh > /dev/null << 'EOF'
#!/bin/sh
$HOME/bin/apply-kbd >/dev/null 2>&1 || true
( for i in 1 2 3 4 5 6 7 8 9 10; do $HOME/bin/apply-kbd >/dev/null 2>&1; sleep 1; done ) &
systemctl --user start kbd-watchdog.service >/dev/null 2>&1 || true
EOF
sudo chmod 755 /etc/xrdp/reconnectwm.sh
```

### 3. Scripts in `~/bin`

`apply-kbd` — re-applies `us,ru` and Caps→F20 remap:

```shell
mkdir -p ~/bin ~/.config/systemd/user ~/.config/autostart

cat > ~/bin/apply-kbd << 'EOF'
#!/bin/bash
export DISPLAY="${DISPLAY:-:10.0}"
[ -f "$HOME/.Xauthority" ] && export XAUTHORITY="$HOME/.Xauthority"
[ -S /tmp/.X11-unix/X10 ] && export DISPLAY=:10.0

command -v setxkbmap >/dev/null || exit 0
setxkbmap -option 2>/dev/null || true
setxkbmap -layout us,ru -variant , -option grp:alt_shift_toggle,grp_led:scroll
[ -f "$HOME/.Xmodmap" ] && xmodmap "$HOME/.Xmodmap" || xmodmap -e 'keycode 66 = F20 F20 F20 F20'

if command -v xfconf-query >/dev/null; then
  xfconf-query -c keyboard-layout -p /Default/XkbLayout -n -t string -s "us,ru"
  xfconf-query -c keyboard-layout -p /Default/XkbOptions/Group -n -t string -s "grp:alt_shift_toggle,grp_led:scroll"
fi
EOF
chmod +x ~/bin/apply-kbd
```

`toggle-kbd-layout` — toggles layout group via XKB (reliable over RDP):

```shell
cat > ~/bin/toggle-kbd-layout << 'EOF'
#!/usr/bin/env python3
import ctypes, ctypes.util, os, sys, subprocess
subprocess.run([os.path.expanduser("~/bin/apply-kbd")], check=False)
os.environ.setdefault("DISPLAY", ":10.0")
os.environ.setdefault("XAUTHORITY", os.path.expanduser("~/.Xauthority"))
x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
x11.XOpenDisplay.restype = ctypes.c_void_p
dpy = x11.XOpenDisplay(None)
if not dpy: sys.exit(1)
class S(ctypes.Structure):
    _fields_ = [("group", ctypes.c_ubyte)] + [("x", ctypes.c_ubyte)] * 13 + [("y", ctypes.c_ushort)]
st = S()
x11.XkbGetState(dpy, 0x0100, ctypes.byref(st))
x11.XkbLockGroup(dpy, 0x0100, 0 if st.group else 1)
x11.XFlush(dpy)
EOF
chmod +x ~/bin/toggle-kbd-layout
```

Caps Lock remap + XFCE shortcuts:

```shell
cat > ~/.Xmodmap << 'EOF'
keycode 66 = F20 F20 F20 F20
EOF

export DISPLAY=:10.0
xfconf-query -c xfce4-keyboard-shortcuts -p /commands/custom/override -n -t bool -s true
xfconf-query -c xfce4-keyboard-shortcuts -n -t string \
  -p /commands/custom/F20 -s "$HOME/bin/toggle-kbd-layout"
xfconf-query -c xfce4-keyboard-shortcuts -n -t string \
  -p "/commands/custom/<Super>space" -s "$HOME/bin/toggle-kbd-layout"
```

Watchdog — keeps layout alive after xrdp overwrites it:

```shell
cat > ~/bin/kbd-watchdog << 'EOF'
#!/bin/bash
for i in $(seq 1 60); do [ -S /tmp/.X11-unix/X10 ] && break; sleep 1; done
for i in $(seq 1 60); do ~/bin/apply-kbd; sleep 2; done
while true; do
  export DISPLAY=:10.0; export XAUTHORITY=$HOME/.Xauthority
  cur=$(setxkbmap -query 2>/dev/null | awk '/^layout:/ {print $2}')
  case "$cur" in *ru*) ;; *) ~/bin/apply-kbd ;; esac
  sleep 5
done
EOF
chmod +x ~/bin/kbd-watchdog

cat > ~/.config/systemd/user/kbd-watchdog.service << 'EOF'
[Unit]
Description=Keep US/RU keyboard layouts alive under XRDP
After=graphical-session.target

[Service]
Type=simple
ExecStart=%h/bin/kbd-watchdog
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
EOF

sudo loginctl enable-linger "$USER"
systemctl --user enable --now kbd-watchdog.service
~/bin/apply-kbd
```

**Fallback toggles on Kali:** Caps Lock · **Cmd+Space** (Super+Space) · **Alt+Shift** · click **US/RU** on panel.

After reconnect wait 1–2 seconds for watchdog, then toggle.

## Mac — Globe key (🌐)

Globe is consumed by macOS before RDP sees it. Virtual **F20 does not traverse RDP** reliably either.

Working approach: **Hammerspoon** intercepts Globe only when **Windows App** is focused and runs `ssh kali toggle-kbd-layout`. Everywhere else Globe switches Mac input as usual.

Mac settings: **Keyboard → Press 🌐 key to → Change Input Source**

SSH config on Mac:

```
Host kali
    HostName 192.168.0.208
    User srzhka
    IdentityFile ~/.ssh/id_kali
```

Test:

```shell
ssh kali ~/bin/toggle-kbd-layout
```

Install Hammerspoon + config (one-shot script):

```shell
curl -sL -o /tmp/Hammerspoon.zip \
  https://github.com/Hammerspoon/hammerspoon/releases/download/1.1.1/Hammerspoon-1.1.1.zip
unzip -qo /tmp/Hammerspoon.zip -d ~/Applications
mkdir -p ~/.hammerspoon
# copy hammerspoon-globe-rdp.lua → ~/.hammerspoon/init.lua
open ~/Applications/Hammerspoon.app
```

Grant **Accessibility** to Hammerspoon in System Settings.

Core logic:

```lua
-- When Windows App focused: ssh kali toggle-kbd-layout
-- Elsewhere: Globe passes through → normal Mac input switch
local RDP_BUNDLE = "com.microsoft.rdc.macos"

globeRdpTap = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(event)
  if not GLOBE_CODES[event:getKeyCode()] then return false end
  if not rdpFocused() then return false end
  hs.task.new("/usr/bin/ssh", nil, {"-F", os.getenv("HOME").."/.ssh/config",
    "-o", "BatchMode=yes", "kali", "/home/srzhka/bin/toggle-kbd-layout"}):start()
  return true
end)
globeRdpTap:start()
hs.autoLaunch(true)
```

> Store `globeRdpTap` in a global variable — otherwise Lua GC stops the eventtap.
{: .prompt-info }

## Gotchas

| Problem | Fix |
|---------|-----|
| Cyrillic broken / keys dead | Keyboard mode **Scancode**, Mac layout **English** |
| Layout `us` only after connect | `xrdp_keyboard.ini`, `reconnectwm.sh`, watchdog |
| **Ctrl+Space** eaten by client | Use Caps / Super+Space / Globe |
| **Alt+Shift** unreliable over RDP | Use `toggle-kbd-layout` script |
| Duplicate xkb panel plugins | Keep one xkb plugin in XFCE panel (`Unique=TRUE`) |
| Globe does nothing in RDP | Hammerspoon + SSH toggle, not F20-over-RDP |
| `startwm.sh` corrupted | Write file locally, `scp`, `sudo cp` |
