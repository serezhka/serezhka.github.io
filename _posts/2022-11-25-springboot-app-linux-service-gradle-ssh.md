---
layout: post
title: Deploy Spring Boot App as linux init.d service with Gradle via ssh
date: 2022-11-30
categories: [Java]
tags: [raspberry, java]
---

## Intro

Let's try to deploy Spring Boot app on a remote host with Gradle via ssh.
For example, we can add gradle deploy task for [previously created telegram bot](/posts/run-java-on-raspberry-pi/#create-simple-telegram-bot) and deploy it to my Raspberry pi

## Create (extend) gradle build script

> Full project source code available [here](https://github.com/serezhka/hello-pi-tg-bot-example)
{: .prompt-info }

I will use [gradle-ssh-plugin](https://gradle-ssh-plugin.github.io/) which provides convenient features for ssh connection and command execution

```groovy
plugins {
    id 'org.springframework.boot' version '2.7.5'
    id 'io.spring.dependency-management' version '1.1.0'
    id 'org.hidetake.ssh' version '2.10.1'
    id 'java'
}

ext {
    lombokVersion = '1.18.24'
    telegrambotsVersion = '6.1.0'
}

repositories {
    mavenCentral()
}

sourceCompatibility = JavaVersion.VERSION_11

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter'
    implementation 'org.springframework.boot:spring-boot-starter-logging'
    implementation "org.telegram:telegrambots-spring-boot-starter:${telegrambotsVersion}"

    // LOMBOK
    compileOnly "org.projectlombok:lombok:${lombokVersion}"
    annotationProcessor "org.projectlombok:lombok:${lombokVersion}"
    testCompileOnly "org.projectlombok:lombok:${lombokVersion}"
    testAnnotationProcessor "org.projectlombok:lombok:${lombokVersion}"

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

test {
    useJUnitPlatform()
}

tasks.named('bootJar') {
    launchScript()
}

remotes {
    raspberrypi {
        host = '192.168.0.25'
        user = 'kali'
        password = 'kali'
    }
}

task deploy {
    dependsOn bootJar
    doLast {
        ssh.run {
            session(remotes.raspberrypi) {
                execute "sudo service $project.name stop", ignoreError: true
                put from: "$buildDir/libs/${project.name}.jar", into: "/home/kali/$project.name"
                execute "sudo ln -s /home/kali/$project.name/${project.name}.jar /etc/init.d/$project.name", ignoreError: true
                execute "sudo systemctl daemon-reload"
                execute "sudo systemctl enable $project.name"
                execute "sudo service $project.name start"
            }
        }
    }
}

wrapper {
    gradleVersion = '7.5.1'
    distributionType = Wrapper.DistributionType.BIN
}
```
{: file="build.gradle" }

* ```sudo service $project.name stop``` stop service if exists and active
* ```put from: "$buildDir/libs/${project.name}.jar", into: "/home/kali/$project.name"``` put built artifact to the remote
* ```sudo ln -s /home/kali/$project.name/${project.name}.jar /etc/init.d/$project.name``` create symbolic link in /etc/init.d
* ```sudo systemctl daemon-reload``` restart daemon to pick up new service
* ```sudo systemctl enable $project.name``` make service run at startup
* ```sudo service $project.name start``` start service

## Deploy telegram bot as linux init.d service

```console
14:16:38: Executing 'deploy'...

> Task :compileJava
> Task :processResources
> Task :classes
> Task :bootJarMainClassName
> Task :bootJar
> Task :deploy

BUILD SUCCESSFUL in 39s
5 actionable tasks: 5 executed
14:17:18: Execution finished 'deploy'.
```

### Check service status

![Bot Test](/assets/img/posts/2022-11-30/service_status.png){: .shadow width="680" height="514" .normal }
_service \<service-name\> status_