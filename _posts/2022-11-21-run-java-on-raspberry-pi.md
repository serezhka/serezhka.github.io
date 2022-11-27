---
layout: post
title: Run Java app on Raspberry Pi with IntelliJ Idea via ssh
date: 2022-11-21
categories: [Java]
tags: [raspberry, java]
---

## Intro

TODO

## Prerequisite

* Raspberry pi with java installed
* IntelliJ Idea
* Telegram bot created via [BotFather](https://t.me/BotFather)

## Create simple telegram bot

### Create new gradle project

> Full project source code available [here](https://github.com/serezhka/hello-pi-tg-bot-example)
{: .prompt-info }

```groovy
plugins {
    id 'org.springframework.boot' version '2.7.5'
    id 'io.spring.dependency-management' version '1.1.0'
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

wrapper {
    gradleVersion = '7.5.1'
    distributionType = Wrapper.DistributionType.BIN
}
```
{: file="build.gradle" }

### Create Spring Boot App with one component

The new component implements ```org.telegram.telegrambots.bots.TelegramLongPollingBot```,
responds on ```/sayhello``` command with text message

```java
import lombok.extern.java.Log;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Update;

@Log
@Component
public class Bot extends TelegramLongPollingBot {

    @Value("${username}")
    private String username;

    @Value("${token}")
    private String token;

    @Override
    public void onUpdateReceived(Update update) {
        log.info(update.toString());

        if (update.hasMessage() && update.getMessage().hasText()) {
            if (update.getMessage().getText().startsWith("/sayhello")) {
                try {
                    SendMessage sendMessage = new SendMessage();
                    sendMessage.setChatId(String.valueOf(update.getMessage().getChatId()));
                    sendMessage.setText("Bot says hello\\! Hosted on Raspberry Pi");
                    execute(sendMessage);
                } catch (Exception e) {
                    log.severe(e.getMessage());
                }
            }
        }
    }

    @Override
    public String getBotUsername() {
        return username;
    }

    @Override
    public String getBotToken() {
        return token;
    }
}
```
{: file="Bot.java" }

Add ```username``` and ```token``` values to the app properties

```properties
username=botname
token=ddddddddd:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
{: file="application.properties" }

That's it! Now we are ready to run/debug our bot on Raspberry pi

## Create new ssh config in IntelliJ Idea

Put your settings and test connection

![SSH Config](/assets/img/posts/2022-11-21/ssh_config.png){: .shadow width="972" height="589" .normal }
_ssh config_

## Edit Run/Debug configurations

Select Run on: your ssh config. Make sure jdk/jre path is defined 

![Run Config](/assets/img/posts/2022-11-21/run_configuration.png){: .shadow width="972" height="589" .normal }
_Run/Debug config_

## Launch app and test telegram bot

```console
/lib/jvm/java-17-openjdk-arm64/bin/java --args com.github.serezhka.BotApp
OpenJDK 64-Bit Server VM warning: Options -Xverify:none and -noverify were deprecated in JDK 13 and will likely be removed in a future release.

  .   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::                (v2.7.5)

2022-11-21 18:59:59.608  INFO 14338 --- [main] com.github.serezhka.BotApp        : Starting BotApp using Java 17.0.5 on srzhka-pi with PID 14338 (/home/kali/hello-pi-tg-bot-example/RNplZOF7cI started by kali in /home/kali/hello-pi-tg-bot-example/m6O0gQW1b7)
2022-11-21 18:59:59.615  INFO 14338 --- [main] com.github.serezhka.BotApp        : No active profile set, falling back to 1 default profile: "default"
2022-11-21 19:00:03.467  INFO 14338 --- [main] com.github.serezhka.BotApp        : Started BotApp in 4.923 seconds (JVM running for 6.904)
2022-11-21 19:01:02.786  INFO 14338 --- [****] com.github.serezhka.bot.SrzhkaBot : Update(updateId=628730277, message=Message(messageId=455, from=User(userName=srzhka), date=1669050062, text=/sayhello))
```

![Bot Test](/assets/img/posts/2022-11-21/bot_test.jpg){: .shadow width="972" height="589" .normal }
_Bot says hello_