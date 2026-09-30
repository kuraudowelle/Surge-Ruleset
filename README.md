# Surge Ruleset

Ruleset snippets for [Surge](https://nssurge.com/), maintained by [kuraudowelle](https://github.com/kuraudowelle) for personal use. Based on [SukkaW/Surge](https://github.com/SukkaW/Surge) (AGPL-3.0), now maintained as an independent repository.

## Terms and License

Except for the `List/ip/china_ip.conf` file, which is shared under the CC BY-SA 2.0 license, this project is open-sourced under the AGPL-3.0 license and comes with no warranty of any kind. That is: **the author and all contributors of this project provide no technical support and are not responsible for any loss you may suffer**, including but not limited to: your software failing to start or work properly, kernel panics, your device failing to boot or work normally, hard drive damage or data loss, atomic bomb explosions, World War III, or a global CK-class reality-restructuring scenario that even the [SCP Foundation](https://scp-wiki.wikidot.com/) cannot stop.

If you are using a commercial public proxy service, be sure to read the service provider's Terms of Service (ToS) carefully first. The ToS of some public proxy providers state that using any third-party rule files is treated as automatically waiving the SLA and technical support.

The ruleset files are served from this repository through `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/`. You can also get the source code of this project and build the ruleset files yourself.

The built files (`List/`, `Modules/`, `Mock/` and `Internal/`) are rebuilt by the [Build workflow](.github/workflows/main.yml) twice a day (05:17 and 17:17 UTC) and on every push to `master`, and the workflow commits the result back to `master`. Edit the sources in `Source/` and `Build/`, not the generated files. Hand-written modules and mocks live next to the generated ones in `Modules/` and `Mock/`. To delete a published file that is no longer generated, add it to `REMOVED_FILES` in [`build-deprecate-files.ts`](Build/build-deprecate-files.ts).

The rulesets of the services and of the categories below (from Speedtest to Common Services in Other Countries and Regions) are made on every build of what the owner of a service publishes where there is something that a build can read, and of the lists that the community keeps ([v2fly/domain-list-community](https://github.com/v2fly/domain-list-community), downloaded as [the one file that v2fly builds of all its lists](https://github.com/v2fly/domain-list-community/tree/release)) where there is not. Nobody keeps their domains by hand. What no list of domains can carry (a process, a URL) is written by hand in a few short files, and the sections below name them.

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
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject-drop.conf,REJECT-DROP,pre-matching

# Base list: 120,000 blocked domains
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/reject.conf,REJECT,extended-matching
# Extra 90,000 blocked domains, a supplement to the base list; must be used together with the base list
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/reject_extra.conf,REJECT
# Phishing site blocklist, 130,000 blocked domains in total
# On Surge 5 for Mac (or newer), enabling both the base and extra blocked domains at the same time will not degrade matching performance or cause excessive memory usage
# DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/reject_phishing.conf,REJECT
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject.conf,REJECT,extended-matching
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject-no-drop.conf,REJECT-NO-DROP,extended-matching
# URL-REGEX
# Must be used together with the Surge module https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_mitm_hostnames.sgmodule
# MITM and URL-REGEX have a very high performance overhead and are not recommended
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reject-url-regex.conf,REJECT
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/reject.conf,REJECT-DROP
```

#### Speedtest Domains

- Automatically generated
- `speedtest.net` test points: the domains of speed test servers in dozens of common regions, fetched through the Speedtest API (a slice of the regions on each build, and the list keeps the domains of the earlier builds, so it grows)
- The backend servers that [LibreSpeed](https://librespeed.org/backend-servers/servers.php) publishes, and the endpoints of macOS `networkQuality`, from [the configuration that Apple's tool downloads](https://mensura.cdn-apple.com/api/v1/gm/config)
- The sites and servers of the other speed test tools (Cloudflare, M-Lab, OpenSpeedTest, nPerf, ...): [`category-speedtest`](https://github.com/v2fly/domain-list-community/blob/master/data/category-speedtest) of the community
- `fast.com` itself is in the list, but its test points share infrastructure and domains with the Netflix CDN and would affect streaming traffic routing, so they are not included in this ruleset
- Lets you run speed tests over a designated network egress without affecting normal internet access through the primary egress

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/speedtest.conf,[Replace with your policy],extended-matching
```

#### Common Static CDNs

- Automatically generated
- The CDNs that the community lists ([`category-cdn-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-cdn-!cn): jsDelivr, cdnjs, esm.sh, imgix, Bunny, Gcore, CDN77, ...) and the [public gateways of IPFS](https://github.com/ipfs/public-gateway-checker), which the IPFS project lists
- Akamai, Cloudflare and Fastly are not in it, although the community lists them as CDNs. AbemaTV, DAZN, Bilibili International, Spotify and other services that have rulesets of their own are hosted on them, and this ruleset comes before theirs: a rule for a whole network would take their traffic away from them
- The object storage domains are in [Large File Downloads](#large-file-downloads-software-updates-operating-systems-etc)
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes
- Includes some domains that are not in `global.conf`, so even if you have no use for the low-rate nodes offered by commercial public proxy services and do not need to split this traffic, it is still recommended to use these rules; in that case, just assign them the same policy as `global.conf`

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/cdn.conf,[Replace with your policy]
```

#### Streaming

- Automatically generated on every build: each service is made of the list that the community keeps for it ([v2fly/domain-list-community](https://github.com/v2fly/domain-list-community/tree/master/data)), and the addresses of Netflix are the ones that its owner announces itself (AS2906, which [RIPEstat](https://stat.ripe.net/docs/02.data-api/announced-prefixes.html) lists). [`Source/stream.ts`](Source/stream.ts) says which list is which service, and which region a service belongs to
- Includes AbemaTV, Amazon Prime Video, Apple TV, Bahamut, BBC, Bilibili Intl, DAZN, Deezer, Disney+ (with Hulu, ESPN, Hotstar, ...), Discovery+, DMM, HBO, Hulu, iQiYi Global, KKBOX, KKTV, Line TV, LiTV, myTV Super, Netflix, niconico, NHK, PBS, Pluto TV, Pornhub, SHOWTIME, SoundCloud, Spotify, TIDAL, Tubi TV, TVer, Twitch, and Viu / ViuTV
- A service is only in it if the community has a list that is about that service and nothing else. There is none for 4gtv, All4, Apple Music TV, Crackle, encoreTVB, Fox Now, Fox+, Friday, Himalaya, Hulu Japan (the list of Hulu has `hulu.jp`, and not the rest of it), HWTV, ITV, JOOX, MangaFox, My5, Naver TV, Now E, Overcast, Pandora, Paramount+, Peacock, TaiwanGood, TVB Anywhere, Vudu and WeTV, so they are not in these rulesets. The lists of a whole company (Fox, Naver, CBS, NBCUniversal, TVB) would send all of the company to the policy of a streaming service. `USER-AGENT` and `PROCESS-NAME` rules of apps are not in them either: no list carries them
- YouTube, YouTube Music and TikTok have rulesets of their own (below), they are not in these
- No service of South Korea is left, so `stream_kr` is empty

```ini
# Non IP
# North America-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_us.conf,[Replace with your policy]
# Europe-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_eu.conf,[Replace with your policy]
# Japan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_jp.conf,[Replace with your policy]
# South Korea-related streaming services (none at the moment)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_kr.conf,[Replace with your policy]
# Hong Kong-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_hk.conf,[Replace with your policy]
# Taiwan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream_tw.conf,[Replace with your policy]
# All streaming services (including all of the above)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/stream.conf,[Replace with your policy]
```

```ini
# IP
# North America-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream_us.conf,[Replace with your policy]
# Europe-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream_eu.conf,[Replace with your policy]
# Japan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream_jp.conf,[Replace with your policy]
# South Korea-related streaming services (none at the moment)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream_kr.conf,[Replace with your policy]
# Hong Kong-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream_hk.conf,[Replace with your policy]
# Taiwan-related streaming services
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream_tw.conf,[Replace with your policy]
# All streaming services (including all of the above)
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/stream.conf,[Replace with your policy]
```

#### AI

- Domain rules: automatically generated from the list that the community keeps for the AI services that are not in mainland China ([`category-ai-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-ai-!cn): OpenAI, Claude, Gemini, Perplexity, Grok, Copilot, Cursor, Mistral, and more), plus the one rule that no list of domains can carry, the page that the site of Gemini sends a client to when it does not like its IP address (it needs MITM on `www.google.com`, see [`Source/non_ip/ai.conf`](Source/non_ip/ai.conf))
- IP rules: automatically generated from the ranges of ChatGPT Voice that OpenAI [publishes itself](https://openai.com/chatgpt-voice.json)
- `apple_intelligence.conf`: automatically generated from [`apple-intelligence`](https://github.com/v2fly/domain-list-community/blob/master/data/apple-intelligence) of the community

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/ai.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/apple_intelligence.conf,[Replace with your policy],extended-matching
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/ai.conf,[Replace with your policy]
```

#### Reddit / Homebrew / GitHub / TikTok / YouTube / YouTube Music / Google / Gemini / Antigravity

- Automatically generated on every build, from the source that is closest to the service: what its owner publishes, where the owner publishes something that a build can read, and the list that the community keeps ([v2fly/domain-list-community](https://github.com/v2fly/domain-list-community/tree/master/data)) where the owner does not. Every file says which of the two it is made from
- One file per service, so every service can go to its own policy

| Ruleset | Built from | Source |
| --- | --- | --- |
| `github.conf` (Non IP and IP) | GitHub's own [meta API](https://docs.github.com/en/rest/meta/meta): the domains of `website`, `codespaces`, `copilot`, `packages`, `storage` and `actions`, and the services of `artifact_attestations`; the IP ranges of `web`, `api`, `git`, `pages` and `packages`. GitHub says that neither list is meant to be exhaustive. It lists what its services need, which includes domains of Microsoft and Azure, so a wildcard is only kept on a domain of GitHub (named after it, or `ghcr.io`); hostnames are kept as listed | Official |
| `homebrew.conf` | The defaults that Homebrew defines in its own [source code](https://github.com/Homebrew/brew/blob/HEAD/Library/Homebrew/brew.sh) for the API, the bottles and the git remotes (`HOMEBREW_*_DEFAULT_*`) | Official |
| `google.conf` (IP) | Google's own [`goog.json`](https://www.gstatic.com/ipranges/goog.json) without [`cloud.json`](https://www.gstatic.com/ipranges/cloud.json), which is what [Google documents](https://support.google.com/a/answer/10026322) for the ranges of its own services. All of Google is in it, so YouTube and Gemini are, but cannot be told apart by their addresses | Official |
| `google.conf` (Non IP) | [`google`](https://github.com/v2fly/domain-list-community/blob/master/data/google), and the lists it includes (YouTube, Firebase, Android, Google Play, ...) | Community |
| `youtube.conf` | [`youtube`](https://github.com/v2fly/domain-list-community/blob/master/data/youtube) | Community |
| `gemini.conf` | [`google-gemini`](https://github.com/v2fly/domain-list-community/blob/master/data/google-gemini): Gemini and the Google AI products that list groups with it (AI Studio, NotebookLM, Jules, Antigravity, ...) | Community |
| `antigravity.conf` | Taken from the `google-gemini` list above: the hostnames that contain `antigravity`. What Antigravity shares with the other Google AI products is in `gemini.conf` | Community |
| `reddit.conf` | [`reddit`](https://github.com/v2fly/domain-list-community/blob/master/data/reddit) | Community |
| `tiktok.conf` | [`tiktok`](https://github.com/v2fly/domain-list-community/blob/master/data/tiktok) | Community |
| `youtubemusic.conf` | The only one that is not generated: [the file](Source/non_ip/youtubemusic.conf) has what sets YouTube Music apart from YouTube, whose domains it shares (its hostname and its `USER-AGENT` rules) | Manually maintained |

Why the others are community lists: no list of their domains that a build can read was found for them.

- **Google** publishes its IP ranges (above), and its domains as pages for admins only: a [Chrome hostname allowlist](https://support.google.com/chrome/a/answer/6334001), a [Google Workspace one](https://knowledge.workspace.google.com/admin/getting-started/set-up-a-google-workspace-host-name-allowlist) and the [setup of Gemini Code Assist](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini). They list what those products need, not YouTube or Gemini as a whole. Google's [API Discovery directory](https://www.googleapis.com/discovery/v1/apis) has 535 APIs, and not the Gemini API (`generativelanguage`)
- **Reddit** is served from Fastly: `www.reddit.com` is a CNAME for `reddit.map.fastly.net`, and its addresses are inside the [ranges that Fastly publishes](https://api.fastly.com/public-ip-list) for all of its customers, so no list of addresses can tell Reddit apart. The [registry data](https://stat.ripe.net/) does not help either: the ASN that is often given for Reddit, AS22697, is registered to Roblox
- **TikTok**, **Antigravity** and **YouTube Music** publish nothing of the kind

> The rulesets overlap (`google.conf` has YouTube and the Google AI products, `gemini.conf` has Antigravity, `homebrew.conf` has hosts of GitHub), and a connection follows the first rule that matches, so put the more specific rulesets first, as below.
>
> The lists of the owners are made for networks that have to allow a service, and the lists of the community for routing it, so they do not have to agree. GitHub says that its own are not exhaustive. `USER-AGENT`, `PROCESS-NAME` and `URL-REGEX` rules cannot come from a list of domains either.
>
> A service whose data is gone or empty does not hold back the other rulesets: its file stays as the last build left it, and the build log says so (on GitHub Actions also as a warning on the workflow run). The build asks GitHub without a token unless `GITHUB_TOKEN` is set, which the workflow does to stay clear of the 60 requests an hour of an anonymous client.

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/youtubemusic.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/youtube.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/antigravity.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/gemini.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/github.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/homebrew.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/reddit.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/tiktok.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/google.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/github.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/google.conf,[Replace with your policy]
```

#### Telegram

- Domain rules: automatically generated from the [v2fly/domain-list-community `telegram`](https://github.com/v2fly/domain-list-community/blob/master/data/telegram) list, plus [a few extra domains](Source/non_ip/telegram.conf) and `PROTOCOL,MTProto` (see [Surge as an MTProto proxy server](#surge-as-an-mtproto-proxy-server))
- IP CIDR rules: automatically generated (data sources: [`https://core.telegram.org/resources/cidr.txt`](https://core.telegram.org/resources/cidr.txt), and the DC mapping that Telegram itself hands out to its clients: `help.getConfig` over MTProto plus Telegram's signed backup endpoints)
- ASN rules: automatically generated: the ASNs that announce the IP ranges above, found through [Team Cymru's IP to ASN mapping](https://team-cymru.com/community-services/ip-asn-mapping/) and kept while the AS is registered to Telegram, plus the [known ASNs](Source/ip/telegram_asn.conf) (where the lookup starts, and what is used when it fails)
- MTProto DC mapping: automatically generated, [`Internal/mtproto-dc-config.json`](Internal/mtproto-dc-config.json)

> Using only the IP CIDR rules is recommended. The IP CIDR rule data comes entirely from data published by Telegram itself and does not include the IPs of CDNs and data centers that Telegram has not yet put into use.
> The ASN rules are only suitable as a supplement; using them together with an unofficial MaxMind GeoLite database (such as GeoIP2-CN) will affect matching.

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/telegram.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/telegram.conf,[Replace with your policy]
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/telegram_asn.conf,[Replace with your policy]
```

##### Surge as an MTProto proxy server

Surge (iOS 5.21.0+, Mac 6.8.0+) can act as an [MTProto proxy server](https://manual.nssurge.com/features/mtproto.html) for Telegram. The Telegram client connects to a port on Surge and only says which Telegram data center (DC) it needs; Surge picks a current endpoint of that DC from its DC mapping and evaluates the connection with the normal rules. The target of such a connection is normally a Telegram IP address, not a hostname, so domain rules normally cannot match it. According to the manual, `PROTOCOL,MTProto` matches all of this traffic, and IP rules, ASN rules and a Telegram ruleset that contains the mapped addresses are the most reliable choices. The rulesets above are built for that:

- `List/non_ip/telegram.conf` contains `PROTOCOL,MTProto`. The manual says a rule set skips the lines it cannot parse instead of failing as a whole, so a Surge older than the version above should only lose this line
- `List/ip/telegram.conf` always contains every address of the DC mapping published in [`Internal/mtproto-dc-config.json`](Internal/mtproto-dc-config.json): Telegram's published ranges alone do not cover all of them, so the missing ones are added on every build

The rulesets only route the traffic; the listener itself is set up in your profile. A minimal `[MTProto]` section, following the manual's quick start (see the manual for every option):

```ini
[MTProto]
interface = 127.0.0.1
port = 5753
# 32 hexadecimal characters, generate them with: openssl rand -hex 16
secret = [Replace with your secret]
ipv6 = true
```

> `ipv6 = true` makes Surge use only the IPv6 endpoints of Telegram's data centers (the default is IPv4 only). The manual notes that Telegram's IPv4 servers can hang while its IPv6 ones do not, but the device and every outbound proxy on the path must then be able to carry IPv6.

> Surge ships a snapshot of the DC mapping and refreshes it from a default URL that the manual lists, when its stored copy is missing or older than 30 days. It keeps serving the copy it has if a download fails, and the download follows your normal rules, so the host of the URL must be reachable through the policy that matches it.
>
> `dc-config-url` replaces that URL. [`Internal/mtproto-dc-config.json`](Internal/mtproto-dc-config.json) has the format the manual asks for, but it is not the plain `help.getConfig` result that the manual says a custom mapping should publish: it also holds endpoints from Telegram's signed backup configuration and its built-in DC addresses, and it is sorted by DC and address, while Surge takes the first suitable endpoint in file order. Point `dc-config-url` at it only if you want exactly that file.

#### Apple CDN

- Automatically generated
- This ruleset contains the domains of Apple, Inc. that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/apple.china.conf)

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/apple_cdn.conf,[Replace with your policy]
```

#### Apple Service

- Automatically generated
- Domains: the list that the community keeps for Apple ([`apple`](https://github.com/v2fly/domain-list-community/blob/master/data/apple), which includes iCloud, iTunes, Apple Music, Apple TV+, the developer and software update domains, ...), without the entries that it marks as hosted in mainland China (they are in Apple CN below). Apple documents its domains for admins to read, not in a form that a build can read
- Addresses: the ones that Apple announces itself, from AS714 and AS6185, as [RIPEstat](https://stat.ripe.net/docs/02.data-api/announced-prefixes.html) sees them
- The system processes of Apple that connect without a domain, which no list can carry, are written by hand in [`Source/non_ip/apple_services.conf`](Source/non_ip/apple_services.conf)

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/apple_services.conf,[Replace with your policy]
```

#### Apple CN

- Automatically generated
- The part of the same list that the community marks as hosted in mainland China (`@cn`): Cloud Guizhou (`icloud.com.cn`), the mainland-China-only edition of Apple Maps, the App Store of mainland China, and more

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/apple_cn.conf,DIRECT
```

#### Microsoft Teams

- Automatically generated
- Data source: Microsoft's official [Microsoft 365 endpoints web service](https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service) (service area `Skype`, which is Microsoft Teams)
- Place these before the Microsoft ruleset, otherwise the broader `microsoft.conf` matches first

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/teams.conf,[Replace with your policy]
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/teams.conf,[Replace with your policy]
```

#### Microsoft CDN

- Automatically generated
- This ruleset contains the domains of Microsoft that have completed the MIIT ICP filing and the public security network filing in the People's Republic of China and provide HTTP services within the People's Republic of China. If for some reason you need to proxy some of these domains, write your own rules for those domains and add them before this ruleset.
- Data source: [`felixonmars/dnsmasq-china-list`](https://github.com/felixonmars/dnsmasq-china-list/blob/master/accelerated-domains.china.conf)

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/microsoft_cdn.conf,[Replace with your policy]
```

#### Microsoft

- Automatically generated from the list that the community keeps for Microsoft ([`microsoft`](https://github.com/v2fly/domain-list-community/blob/master/data/microsoft): Office 365, OneDrive, Outlook, Xbox, Bing, Azure, Windows Update, ...), without the entries that it marks as hosted in mainland China, and without GitHub, which has a ruleset of its own above
- Microsoft publishes the endpoints of Microsoft 365 for admins to read, but they only hold Microsoft 365, and they add the domains of the certificate authorities that it needs, which are not Microsoft's to route. The domains of Teams, which Microsoft does publish, are in the ruleset above

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/microsoft.conf,[Replace with your policy]
```

#### Large File Downloads (Software Updates, Operating Systems, etc.)

- Automatically generated
- Object storage: the domains that the providers register in the [Public Suffix List](https://publicsuffix.org/) for their buckets (Amazon S3, Scaleway, Sakura)
- What the community keeps for the downloads of game platforms (Steam, Epic, Blizzard, Riot, Xbox, PlayStation, Nintendo, ...), for the software updates of Apple devices that Apple documents, and for the registries of containers (Docker Hub, GHCR, Quay, ...). The CDNs of the game platforms inside mainland China are left out, they are for `domestic`
- Mirrors and package registries that nobody lists in one place (Linux distribution mirrors, npm, PyPI, ...) are not in it
- These domains may include Microsoft and Apple CDN nodes inside mainland China. You can use them together with the Microsoft CDN and Apple CDN rulesets above and assign the direct policy.
- If you are using a commercial public proxy service and your provider offers nodes that bill traffic consumption at a low rate multiplier, you can use the rulesets above to route traffic to those nodes

```ini
DOMAIN-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/domainset/download.conf,[Replace with your policy]
```

#### Intranet Domains and LAN IPs

- Automatically generated
- Domains: the list that the community keeps for private networks ([`private`](https://github.com/v2fly/domain-list-community/blob/master/data/private)). It follows the IANA registries of the special-use domain names and of the locally-served DNS zones, and adds the names that routers and local tools answer for. It contains `.local` and the `in-addr.arpa` domains of LAN IPs (i.e., AS112 domains). These domains are generally resolved to LAN IPs, need to be resolved by the internal DNS, and need to be accessed directly.
- IPs: the ranges that the community keeps for addresses that are not on the internet ([`private.txt`](https://github.com/v2fly/geoip/blob/release/text/private.txt)), without `198.18.0.0/15`, which Surge and other tools use for virtual IPs

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/lan.conf,DIRECT
```

```ini
# IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/lan.conf,DIRECT
```

#### Common Mainland China Services

- Automatically generated from the list that the community keeps for the domains of mainland China ([`cn`](https://github.com/v2fly/domain-list-community/blob/master/data/cn): its services, the `.cn` domains, and what the lists of foreign companies mark as hosted there), and the domains that the Local DNS Mapping module of this project gives a DNS to ([`Source/non_ip/domestic.ts`](Source/non_ip/domestic.ts))
- For matching by IP address, use the [chnroute CIDR](#chnroute-cidr) ruleset below

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/domestic.conf,DIRECT
```

#### Services That Should Go Direct

- Automatically generated
- PT sites ([`category-pt`](https://github.com/v2fly/domain-list-community/blob/master/data/category-pt)), academic publishers and databases ([`category-scholar-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-scholar-!cn) and [`category-scholar-cn`](https://github.com/v2fly/domain-list-community/blob/master/data/category-scholar-cn)) and Xunlei, from the lists of the community, and the hotspot authentication (captive portal) pages and the pages of routers that the Local DNS Mapping module of this project knows ([`Source/non_ip/direct.ts`](Source/non_ip/direct.ts))
- The process names of proxy tools and download tools, which no list of domains can carry, are written by hand in [`Source/non_ip/direct.conf`](Source/non_ip/direct.conf)
- Just use DIRECT

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/direct.conf,DIRECT
```

#### Common Services in Other Countries and Regions

- Automatically generated from the lists that the community keeps: [`geolocation-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/geolocation-!cn), the common services from other countries and regions, such as Google, Reddit, Facebook, Twitter, Discord, and GitHub, and [`tld-!cn`](https://github.com/v2fly/domain-list-community/blob/master/data/tld-!cn), the ccTLDs and gTLDs of other countries and regions
- For these rules, just use a proxy

```ini
# Non IP
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/non_ip/global.conf,Proxy
```

#### chnroute CIDR

- Automatically generated
- IPv4 [raw data](https://github.com/misakaio/chnroutes2) is published by Misaka Network, Inc. under the [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) license. The Hong Kong segments announced by China Mobile International (CMI) that Misaka Network, Inc. collected by mistake (`223.118.0.0/15` and `223.120.0.0/15`) are excluded
- IPv6 raw data is published by [gaoyifan/china-operator-ip](https://github.com/gaoyifan/china-operator-ip) under the MIT license

```ini
RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/china_ip.conf,[Replace with your policy]
# Only use it if you are using IPv6
# RULE-SET,https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/ip/china_ip_ipv6.conf,[Replace with your policy]
```

## Surge Module List

- URL Redirect: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_url_redirect.sgmodule`
- URL Redirect (Minimum): `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_url_redirect_minimum.sgmodule`
- Surge Network Test Domain: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_surge_network_test_domain.sgmodule`
- MITM Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_mitm_hostnames.sgmodule`
- MITM All Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_mitm_all_hostnames.sgmodule`
- Common Always Real IP Hostnames: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/sukka_common_always_realip.sgmodule`
- Redirect Google CN to Google: `https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/google_cn_307.sgmodule`

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
