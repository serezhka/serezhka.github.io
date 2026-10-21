---
layout: post
title: RDP to Kali Linux from Mac with US/RU keyboard layout
date: 2026-08-29
last_modified_at: 2026-09-01
categories: [Kali]
tags: [kali, mac, rdp, keyboard, smb]
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

Black screen after login is a common xrdp + XFCE issue. Fix `/etc/xrdp/startwm.sh` (final version with shared D-Bus, audio, keyboard):

```shell
sudo tee /etc/xrdp/startwm.sh > /dev/null << 'EOF'
#!/bin/sh
if test -r /etc/profile; then . /etc/profile; fi
if test -r ~/.profile; then . ~/.profile; fi
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
export XDG_RUNTIME_DIR=/run/user/1000
export PIPEWIRE_RUNTIME_DIR=/run/user/1000
export PULSE_RUNTIME_PATH=/run/user/1000/pulse
export PULSE_SERVER=unix:/run/user/1000/pulse/native
$HOME/bin/apply-kbd >/dev/null 2>&1 || true
if test -r ~/.xprofile; then . ~/.xprofile; fi
systemctl --user start pipewire pipewire-pulse wireplumber >/dev/null 2>&1 || true
systemctl --user start kbd-watchdog.service >/dev/null 2>&1 || true
( sleep 4; /usr/libexec/pipewire-module-xrdp/load_pw_modules.sh; sleep 2; $HOME/bin/apply-kbd ) >/tmp/xrdp-audio.log 2>&1 &
exec startxfce4
EOF
sudo chmod 755 /etc/xrdp/startwm.sh
sudo systemctl restart xrdp xrdp-sesman
```

One-shot: `~/Documents/projects/kali/scripts/setup-kali-rdp-audio.sh` (installs packages + writes this file).

> Do not paste `startwm.sh` over SSH with nested heredocs — the file can get corrupted. Write locally, `scp` to Kali, then `sudo cp`.
{: .prompt-info }

> Replace `1000` with your UID (`id -u`) if different.
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
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
export XDG_RUNTIME_DIR=/run/user/1000
export PIPEWIRE_RUNTIME_DIR=/run/user/1000
export PULSE_RUNTIME_PATH=/run/user/1000/pulse
export PULSE_SERVER=unix:/run/user/1000/pulse/native
$HOME/bin/apply-kbd >/dev/null 2>&1 || true
( for i in 1 2 3 4 5 6 7 8 9 10; do $HOME/bin/apply-kbd >/dev/null 2>&1; sleep 1; done ) &
systemctl --user start kbd-watchdog.service >/dev/null 2>&1 || true
( sleep 5; /usr/libexec/pipewire-module-xrdp/load_pw_modules.sh; sleep 2; $HOME/bin/apply-kbd ) >/tmp/xrdp-audio.log 2>&1 &
EOF
sudo chmod 755 /etc/xrdp/reconnectwm.sh
```

### 3. Scripts in `~/bin`

`apply-kbd` — re-applies `us,ru`, keeps Shift working, Caps→F20 remap:

```shell
mkdir -p ~/bin ~/.config/systemd/user ~/.config/autostart

cat > ~/bin/apply-kbd << 'EOF'
#!/bin/bash
# grp:alt_shift_toggle remaps Shift -> ISO_Next_Group and breaks Shift over RDP
export DISPLAY="${DISPLAY:-:10.0}"
[ -f "$HOME/.Xauthority" ] && export XAUTHORITY="$HOME/.Xauthority"
[ -S /tmp/.X11-unix/X10 ] && export DISPLAY=:10.0

command -v setxkbmap >/dev/null || exit 0
setxkbmap -option 2>/dev/null || true
setxkbmap -layout us,ru -variant , -option grp_led:scroll

xmodmap -e 'keycode 50 = Shift_L Shift_L Shift_L Shift_L' 2>/dev/null || true
xmodmap -e 'keycode 62 = Shift_R Shift_R Shift_R Shift_R' 2>/dev/null || true
[ -f "$HOME/.Xmodmap" ] && xmodmap "$HOME/.Xmodmap" || xmodmap -e 'keycode 66 = F20 F20 F20 F20'

if command -v xfconf-query >/dev/null; then
  xfconf-query -c keyboard-layout -p /Default/XkbLayout -n -t string -s "us,ru"
  xfconf-query -c keyboard-layout -p /Default/XkbOptions/Group -n -t string -s "grp_led:scroll"
  xfconf-query -c xfce4-keyboard-shortcuts -p /commands/custom/override -n -t bool -s true
  xfconf-query -c xfce4-keyboard-shortcuts -n -t string -p /commands/custom/F20 -s "$HOME/bin/toggle-kbd-layout"
  xfconf-query -c xfce4-keyboard-shortcuts -n -t string -p "/commands/custom/<Super>space" -s "$HOME/bin/toggle-kbd-layout"
  xfconf-query -c xfce4-keyboard-shortcuts -n -t string -p "/commands/custom/<Alt>Shift_L" -s "$HOME/bin/toggle-kbd-layout"
  xfconf-query -c xfce4-keyboard-shortcuts -n -t string -p "/commands/custom/<Alt>Shift_R" -s "$HOME/bin/toggle-kbd-layout"
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

`~/.Xmodmap` — Caps Lock → F20:

```shell
cat > ~/.Xmodmap << 'EOF'
keycode 66 = F20 F20 F20 F20
EOF
```

Watchdog — keeps layout alive and fixes broken Shift after xrdp resets:

```shell
cat > ~/bin/kbd-watchdog << 'EOF'
#!/bin/bash
for i in $(seq 1 60); do [ -S /tmp/.X11-unix/X10 ] || [ -S /tmp/.X11-unix/X0 ] && break; sleep 1; done
for i in $(seq 1 60); do ~/bin/apply-kbd; sleep 2; done
while true; do
  export DISPLAY=:10.0; [ -S /tmp/.X11-unix/X10 ] || export DISPLAY=:0
  export XAUTHORITY=$HOME/.Xauthority
  cur=$(setxkbmap -query 2>/dev/null | awk '/^layout:/ {print $2}')
  shift50=$(xmodmap -pke 2>/dev/null | awk '/keycode  50 / {print $0}')
  caps=$(xmodmap -pke 2>/dev/null | awk '/keycode  66 / {print $3}')
  need=0
  case "$cur" in *ru*) ;; *) need=1 ;; esac
  echo "$shift50" | grep -q ISO_Next_Group && need=1
  [ "$caps" = "F20" ] || need=1
  [ "$need" = 1 ] && ~/bin/apply-kbd
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

> Do **not** use `grp:alt_shift_toggle` in `setxkbmap` — it remaps Shift to `ISO_Next_Group` and breaks uppercase letters and shortcuts. Use Alt+Shift via XFCE shortcut → `toggle-kbd-layout` instead.
{: .prompt-warning }

After reconnect wait 1–2 seconds for watchdog, then toggle.

> Keep only **one** xkb plugin in XFCE panel (`Unique=TRUE`). Duplicate plugins make the language indicator disappear on click.
{: .prompt-warning }

## Mac — Globe key (🌐)

Globe is consumed by macOS before RDP sees it. Virtual **F20 does not traverse RDP** either.

**Working approach:** Hammerspoon intercepts Globe only when **Windows App** is focused and runs `ssh kali toggle-kbd-layout`. Everywhere else Globe switches Mac input as usual.

| Context | Globe key |
|---------|-----------|
| Safari, Terminal, Cursor, etc. | Switches **Mac** input source |
| Windows App (RDP to Kali) | Toggles **Kali US/RU** via SSH |

Mac settings: **Keyboard → Press 🌐 key to → Change Input Source**

Passwordless SSH to Kali:

```shell
ssh-keygen -t ed25519 -f ~/.ssh/id_kali -N ""
ssh-copy-id -i ~/.ssh/id_kali.pub srzhka@192.168.0.208
```

`~/.ssh/config`:

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

Install Hammerspoon + config:

```shell
~/Documents/projects/kali/scripts/setup-mac-globe-rdp.sh
```

Grant **Accessibility** to Hammerspoon in System Settings.

Core logic:

```lua
-- When Windows App focused: ssh kali toggle-kbd-layout
-- Elsewhere: Globe passes through → normal Mac input switch
local RDP_BUNDLE = "com.microsoft.rdc.macos"

if not hs.accessibilityState(true) then return end

globeRdpTap = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(event)
  if not GLOBE_CODES[event:getKeyCode()] then return false end
  if not rdpFocused() then return false end
  hs.task.new("/usr/bin/ssh", nil, {
    "-F", os.getenv("HOME").."/.ssh/config",
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=3",
    "kali", "/home/srzhka/bin/toggle-kbd-layout",
  }):start()
  return true
end)
globeRdpTap:start()
hs.autoLaunch(true)
```

> Store `globeRdpTap` in a global variable — otherwise Lua GC stops the eventtap. Use `hs.accessibilityState(true)`, not the removed `checkAccessibility()`.
{: .prompt-info }

## Kali — Touchegg (Mac-like gestures)

For the laptop trackpad on Kali:

```shell
sudo apt-get install -y touchegg wmctrl
mkdir -p ~/.config/touchegg
```

`~/.config/touchegg/touchegg.conf` — main gestures:

| Gesture | Action |
|---------|--------|
| 3 fingers ←/→ | Switch workspace (Spaces) |
| 3 fingers ↑ | Maximize / restore window |
| 3 fingers ↓ | Show desktop |
| 4 fingers ←/→ | Switch workspace |

```shell
systemctl --user enable --now touchegg
```

## Kali — GitHub Desktop in RDP

RDP spawns an **isolated D-Bus/keyring** by default. GitHub Desktop then can't read tokens → fetch/push fails with auth errors.

Fix: point RDP session to the **shared system keyring**.

`~/.xprofile` — append:

```shell
# shared-system-dbus-for-rdp
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
export XDG_RUNTIME_DIR=/run/user/1000
```

`~/bin/github-desktop` wrapper:

```shell
cat > ~/bin/github-desktop << 'EOF'
#!/bin/sh
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
export XDG_RUNTIME_DIR=/run/user/1000
exec /usr/lib/github-desktop/github-desktop "$@"
EOF
chmod +x ~/bin/github-desktop
```

Override desktop entry `~/.local/share/applications/github-desktop.desktop`:

```ini
Exec=/home/srzhka/bin/github-desktop %U
```

If auth breaks again:

```shell
~/bin/fix-session-dbus   # kills duplicate keyring-daemon
# then restart GitHub Desktop from XFCE menu
```

> Launch GitHub Desktop **from the XFCE menu**, not from an old RDP terminal. Reconnect RDP after changing `startwm.sh`.
{: .prompt-info }

One-shot setup script (all of the above): `~/Documents/projects/kali/scripts/setup-kali-gh-desktop-rdp.sh`

## RDP audio

XFCE shows "connecting to PulseAudio" but no sound until `pipewire-module-xrdp` loads the `xrdp-sink`.

```shell
~/Documents/projects/kali/scripts/setup-kali-rdp-audio.sh
```

Or manually: install `pulseaudio-utils pipewire-module-xrdp libpipewire-0.3-modules-xrdp`, append PipeWire env to `~/.xprofile`, update `startwm.sh` / `reconnectwm.sh` (see above).

On Mac in **Windows App** → connection settings → **Play sound on this device** (sound plays on Mac, not on Kali laptop speakers).

Reconnect RDP after changing audio config.

## Mac — SMB projects share (IntelliJ)

Open Kali projects in IntelliJ on Mac without copying files — SMB share `//192.168.0.208/projects` → `/media/shared/projects`.

On Kali:

```shell
~/Documents/projects/kali/scripts/setup-kali-smb-projects.sh
```

On Mac — Finder `Cmd+K` → `smb://192.168.0.208/projects` → login `srzhka`.

Or mount to a fixed path:

```shell
~/Documents/projects/kali/scripts/mount-kali-projects-mac.sh
# projects appear in ~/Volumes/kali-projects
```

IntelliJ: **File → Open → `/Volumes/projects/...`** or `~/Volumes/kali-projects/...`

## Headless Kali (closed lid)

If Kali is used as an always-on server (bot, RDP, SSH) with closed lid:

```shell
# /etc/systemd/logind.conf.d/lid.conf
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
```

```shell
# block system sleep
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# stable WiFi with closed lid
# /etc/NetworkManager/conf.d/wifi-powersave-off.conf
[connection]
wifi.powersave = 2
```

Without `HandleLidSwitch=ignore`, closing the lid suspends the machine — SSH/RDP won't work until you open it.

Network (`NetworkManager`) and systemd services start **before login** (~2 min with closed lid after reboot).

> If `/media/shared` is on NTFS: use `ntfs-3g` in fstab, not `ntfs3` (broken in kernel 7.1.5+). Venv symlinks on NTFS break too — `~/bin/fix-trade-bot-venv.sh` before bot start.
{: .prompt-warning }

Trade bot runs as `srzhka-trade-bot.service` (dashboard `http://192.168.0.208:8765`). Tray icon needs XFCE login (local or RDP). Setup: `~/Documents/projects/kali/scripts/setup-kali-trade-bot-service.sh`

## Gotchas

| Problem | Fix |
|---------|-----|
| Cyrillic broken / keys dead | Keyboard mode **Scancode**, Mac layout **English** |
| Layout `us` only after connect | `xrdp_keyboard.ini`, `reconnectwm.sh`, watchdog |
| **Ctrl+Space** eaten by client | Use Caps / Super+Space / Globe |
| **Alt+Shift** unreliable over RDP | XFCE shortcut → `toggle-kbd-layout`, not `grp:alt_shift_toggle` |
| **Shift** broken (no capitals) | Remove `grp:alt_shift_toggle`; watchdog restores Shift_L/R |
| Duplicate xkb panel plugins | Keep one xkb plugin in XFCE panel (`Unique=TRUE`) |
| Globe does nothing in RDP | Hammerspoon + SSH toggle, not F20-over-RDP |
| No sound in RDP | `pipewire-module-xrdp`, reconnect, Windows App → play on Mac |
| GitHub Desktop auth in RDP | Shared D-Bus in `startwm.sh` + `github-desktop` wrapper |
| `login/10` keyring error | Reset GH Desktop cache, sign in again, use wrapper |
| RDP/SSH dead with closed lid | `HandleLidSwitch=ignore` in logind |
| `startwm.sh` corrupted | Write file locally, `scp`, `sudo cp` |
