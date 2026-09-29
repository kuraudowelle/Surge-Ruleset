# Surge Ruleset

Ruleset snippets for [Surge](https://nssurge.com/), maintained by [kuraudowelle](https://github.com/kuraudowelle) for personal use. Forked from [SukkaW/Surge](https://github.com/SukkaW/Surge).

## Terms and License

Except for the `List/ip/china_ip.conf` file, which is shared under the CC BY-SA 2.0 license, this project is open-sourced under the AGPL-3.0 license and comes with no warranty of any kind. That is: **the author and all contributors of this project provide no technical support and are not responsible for any loss you may suffer**, including but not limited to: your software failing to start or work properly, kernel panics, your device failing to boot or work normally, hard drive damage or data loss, atomic bomb explosions, World War III, or a global CK-class reality-restructuring scenario that even the [SCP Foundation](https://scp-wiki.wikidot.com/) cannot stop.

If you are using a commercial public proxy service, be sure to read the service provider's Terms of Service (ToS) carefully first. The ToS of some public proxy providers state that using any third-party rule files is treated as automatically waiving the SLA and technical support.

The ruleset files are served from this repository through `https://raw.githubusercontent.com/kuraudowelle/Surge/master/`. You can also get the source code of this project and build the ruleset files yourself.

The built files (`List/`, `Modules/`, `Mock/` and `Internal/`) are rebuilt by the [Build workflow](.github/workflows/main.yml) twice a day (05:17 and 17:17 UTC) and on every push to `master`, and the workflow commits the result back to `master`. Edit the sources in `Source/` and `Build/`, not the generated files. Hand-written modules and mocks live next to the generated ones in `Modules/` and `Mock/`. To delete a published file that is no longer generated, add it to `REMOVED_FILES` in [`build-deprecate-files.ts`](Build/build-deprecate-files.ts).

## Ruleset List

- **Surge (Mac/iOS/tvOS)**: Surge optimizes all types of rules to varying degrees
  - `/List/domainset/`: `DOMAIN-SET`, domain-only rulesets that do not trigger DNS resolution
  - `/List/non_ip/`: `RULE-SET`, rulesets that do not trigger DNS resolution
  - `/List/ip/`: `RULE-SET`, rulesets that trigger DNS resolution

**Be sure to add the rulesets to your configuration file in the order of `domainset`, `non_ip`, `ip`, and the order used in this README. You must ensure that all `domainset` or `non_ip` rulesets, as well as any `DOMAIN`, `DOMAIN-SUFFIX`, and `DOMAIN-KEYWORD` rules you add yourself, are placed before all `ip` rulesets and any `IP-CIDR`, `IP-CIDR6`, `IP-ASN`, and `GEOIP` rules you add yourself, without exception.**

If you place any `ip` ruleset, or your own `IP-CIDR`, `IP-CIDR6`, `IP-ASN`, and `GEOIP` rules, before any `domainset` or `non_ip` ruleset or any `DOMAIN`, `DOMAIN-SUFFIX`, and `DOMAIN-KEYWORD` rules you added yourself, **you will immediately lose the DNS pollution protection that Surge and this project provide, and you will be completely exposed to the GFW's DNS pollution.**

> Surge matches rules one by one from top to bottom in the order they appear in the configuration, and DNS resolution is performed if and only when matching IP-type rules, FINAL, or the direct policy. Adding the rulesets in the order above avoids, as far as possible, your device issuing DNS resolution for domains that need to be proxied, thereby providing a degree of protection against the so-called "DNS pollution".

#### Ad Blocking / Privacy Protection / Malware Blocking / Phishing Blocking

- Automatically generated
- For the data sources, the allowlist of domains, and how the list is generated, see [`build-reject-domainset.ts`](Build/build-reject-domainset.ts)
- Recommended for Surge for Mac only; on mobile platforms, use a dedicated tool (such as AdGuard for Android/iOS) for better performance
- **Not a replacement for browser ad-blocking extensions (such as AdGuard for Browser)**

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/reject-drop.conf,REJECT-DROP,pre-matching

# Base list: 120,000 blocked domains
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/reject.conf,REJECT,extended-matching
# Extra 90,000 blocked domains, a supplement to the base list; must be used together with the base list
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/reject_extra.conf,REJECT
# Phishing site blocklist, 130,000 blocked domains in total
# On Surge 5 for Mac (or newer), enabling both the base and extra blocked domains at the same time will not degrade matching performance or cause excessive memory usage
# DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/reject_phishing.conf,REJECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/reject.conf,REJECT,extended-matching
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/reject-no-drop.conf,REJECT-NO-DROP,extended-matching
# URL-REGEX
# Must be used together with the Surge module https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_mitm_hostnames.sgmodule
# MITM and URL-REGEX have a very high performance overhead and are not recommended
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/reject-url-regex.conf,REJECT
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/reject.conf,REJECT-DROP
```

#### Speedtest Domains

- `speedtest.net` test points: the domains of speed test servers in dozens of common regions, fetched through the Speedtest API
- Manually maintained domains of the speed test servers used by other speed test tools such as macOS `netQuality`
- `fast.com` test points share infrastructure and domains with the Netflix CDN and would affect streaming traffic routing, so they are not included in this ruleset
- Lets you run speed tests over a designated network egress without affecting normal internet access through the primary egress

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/speedtest.conf,[Replace with your policy],extended-matching
```

#### Common Static CDNs

- Automatically generated + manually maintained
- Includes all common static resource CDN domains and object storage domains
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes
- Includes some domains that are not in `global.conf`, so even if you have no use for the low-rate nodes offered by commercial public proxy services and do not need to split this traffic, it is still recommended to use these rules; in that case, just assign them the same policy as `global.conf`

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/cdn.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/cdn.conf,[Replace with your policy]
```

#### Streaming

- Manually maintained
- Includes rulesets for 4gtv, AbemaTV, All4, Amazon Prime Video, Apple TV, Apple Music TV, Bahamut, BBC, Bilibili Intl, DAZN, Deezer, Disney+, Discovery+, DMM, encoreTVB, Fox Now, Fox+, HBO GO/Now/Max/Asia, Hulu, HWTV, JOOX, Jwplayer, KKBOX, KKTV, Line TV, Naver TV, myTV Super, Netflix, niconico, Now E, Paramount+, PBS, Peacock, Pandora, PBS, Pornhub, SoundCloud, PBS, Spotify, TaiwanGood, Tiktok Intl, Twitch, ViuTV, ShowTime, iQiYi Global, Himalaya Podcast, Overcast, and WeTV

```ini
# Non IP
# North America-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream_us.conf,[Replace with your policy]
# Europe-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream_eu.conf,[Replace with your policy]
# Japan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream_jp.conf,[Replace with your policy]
# South Korea-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream_kr.conf,[Replace with your policy]
# Hong Kong-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream_hk.conf,[Replace with your policy]
# Taiwan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream_tw.conf,[Replace with your policy]
# All streaming services (including all of the above)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/stream.conf,[Replace with your policy]
```

```ini
# IP
# North America-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream_us.conf,[Replace with your policy]
# Europe-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream_eu.conf,[Replace with your policy]
# Japan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream_jp.conf,[Replace with your policy]
# South Korea-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream_kr.conf,[Replace with your policy]
# Hong Kong-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream_hk.conf,[Replace with your policy]
# Taiwan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream_tw.conf,[Replace with your policy]
# All streaming services (including all of the above)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/stream.conf,[Replace with your policy]
```

#### AI

- Domain and IP rules, manually maintained + automatically updated
- Includes OpenAI, Google Gemini, Claude, Perplexity, and more

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/ai.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/apple_intelligence.conf,[Replace with your policy],extended-matching
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/ai.conf,[Replace with your policy]
```

#### Telegram

- Domain rules: manually maintained
- IP CIDR rules: automatically generated (data source: [`https://core.telegram.org/resources/cidr.txt`](https://core.telegram.org/resources/cidr.txt))
- ASN rules: manually maintained

> Using only the IP CIDR rules is recommended. The IP CIDR rule data comes entirely from the CIDR list officially published by Telegram and does not include the IPs of CDNs and data centers that Telegram has not yet put into use.
> The ASN rules are only suitable as a supplement; using them together with an unofficial MaxMind GeoLite database (such as GeoIP2-CN) will affect matching.

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/telegram.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/telegram.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/telegram_asn.conf,[Replace with your policy]
```

#### Apple CDN

- Automatically generated
- This ruleset contains the domains of Apple, Inc. that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/apple.china.conf)

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/apple_cdn.conf,[Replace with your policy]
```

#### Apple Service

- Manually maintained

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/apple_services.conf,[Replace with your policy]
```

#### Apple CN

- Manually maintained
- Domains of services such as Cloud Guizhou (`icloud.com.cn`) and the mainland-China-only edition of Apple Maps.

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/apple_cn.conf,DIRECT
```

#### Microsoft CDN

- Automatically generated
- This ruleset contains the domains of Microsoft that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/apple.china.conf)

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/microsoft_cdn.conf,[Replace with your policy]
```

#### Microsoft

- Manually maintained

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/microsoft.conf,[Replace with your policy]
```

#### NetEase Cloud Music

- Manually maintained

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/neteasemusic.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/neteasemusic.conf,[Replace with your policy]
```

#### Large File Downloads (Software Updates, Operating Systems, etc.)

- Manually maintained
- Includes the domains of some common object storage services
- These domains may include Microsoft and Apple CDN nodes inside mainland China. You can use them together with the Microsoft CDN and Apple CDN rulesets above and assign the direct policy.
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/domainset/download.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/download.conf,[Replace with your policy]
```

#### Intranet Domains and LAN IPs

- Manually maintained
- The domain list contains `.local` and the `in-addr.arpa` domains of LAN IPs (i.e., AS112 domains). These domains are generally resolved to LAN IPs, need to be resolved by the internal DNS, and need to be accessed directly.

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/lan.conf,DIRECT
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/lan.conf,DIRECT
```

#### Common Mainland China Services

- Manually maintained

```ini
# Inside mainland China (the most common scenario): only domestic needs to be configured, and DIRECT is enough
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/domestic.conf,DIRECT

# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/domestic.conf,DIRECT
```

```ini
# In other countries and regions, when you need a back-to-China node to access mainland China services: domestic_cdn goes direct first, and domestic uses the back-to-China node
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/domestic_cdn.conf,DIRECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/domestic.conf,Back To China Proxy

# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/domestic.conf,Back To China Proxy
```

#### Services That Should Go Direct

- Manually maintained
- Includes hotspot authentication (captive portal) pages, PT sites, process names of download tools and proxy tools, LAN cache services, academic databases, and other services that should be accessed directly wherever you are
- Just use DIRECT

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/direct.conf,DIRECT
```

#### Common Services in Other Countries and Regions

- Manually maintained
- Includes common services from other countries and regions, such as Google, Reddit, Facebook, Twitter, Discord, and GitHub, that cannot be accessed directly from within mainland China or that offer a poor experience when accessed directly, as well as a batch of ccTLDs and gTLDs of other countries and regions
- **The vast majority of users are located in mainland China; for these rules, just use a proxy**
- You only need to set these rules to direct if you are located in another country or region, only need a back-to-China node to access mainland China services, and send all other traffic direct (in which case your `FINAL` / `MATCH` is usually direct as well)

```ini
# Inside mainland China (the most common scenario): use a proxy
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/global.conf,Proxy
```

```ini
# In other countries and regions, when you only need a back-to-China node to access mainland China services: DIRECT is enough
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/non_ip/global.conf,DIRECT
```

#### chnroute CIDR

- Automatically generated
- IPv4 [raw data](https://github.com/misakaio/chnroutes2) is published by Misaka Network, Inc. under the [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) license. It is reprocessed to add and merge some domestic (mainland China) segments whose BGP routes Misaka Network, Inc. does not receive, and to exclude IP segments announced in Hong Kong that Misaka Network, Inc. collected by mistake (usually announced by China Mobile International, CMI)
- IPv6 raw data is published by [gaoyifan/china-operator-ip](https://github.com/gaoyifan/china-operator-ip) under the MIT license

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/china_ip.conf,[Replace with your policy]
# Only use it if you are using IPv6
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge/master/List/ip/china_ip_ipv6.conf,[Replace with your policy]
```

## Surge Module List

- URL Redirect: `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_url_redirect.sgmodule`
- URL Redirect (Minimum): `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_url_redirect_minimum.sgmodule`
- Surge Network Test Domain: `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_surge_network_test_domain.sgmodule`
- MITM Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_mitm_hostnames.sgmodule`
- MITM All Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_mitm_all_hostnames.sgmodule`
- Common Always Real IP Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/sukka_common_always_realip.sgmodule`
- Redirect Google CN to Google: `https://raw.githubusercontent.com/kuraudowelle/Surge/master/Modules/google_cn_307.sgmodule`

## FAQ

**What is this?**

I don't know either.

**Are there rulesets for Shadowrocket, Quantumult X, Loon, or V2RayNG?**

No. And there **definitely** never will be.

**I used your rulesets and something went wrong. How do I report it?**

No, you can't.

**Can I help maintain the project and fix issues, then?**

If your Pull Request shows up in my GitHub Notification Inbox and I happen to see it, I will review it.

## License

The `List/ip/china_ip.conf` file is licensed under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The rest of the files are licensed under [AGPL-3.0](./LICENSE).

----

**Surge Ruleset** © [kuraudowelle](https://github.com/kuraudowelle), forked from [SukkaW/Surge](https://github.com/SukkaW/Surge) © [Sukka](https://github.com/SukkaW) and its [contributors](https://github.com/SukkaW/Surge/graphs/contributors).
