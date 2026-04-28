# frozen_string_literal: true

source "https://rubygems.org"

# jekyll-theme-chirpy ≥ 7.1 requires Ruby ~> 3.1 (not 4.x as of Chirpy 7.4)
ruby ">= 3.1", "< 4.0"

gem "jekyll-theme-chirpy", "~> 7.4", ">= 7.4.1"

gem "html-proofer", "~> 5.1.1", group: :test

platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

gem "wdm", "~> 0.2.0", :platforms => [:mingw, :x64_mingw, :mswin]
