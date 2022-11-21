---
layout: post
title: Custom Kali Linux image with extended boot partition for Raspberry Pi
date: 2022-11-14
categories: [Raspberry]
tags: [raspberry, kali]
---

> Complete and official guide is [here](https://gitlab.com/kalilinux/build-scripts/kali-arm)
{: .prompt-info }

```shell
$ cd ~/
$ git clone https://gitlab.com/kalilinux/build-scripts/kali-arm
$ cd ~/kali-arm/
$ echo 'bootsize="2048"' > ./builder.txt
$ sudo ./common.d/build_deps.sh
$ sudo ./raspberry-pi-64-bit.sh
```

It took about 3 hours to build the image on my Raspberry Pi 4 model b, 8Gb Ram