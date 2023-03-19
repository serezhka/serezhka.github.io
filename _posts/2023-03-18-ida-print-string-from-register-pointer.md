---
layout: post
title: "IDA: Print string from register" 
date: 2023-03-18
categories: [Hack]
tags: [ida]
---

Add exec trace with script ```print(get_strlit_contents(eax, -1, STRTYPE_C))```

![IDA screenshot](/assets/img/posts/2023-03-18/ida_pro_trace_string_register.png){: .shadow .normal }