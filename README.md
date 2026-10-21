# serezhka.github.io

Curriculum vitae and blog, built with [Jekyll](https://jekyllrb.com/) and [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy).

## Requirements

- Ruby **3.3+** (CI uses 3.4; see `.ruby-version` for local)
- Bundler

On macOS with Homebrew:

```shell
brew install ruby@3.3
export PATH="/opt/homebrew/opt/ruby@3.3/bin:$PATH"
```

> System Ruby from Homebrew may be 4.x — Chirpy needs Ruby `~> 3.1`. Prefer `ruby@3.3` / `ruby@3.4`.

## Setup

```shell
bundle install
```

## Local development

```shell
bundle exec jekyll serve --watch
```

Site will be available at http://127.0.0.1:4000/

## Production build

```shell
JEKYLL_ENV=production bundle exec jekyll build
bundle exec htmlproofer _site --disable-external
```
