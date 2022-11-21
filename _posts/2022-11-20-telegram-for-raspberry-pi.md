---
layout: post
title: Install telegram-desktop snap on Raspberry Pi
date: 2022-11-20
categories: [Raspberry]
tags: [raspberry, telegram]
---

> Snapcraft official guide is [here](https://snapcraft.io/install/telegram-desktop/raspbian)
{: .prompt-info }

```shell
$ sudo apt update
$ sudo apt install snapd
$ sudo reboot
$ sudo snap install core
$ sudo snap install telegram-desktop
```

## snap install core error and fix

```console
┌──(kali㉿srzhka-pi)-[~]
└─$ sudo snap install core
error: cannot communicate with server: Post "http://localhost/v2/snaps/core": dial unix /run/snapd.socket: connect: no such file or directory
                                                                             
┌──(kali㉿srzhka-pi)-[~]
└─$ systemctl enable snapd.service
Created symlink /etc/systemd/system/multi-user.target.wants/snapd.service → /lib/systemd/system/snapd.service.
                                                                             
┌──(kali㉿srzhka-pi)-[~]
└─$ systemctl start snapd.service 
                                                                             
┌──(kali㉿srzhka-pi)-[~]
└─$ sudo snap install core        
Setup snap "core" (13891) security profiles
core 16-2.57.2 from Canonical✓ installed
```

## add launcher with icon

![Create Launcher](/assets/img/posts/2022-11-20/create_launcher.jpg){: .shadow width="972" height="589" .normal }
_Right click, Create Launcher_

+ Name: ```Telegram```
+ Command: ```/snap/bin/telegram-desktop```

![Create Launcher](/assets/img/posts/2022-11-20/choose_icon.jpg){: .shadow width="972" height="589" .normal }
_Choose icon_