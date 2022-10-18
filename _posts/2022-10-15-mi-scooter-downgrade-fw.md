---
layout: post
title: Mi Scooter Pro 2 downgrade firmware
date: 2022-10-15
categories: [Hack]
tags: [scooter, firmware]
---

> `Disclaimer` These instructions do not purport to cover all required preconditions,
> necessary downgrading steps and do not claim to provide for every possible contingency met during downgrade process.
> Should further information be desired or should particular problems arise  which are not covered sufficiently for you,
> the matter should be referred to [here](https://rollerplausch.com/threads/midu-flasher-st-link-downgrade-unbrick.5399/)
> and [here](https://rollerplausch.com/threads/neuer-controller-v3-1-bei-aktuellen-xiaomi-rollern-brickgefahr-bei-drv-downgrade-vorgehen.5187/)
{: .prompt-danger }

## Intro

I had updated a firmware on my Mi Electric Scooter Pro 2 via Mi Home app. Then I found out that this update blocked
possibility to install any custom firmware via bluetooth. That's why I need to do downgrade process first. 

## Scooter info

First of all I gathered hardware and firmware version info to understand whether it is possible to downgrade
and decide which tools to use. 

- Mi Home[^footnote-mi-home]
  + Firmware version: ```V2.4.8 (1.1.0_248_157_141)```
  + Production date: ```12/04/2021```
- Scooter hacking utility (SHU)[^footnote-shu]
  + Model: ```Mi Electric Scooter Pro 2```
  + BLE: ```1.5.7```
  + DRV: ```2.4.8```
  + BMS: ```1.4.1```
  + UUID: ```FF**********************```
- Dashboard
  + ```SCO_BLE_V3.3```
  + ```CD.00.0011.90```

I carefully read several forums (two of them already mentioned in disclaimer) to be sure that my scooter fits
and chose ```ST-LINK/V2``` programmer with ```MiDu-Flasher```[^footnote-midu-flasher] tool for Windows pc.

## Scooter preparation

Scooter must be fully charged and switched off. Remove dashboard cover and solder three male-female jumper wires to the points on the board shown in the figure.

![Board points](/assets/img/posts/2022-10-15/board_points.jpg){: .shadow width="972" height="589" .normal }

Switch on the scooter and lock it via bluetooth app.

## Software preparation

Download and unzip MiDu-Flasher. Install driver ```.\Driver\ST-LINK_USB_V2_1_Driver\stlink_winusb_install.bat```,
plug in ST-Link programmer and upgrade its firmware with ```.\Driver\ST-LINK_FirmwareUpgrade_V2.J37.S7\ST-LinkUpgrade.exe```

## Downgrade

```console
*************************************************************************
 *                       ____________________________                    *
 *                      /                           /\                   *
 *                     /       MiDu-Flasher        / /\                  *
 *                    /  Mi Downgrade & Unbrick   / /\                   *
 *                   /       ST-Link Utility     / /\                    *
 *                  /___________________________/ /\                     *
 *                  \___________________________\/\                      *
 *                   \ \ \ \ \ \ \ \ \ \ \ \ \ \ \                       *
 *                                                                       *
 *                      powered by OpenOCD                               *
 *                      created by VooDooShamane                         *
 *                      support Rollerplausch.com                        *
 *                                                                v1.0.5 *
 *************************************************************************
 -------------------------------------------------------------------------
 | Target=Dashboard  | Action=Downgrade   | Scooter=Pro2 | Chip=N51822x  |
 -------------------------------------------------------------------------

spoof new BLE to 157 ? (recommended)
Press [y] to spoof and [n] to leave BLE untouched
```

Launch MiDu-Flasher, select these four settings
- Target = ```Dashboard```
- Action = ```Downgrade```
- Scooter = ```Mi Pro2```
- Chip = ```NRF51822QFAC (32kb RAM)```

The program will complain that it cannot find the necessary files and will offer to download them. Agree.
The last question is about spoofing BLE version. Answer ```NO``` to be able flashing with SHU app later. 

From now there are 40 seconds to connect soldered wires to ST-Link.
![Wires connect](/assets/img/posts/2022-10-15/wires_connect.jpg){: .shadow width="450" height="450" .normal }

MiDu-Flasher will establish a connection and start downgrade. Keep calm until the process is complete.

That's all! It's possible now to cook custom firmware here: <https://mi.cfw.sh/> and flash via bluetooth with SHU app.

![Flashed result](/assets/img/posts/2022-10-15/flashed_result.jpg){: .shadow width="450" height="450" }
_Speed limit unlock example_

## Footnotes
[^footnote-mi-home]: Mi Home - Xiaomi Smart Home [App Store](https://apps.apple.com/app/mi-home-xiaomi-smart-home/id957323480)
[^footnote-shu]: ScooterHacking Utility [Google Play](https://play.google.com/store/apps/details?id=sh.cfw.utility)
[^footnote-midu-flasher]: MiDu-Flasher [GitHub](https://github.com/VooDooShamane/MiDu-Flasher)
