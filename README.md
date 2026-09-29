# Sukka Ruleset

Ruleset snippets for [Surge](https://nssurge.com/), [Mihomo](https://wiki.metacubex.one/), [Clash Premium (Dreamacro)](https://web.archive.org/web/20230521135419/https://dreamacro.github.io/clash/premium/rule-providers.html), [sing-box](https://sing-box.sagernet.org/), [Surfboard for Android](https://getsurfboard.com), and [Stash](https://stash.ws/), collected, organized, and maintained by [Sukka](https://skk.moe) for personal use.

## Terms and License

Except for the `List/ip/china_ip.conf` file, which is shared under the CC BY-SA 2.0 license, this project is open-sourced under the AGPL-3.0 license and comes with no warranty of any kind. That is: **the author and all contributors of this project provide no technical support and are not responsible for any loss you may suffer**, including but not limited to: your software failing to start or work properly, kernel panics, your device failing to boot or work normally, hard drive damage or data loss, atomic bomb explosions, World War III, or a global CK-class reality-restructuring scenario that even the [SCP Foundation](https://scp-wiki.wikidot.com/) cannot stop.

If you are using a commercial public proxy service, be sure to read the service provider's Terms of Service (ToS) carefully first. The ToS of some public proxy providers state that using any third-party rule files is treated as automatically waiving the SLA and technical support.

If you fetch this project's ruleset files from the Ruleset Server provided by Sukka ([`https://ruleset.skk.moe`](https://ruleset.skk.moe)), you acknowledge and agree to all the terms of the [Privacy Policy](https://skk.moe/privacy-policy/). If you do not agree, please get the source code of this project from GitHub and build the ruleset files yourself.

## Mirrors

`ruleset.skk.moe` is the Ruleset Server provided by Sukka, powered by Cloudflare. However, for reasons that are well known, the speed and stability of Cloudflare's nodes in mainland China are not ideal. Sukka Ruleset currently provides the following official mirror:

- `ruleset-mirror.skk.moe`: maintained by Sukka.

To improve speed and stability, everyone is welcome to set up mirrors and sync updates from the following Git repositories:

- https://github.com/SukkaLab/ruleset.skk.moe
- https://gitlab.com/SukkaW/ruleset.skk.moe

## Ruleset List

- **Surge (Mac/iOS/tvOS)**: Surge optimizes all types of rules to varying degrees
  - `/List/domainset/`: `DOMAIN-SET`, domain-only rulesets that do not trigger DNS resolution
  - `/List/non_ip/`: `RULE-SET`, rulesets that do not trigger DNS resolution
  - `/List/ip/`: `RULE-SET`, rulesets that trigger DNS resolution
- **Mihomo**
  - `/Clash/domainset/`: `domain & text`, domain-only rulesets that do not trigger DNS resolution. As of May 3, 2025 UTC+0, Mihomo only optimizes rulesets whose behavior is domain or ipcidr
  - `/Clash/non_ip/`: `classical & text`, rulesets that do not trigger DNS resolution
  - `/Clash/ip/`: `classical & text` or `ipcidr & text`, rulesets that trigger DNS resolution
- **Clash Premium (Dreamacro)**
  - The DOMAIN SET format is not provided separately under `/LegacyClashPremium/domainset/`; please use Mihomo's DOMAIN SET rulesets (`/Clash/domainset/`), whose behavior and format are identical.
  - `/LegacyClashPremium/non_ip/`: `classical & text`, rulesets that do not trigger DNS resolution
  - `/LegacyClashPremium/ip/`: `classical & text` or `ipcidr & text`, rulesets that trigger DNS resolution
- **sing-box**: sing-box only provides one rule format, Headless Rule, which is optimized
  - `/sing-box/domainset/`: domain-only rules that do not trigger DNS resolution
  - `/sing-box/non_ip/`: rules that do not trigger DNS resolution
  - `/sing-box/ip/`: rules that trigger DNS resolution
- **Surfboard for Android**
  - DOMAIN-SET is not provided separately under `/Surfboard/domainset/`; please use Surge's DOMAIN SET rulesets (`/List/domainset/`).
  - `/Surfboard/non_ip/`: `RULE-SET`, rules that do not trigger DNS resolution
  - `/Surfboard/ip/`: `RULE-SET`, rules that trigger DNS resolution

**Be sure to add the rulesets to your configuration file in the order of `domainset`, `non_ip`, `ip`, and the order used in this README. You must ensure that all `domainset` or `non_ip` rulesets, as well as any `DOMAIN`, `DOMAIN-SUFFIX`, and `DOMAIN-KEYWORD` rules you add yourself, are placed before all `ip` rulesets and any `IP-CIDR`, `IP-CIDR6`, `IP-ASN`, and `GEOIP` rules you add yourself, without exception.**

If you place any `ip` ruleset, or your own `IP-CIDR`, `IP-CIDR6`, `IP-ASN`, and `GEOIP` rules, before any `domainset` or `non_ip` ruleset or any `DOMAIN`, `DOMAIN-SUFFIX`, and `DOMAIN-KEYWORD` rules you added yourself, **you will immediately lose the DNS pollution protection that Surge, Clash, Mihomo, Surfboard, and this project provide, and you will be completely exposed to the GFW's DNS pollution.**

> Surge, Clash, Mihomo, and Surfboard match rules one by one from top to bottom in the order they appear in the configuration, and DNS resolution is performed if and only when matching IP-type rules, FINAL, or the direct policy. Adding the rulesets in the order above avoids, as far as possible, your device issuing DNS resolution for domains that need to be proxied, thereby providing a degree of protection against the so-called "DNS pollution".

#### Ad Blocking / Privacy Protection / Malware Blocking / Phishing Blocking

- Automatically generated
- For the data sources, the allowlist of domains, and how the list is generated, see [`build-reject-domainset.ts`](Build/build-reject-domainset.ts)
- Recommended for Surge for Mac only; on mobile platforms, use a dedicated tool (such as AdGuard for Android/iOS) for better performance
- **Not a replacement for browser ad-blocking extensions (such as AdGuard for Browser)**

**Surge**

```ini
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/reject-drop.conf,REJECT-DROP,pre-matching

# Base list: 120,000 blocked domains
DOMAIN-SET,https://ruleset.skk.moe/List/domainset/reject.conf,REJECT,extended-matching
# Extra 90,000 blocked domains, a supplement to the base list; must be used together with the base list
DOMAIN-SET,https://ruleset.skk.moe/List/domainset/reject_extra.conf,REJECT
# Phishing site blocklist, 130,000 blocked domains in total
# On Surge 5 for Mac (or newer), enabling both the base and extra blocked domains at the same time will not degrade matching performance or cause excessive memory usage
# DOMAIN-SET,https://ruleset.skk.moe/List/domainset/reject_phishing.conf,REJECT
RULE-SET,https://ruleset.skk.moe/List/non_ip/reject.conf,REJECT,extended-matching
RULE-SET,https://ruleset.skk.moe/List/non_ip/reject-no-drop.conf,REJECT-NO-DROP,extended-matching
# URL-REGEX
# Must be used together with the Surge module https://ruleset.skk.moe/Modules/sukka_mitm_hostnames.sgmodule
# MITM and URL-REGEX have a very high performance overhead and are not recommended
# RULE-SET,https://ruleset.skk.moe/List/non_ip/reject-url-regex.conf,REJECT
```

```ini
# IP
RULE-SET,https://ruleset.skk.moe/List/ip/reject.conf,REJECT-DROP
```

**Mihomo**

```yaml
rule-providers:
  reject_non_ip_no_drop:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/reject-no-drop.txt
    path: ./sukkaw_ruleset/reject_non_ip_no_drop.txt
  reject_non_ip_drop:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/reject-drop.txt
    path: ./sukkaw_ruleset/reject_non_ip_drop.txt
  reject_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/reject.txt
    path: ./sukkaw_ruleset/reject_non_ip.txt
  reject_domainset:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/reject.txt
    path: ./sukkaw_ruleset/reject_domainset.txt
  # On Clash, enabling both the base and extra blocked domains causes performance problems such as excessive memory usage and longer matching times
  reject_extra_domainset:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/reject_extra.txt
    path: ./sukkaw_ruleset/reject_domainset_extra.txt
  reject_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/reject.txt
    path: ./sukkaw_ruleset/reject_ip.txt
```

```yaml
# Non IP
rules:
  - RULE-SET,reject_non_ip_drop,REJECT-DROP
  - RULE-SET,reject_domainset,REJECT
  - RULE-SET,reject_extra_domainset,REJECT
  - RULE-SET,reject_non_ip,REJECT
  - RULE-SET,reject_non_ip_no_drop,REJECT
```

```yaml
# IP
rules:
  - RULE-SET,reject_ip,REJECT
```

#### Sogou Input Method

- Manually maintained
- This ruleset prevents Sogou Input Method from automatically collecting every character you type and sending it back through domains such as `get.sogou.com/q`
- Affects Sogou Input Method account sync, dictionary updates, and issue feedback

**Surge**

```ini
RULE-SET,https://ruleset.skk.moe/List/non_ip/sogouinput.conf,REJECT
```

**Mihomo**

```yaml
rule-providers:
  sogouinput:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/sogouinput.txt
    path: ./sukkaw_ruleset/sogouinput.txt

rules:
  - RULE-SET,sogouinput,REJECT
```

#### Speedtest Domains

- `speedtest.net` test points: the domains of speed test servers in dozens of common regions, fetched through the Speedtest API
- Manually maintained domains of the speed test servers used by other speed test tools such as macOS `netQuality`
- `fast.com` test points share infrastructure and domains with the Netflix CDN and would affect streaming traffic routing, so they are not included in this ruleset
- Lets you run speed tests over a designated network egress without affecting normal internet access through the primary egress

**Surge**

```ini
DOMAIN-SET,https://ruleset.skk.moe/List/domainset/speedtest.conf,[Replace with your policy],extended-matching
```

**Mihomo**

```yaml
rule-providers:
  speedtest:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/speedtest.txt
    path: ./sukkaw_ruleset/speedtest.txt

rules:
  - RULE-SET,speedtest,[Replace with your policy]
```

#### Common Static CDNs

- Automatically generated + manually maintained
- Includes all common static resource CDN domains and object storage domains
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes
- Includes some domains that are not in `global.conf`, so even if you have no use for the low-rate nodes offered by commercial public proxy services and do not need to split this traffic, it is still recommended to use these rules; in that case, just assign them the same policy as `global.conf`

**Surge**

```ini
DOMAIN-SET,https://ruleset.skk.moe/List/domainset/cdn.conf,[Replace with your policy]
RULE-SET,https://ruleset.skk.moe/List/non_ip/cdn.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  cdn_domainset:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/cdn.txt
    path: ./sukkaw_ruleset/cdn_domainset.txt
  cdn_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/cdn.txt
    path: ./sukkaw_ruleset/cdn_non_ip.txt

rules:
  - RULE-SET,cdn_domainset,[Replace with your policy]
  - RULE-SET,cdn_non_ip,[Replace with your policy]
```

#### Streaming

- Manually maintained
- Includes rulesets for 4gtv, AbemaTV, All4, Amazon Prime Video, Apple TV, Apple Music TV, Bahamut, BBC, Bilibili Intl, DAZN, Deezer, Disney+, Discovery+, DMM, encoreTVB, Fox Now, Fox+, HBO GO/Now/Max/Asia, Hulu, HWTV, JOOX, Jwplayer, KKBOX, KKTV, Line TV, Naver TV, myTV Super, Netflix, niconico, Now E, Paramount+, PBS, Peacock, Pandora, PBS, Pornhub, SoundCloud, PBS, Spotify, TaiwanGood, Tiktok Intl, Twitch, ViuTV, ShowTime, iQiYi Global, Himalaya Podcast, Overcast, and WeTV

**Surge**

```ini
# Non IP
# North America-related streaming services
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream_us.conf,[Replace with your policy]
# Europe-related streaming services
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream_eu.conf,[Replace with your policy]
# Japan-related streaming services
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream_jp.conf,[Replace with your policy]
# South Korea-related streaming services
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream_kr.conf,[Replace with your policy]
# Hong Kong-related streaming services
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream_hk.conf,[Replace with your policy]
# Taiwan-related streaming services
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream_tw.conf,[Replace with your policy]
# All streaming services (including all of the above)
RULE-SET,https://ruleset.skk.moe/List/non_ip/stream.conf,[Replace with your policy]
```

```ini
# IP
# North America-related streaming services
RULE-SET,https://ruleset.skk.moe/List/ip/stream_us.conf,[Replace with your policy]
# Europe-related streaming services
RULE-SET,https://ruleset.skk.moe/List/ip/stream_eu.conf,[Replace with your policy]
# Japan-related streaming services
RULE-SET,https://ruleset.skk.moe/List/ip/stream_jp.conf,[Replace with your policy]
# South Korea-related streaming services
RULE-SET,https://ruleset.skk.moe/List/ip/stream_kr.conf,[Replace with your policy]
# Hong Kong-related streaming services
RULE-SET,https://ruleset.skk.moe/List/ip/stream_hk.conf,[Replace with your policy]
# Taiwan-related streaming services
RULE-SET,https://ruleset.skk.moe/List/ip/stream_tw.conf,[Replace with your policy]
# All streaming services (including all of the above)
RULE-SET,https://ruleset.skk.moe/List/ip/stream.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  # North America-related streaming services
  stream_us_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream_us.txt
    path: ./sukkaw_ruleset/stream_us_non_ip.txt
  stream_us_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream_us.txt
    path: ./sukkaw_ruleset/stream_us_ip.txt
  # Europe-related streaming services
  stream_eu_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream_eu.txt
    path: ./sukkaw_ruleset/stream_eu_non_ip.txt
  stream_eu_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream_eu.txt
    path: ./sukkaw_ruleset/stream_eu_ip.txt
  # Japan-related streaming services
  stream_jp_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream_jp.txt
    path: ./sukkaw_ruleset/stream_jp_non_ip.txt
  stream_jp_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream_jp.txt
    path: ./sukkaw_ruleset/stream_jp_ip.txt
  # South Korea-related streaming services
  stream_kr_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream_kr.txt
    path: ./sukkaw_ruleset/stream_kr_non_ip.txt
  stream_kr_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream_kr.txt
    path: ./sukkaw_ruleset/stream_kr_ip.txt
  # Hong Kong-related streaming services
  stream_hk_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream_hk.txt
    path: ./sukkaw_ruleset/stream_hk_non_ip.txt
  stream_hk_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream_hk.txt
    path: ./sukkaw_ruleset/stream_hk_ip.txt
  # Taiwan-related streaming services
  stream_tw_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream_tw.txt
    path: ./sukkaw_ruleset/stream_tw_non_ip.txt
  stream_tw_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream_tw.txt
    path: ./sukkaw_ruleset/stream_tw_ip.txt
  # All streaming services (including all of the above)
  stream_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/stream.txt
    path: ./sukkaw_ruleset/stream_non_ip.txt
  stream_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/stream.txt
    path: ./sukkaw_ruleset/stream_ip.txt
```

```yaml
# Non IP
rules:
  - RULE-SET,stream_us_non_ip,[Replace with your policy]
  - RULE-SET,stream_eu_non_ip,[Replace with your policy]
  - RULE-SET,stream_jp_non_ip,[Replace with your policy]
  - RULE-SET,stream_kr_non_ip,[Replace with your policy]
  - RULE-SET,stream_hk_non_ip,[Replace with your policy]
  - RULE-SET,stream_tw_non_ip,[Replace with your policy]
  - RULE-SET,stream_non_ip,[Replace with your policy]
```

```yaml
# IP
rules:
  - RULE-SET,stream_us_ip,[Replace with your policy]
  - RULE-SET,stream_eu_ip,[Replace with your policy]
  - RULE-SET,stream_jp_ip,[Replace with your policy]
  - RULE-SET,stream_kr_ip,[Replace with your policy]
  - RULE-SET,stream_hk_ip,[Replace with your policy]
  - RULE-SET,stream_tw_ip,[Replace with your policy]
  - RULE-SET,stream_ip,[Replace with your policy]
```

#### AI

- Domain and IP rules, manually maintained + automatically updated
- Includes OpenAI, Google Gemini, Claude, Perplexity, and more

**Surge**

```ini
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/ai.conf,[Replace with your policy]
RULE-SET,https://ruleset.skk.moe/List/non_ip/apple_intelligence.conf,[Replace with your policy],extended-matching
```

```ini
# IP
RULE-SET,https://ruleset.skk.moe/List/ip/ai.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  ai_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/ai.txt
    path: ./sukkaw_ruleset/ai_non_ip.txt
  apple_intelligence_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/apple_intelligence.txt
    path: ./sukkaw_ruleset/apple_intelligence_non_ip.txt
  ai_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/ai.txt
    path: ./sukkaw_ruleset/ai_ip.txt

rules:
  - RULE-SET,ai_non_ip,[Replace with your policy]
  - RULE-SET,apple_intelligence_non_ip,[Replace with your policy]

  - RULE-SET,ai_ip,[Replace with your policy]
```

#### Telegram

- Domain rules: manually maintained
- IP CIDR rules: automatically generated (data source: [`https://core.telegram.org/resources/cidr.txt`](https://core.telegram.org/resources/cidr.txt))
- ASN rules: manually maintained

> Using only the IP CIDR rules is recommended. The IP CIDR rule data comes entirely from the CIDR list officially published by Telegram and does not include the IPs of CDNs and data centers that Telegram has not yet put into use.
> The ASN rules are only suitable as a supplement; using them together with an unofficial MaxMind GeoLite database (such as GeoIP2-CN) will affect matching.

**Surge**

```ini
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/telegram.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://ruleset.skk.moe/List/ip/telegram.conf,[Replace with your policy]
RULE-SET,https://ruleset.skk.moe/List/ip/telegram_asn.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  telegram_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/telegram.txt
    path: ./sukkaw_ruleset/telegram_non_ip.txt
  telegram_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/telegram.txt
    path: ./sukkaw_ruleset/telegram_ip.txt
```

```yaml
# Non IP
rules:
  - RULE-SET,telegram_non_ip,[Replace with your policy]
```

```yaml
# IP
rules:
  - RULE-SET,telegram_ip,[Replace with your policy]
```

#### Apple CDN

- Automatically generated
- This ruleset contains the domains of Apple, Inc. that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/apple.china.conf)

**Surge**

```ini
DOMAIN-SET,https://ruleset.skk.moe/List/domainset/apple_cdn.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  apple_cdn:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/apple_cdn.txt
    path: ./sukkaw_ruleset/apple_cdn.txt

rules:
  - RULE-SET,apple_cdn,[Replace with your policy]
```

#### Apple Service

- Manually maintained

**Surge**

```ini
RULE-SET,https://ruleset.skk.moe/List/non_ip/apple_services.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  apple_services:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/apple_services.txt
    path: ./sukkaw_ruleset/apple_services.txt

rules:
  - RULE-SET,apple_services,[Replace with your policy]
```

#### Apple CN

- Manually maintained
- Domains of services such as Cloud Guizhou (`icloud.com.cn`) and the mainland-China-only edition of Apple Maps.

**Surge**

```ini
RULE-SET,https://ruleset.skk.moe/List/non_ip/apple_cn.conf,DIRECT
```

**Mihomo**

```yaml
rule-providers:
  apple_cn_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/apple_cn.txt
    path: ./sukkaw_ruleset/apple_cn_non_ip.txt

rules:
  - RULE-SET,apple_cn_non_ip,[Replace with your policy]
```

#### Microsoft CDN

- Automatically generated
- This ruleset contains the domains of Microsoft that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/apple.china.conf)

**Surge**

```ini
RULE-SET,https://ruleset.skk.moe/List/non_ip/microsoft_cdn.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  microsoft_cdn_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/microsoft_cdn.txt
    path: ./sukkaw_ruleset/microsoft_cdn_non_ip.txt

rules:
  - RULE-SET,microsoft_cdn_non_ip,[Replace with your policy]
```

#### Microsoft

- Manually maintained

**Surge**

```ini
RULE-SET,https://ruleset.skk.moe/List/non_ip/microsoft.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  microsoft_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/microsoft.txt
    path: ./sukkaw_ruleset/microsoft_non_ip.txt

rules:
  - RULE-SET,microsoft_non_ip,[Replace with your policy]
```

#### NetEase Cloud Music

- Manually maintained

**Surge**

```ini
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/neteasemusic.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://ruleset.skk.moe/List/ip/neteasemusic.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  neteasemusic_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/neteasemusic.txt
    path: ./sukkaw_ruleset/neteasemusic_non_ip.txt
  neteasemusic_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/neteasemusic.txt
    path: ./sukkaw_ruleset/neteasemusic_ip.txt
```

```yaml
# Non IP
rules:
  - RULE-SET,neteasemusic_non_ip,[Replace with your policy]
```

```yaml
# IP
rules:
  - RULE-SET,neteasemusic_ip,[Replace with your policy]
```

#### Large File Downloads (Software Updates, Operating Systems, etc.)

- Manually maintained
- Includes the domains of some common object storage services
- These domains may include Microsoft and Apple CDN nodes inside mainland China. You can use them together with the Microsoft CDN and Apple CDN rulesets above and assign the direct policy.
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes

**Surge**

```ini
DOMAIN-SET,https://ruleset.skk.moe/List/domainset/download.conf,[Replace with your policy]
RULE-SET,https://ruleset.skk.moe/List/non_ip/download.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  download_domainset:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/download.txt
    path: ./sukkaw_ruleset/download_domainset.txt
  download_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/download.txt
    path: ./sukkaw_ruleset/download_non_ip.txt

rules:
  - RULE-SET,download_domainset,[Replace with your policy]
  - RULE-SET,download_non_ip,[Replace with your policy]
```

#### Intranet Domains and LAN IPs

- Manually maintained
- The domain list contains `.local` and the `in-addr.arpa` domains of LAN IPs (i.e., AS112 domains). These domains are generally resolved to LAN IPs, need to be resolved by the internal DNS, and need to be accessed directly.
- Clash has no built-in LAN IP rule list (Surge has a built-in LAN IP rule list, `LAN`), so it has to be imported manually.

**Surge**

```ini
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/lan.conf,DIRECT
```

```ini
# IP
RULE-SET,https://ruleset.skk.moe/List/ip/lan.conf,DIRECT
```

**Mihomo**

```yaml
rule-providers:
  lan_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/lan.txt
    path: ./sukkaw_ruleset/lan_non_ip.txt
  lan_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/lan.txt
    path: ./sukkaw_ruleset/lan_ip.txt
```

```yaml
# Non IP
rules:
  - RULE-SET,lan_non_ip,DIRECT
```

```yaml
# IP
rules:
  - RULE-SET,lan_ip,DIRECT
```

#### Common Mainland China Services

- Manually maintained

**Surge**

```ini
# Inside mainland China (the most common scenario): only domestic needs to be configured, and DIRECT is enough
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/domestic.conf,DIRECT

# IP
RULE-SET,https://ruleset.skk.moe/List/ip/domestic.conf,DIRECT
```

```ini
# In other countries and regions, when you need a back-to-China node to access mainland China services: domestic_cdn goes direct first, and domestic uses the back-to-China node
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/domestic_cdn.conf,DIRECT
RULE-SET,https://ruleset.skk.moe/List/non_ip/domestic.conf,Back To China Proxy

# IP
RULE-SET,https://ruleset.skk.moe/List/ip/domestic.conf,Back To China Proxy
```

**Mihomo**

```yaml
rule-providers:
  domestic_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/domestic.txt
    path: ./sukkaw_ruleset/domestic_non_ip.txt
  # Only needed in other countries and regions, when you need a back-to-China node to access mainland China services
  domestic_cdn_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/domestic_cdn.txt
    path: ./sukkaw_ruleset/domestic_cdn_non_ip.txt
  domestic_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/domestic.txt
    path: ./sukkaw_ruleset/domestic_ip.txt
```

```yaml
# Inside mainland China (the most common scenario): only domestic needs to be configured, and DIRECT is enough
rules:
  # Non IP
  - RULE-SET,domestic_non_ip,DIRECT
  # IP
  - RULE-SET,domestic_ip,DIRECT
```

```yaml
# In other countries and regions, when you need a back-to-China node to access mainland China services: domestic_cdn goes direct first, and domestic uses the back-to-China node
rules:
  # Non IP
  - RULE-SET,domestic_cdn_non_ip,DIRECT
  - RULE-SET,domestic_non_ip,Back To China Proxy
  # IP
  - RULE-SET,domestic_ip,Back To China Proxy
```

#### Services That Should Go Direct

- Manually maintained
- Includes hotspot authentication (captive portal) pages, PT sites, process names of download tools and proxy tools, LAN cache services, academic databases, and other services that should be accessed directly wherever you are
- Just use DIRECT

**Surge**

```ini
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/direct.conf,DIRECT
```

**Mihomo**

```yaml
rule-providers:
  direct_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/direct.txt
    path: ./sukkaw_ruleset/direct_non_ip.txt
```

```yaml
# Non IP
rules:
  - RULE-SET,direct_non_ip,DIRECT
```

#### Common Services in Other Countries and Regions

- Manually maintained
- Includes common services from other countries and regions, such as Google, Reddit, Facebook, Twitter, Discord, and GitHub, that cannot be accessed directly from within mainland China or that offer a poor experience when accessed directly, as well as a batch of ccTLDs and gTLDs of other countries and regions
- **The vast majority of users are located in mainland China; for these rules, just use a proxy**
- You only need to set these rules to direct if you are located in another country or region, only need a back-to-China node to access mainland China services, and send all other traffic direct (in which case your `FINAL` / `MATCH` is usually direct as well)

**Surge**

```ini
# Inside mainland China (the most common scenario): use a proxy
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/global.conf,Proxy
```

```ini
# In other countries and regions, when you only need a back-to-China node to access mainland China services: DIRECT is enough
# Non IP
RULE-SET,https://ruleset.skk.moe/List/non_ip/global.conf,DIRECT
```

**Mihomo**

```yaml
rule-providers:
  global_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/global.txt
    path: ./sukkaw_ruleset/global_non_ip.txt
```

```yaml
# Inside mainland China (the most common scenario): use a proxy
# Non IP
rules:
  - RULE-SET,global_non_ip,Proxy
```

```yaml
# In other countries and regions, when you only need a back-to-China node to access mainland China services: DIRECT is enough
# Non IP
rules:
  - RULE-SET,global_non_ip,DIRECT
```

#### chnroute CIDR

- Automatically generated
- IPv4 [raw data](https://github.com/misakaio/chnroutes2) is published by Misaka Network, Inc. under the [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) license. It is reprocessed to add and merge some domestic (mainland China) segments whose BGP routes Misaka Network, Inc. does not receive, and to exclude IP segments announced in Hong Kong that Misaka Network, Inc. collected by mistake (usually announced by China Mobile International, CMI)
- IPv6 raw data is published by [gaoyifan/china-operator-ip](https://github.com/gaoyifan/china-operator-ip) under the MIT license

**Surge**

```ini
RULE-SET,https://ruleset.skk.moe/List/ip/china_ip.conf,[Replace with your policy]
# Only use it if you are using IPv6
# RULE-SET,https://ruleset.skk.moe/List/ip/china_ip_ipv6.conf,[Replace with your policy]
```

**Mihomo**

```yaml
rule-providers:
  china_ip:
    type: http
    behavior: ipcidr
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/china_ip.txt
    path: ./sukkaw_ruleset/china_ip.txt
  china_ip_ipv6:
    type: http
    behavior: ipcidr
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/china_ip_ipv6.txt
    path: ./sukkaw_ruleset/china_ipv6.txt
rules:
  - RULE-SET,china_ip,[Replace with your policy]
  # Only use it if you are using IPv6
  # - RULE-SET,china_ip_ipv6,[Replace with your policy]
```

## Surge Module List

- Sukka URL Rewrite: `https://ruleset.skk.moe/Modules/sukka_url_rewrite.sgmodule`
- Sukka Surge Network Test Domain: `https://ruleset.skk.moe/Modules/sukka_surge_network_test_domain.sgmodule`
- Sukka MITM Hostnames: `https://ruleset.skk.moe/Modules/sukka_mitm_hostnames.sgmodule`
- Sukka MITM All Hostnames: `https://ruleset.skk.moe/Modules/sukka_mitm_all_hostnames.sgmodule`
- Exclude Reserved IP from Surge VIF: `https://ruleset.skk.moe/Modules/sukka_exclude_reservered_ip.sgmodule`
- Common Always Real IP Hostnames: `https://ruleset.skk.moe/Modules/sukka_common_always_realip.sgmodule`
- Redirect Google CN to Google: `https://ruleset.skk.moe/Modules/google_cn_307.sgmodule`

## FAQ

**What is this?**

I don't know either.

**Are there rulesets for Clash?**

The rulesets support Mihomo (mihomo). The "Surge modules" are not compatible with any version of Clash.

**Are there rulesets for Shadowrocket, Quantumult X, Loon, or V2RayNG?**

No. And there **definitely** never will be.

**Can these rulesets be used with Surfboard?**

If Surfboard can fully parse all of Surge's syntax, and when importing / processing rulesets it only silently errors on unsupported syntax (such as `URL-REGEX`, which involves MITM; `USER-AGENT`, which only applies to HTTP/HTTPS requests; and `PROCESS-NAME`, which is only supported on PC/Mac platforms), then it can be used with Surfboard; otherwise it cannot.

**I used your rulesets and something went wrong. How do I report it?**

No, you can't.

**Can I help maintain the project and fix issues, then?**

If your Pull Request shows up in my GitHub Notification Inbox and I happen to see it, I will review it.

## License

The `List/ip/china_ip.conf` file is licensed under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The rest of the files are licensed under [AGPL-3.0](./LICENSE).

----

**Surge** © [Sukka](https://github.com/SukkaW), Authored and maintained by Sukka with help from contributors ([list](https://github.com/SukkaW/Surge/graphs/contributors)).

> [Personal Website](https://skk.moe) · [Blog](https://blog.skk.moe) · GitHub [@SukkaW](https://github.com/SukkaW) · Telegram Channel [@SukkaChannel](https://t.me/SukkaChannel) · Twitter [@isukkaw](https://twitter.com/isukkaw) · Keybase [@sukka](https://keybase.io/sukka)

<p align="center">
  <a href="https://github.com/sponsors/SukkaW/">
    <img src="https://sponsor.cdn.skk.moe/sponsors.svg"/>
  </a>
</p>

