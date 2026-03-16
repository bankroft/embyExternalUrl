[English](README.md) | [简体中文](README.zh-Hans.md)

# emby2Alist for Nginx-UI

`emby2Alist` is an Nginx + NJS configuration set for Emby or Jellyfin behind Nginx-UI.

It is intended for deployments where Nginx needs to take over playback-related traffic and apply direct redirect, proxy fallback, subtitle handling, image caching, and request/response rewriting in a controlled way.

## Directory Layout

```text
nginx-ui/
└─ conf.d/
   ├─ emby.global.conf
   ├─ emby.server.conf
   └─ emby/
      ├─ config.js
      ├─ main.js
      ├─ api/
      │  └─ emby-api.js
      ├─ common/
      │  ├─ events.js
      │  ├─ live-util.js
      │  ├─ periodics.js
      │  ├─ url-util.js
      │  └─ util.js
      └─ modules/
         ├─ emby-items.js
         ├─ emby-live.js
         ├─ emby-playback-info.js
         ├─ emby-search.js
         ├─ emby-system.js
         └─ emby-v-media.js
```

## Deployment

### 1. Requirements

- Nginx with `ngx_http_js_module`
- Reachable Emby or Jellyfin upstream
- Media paths or `.strm` files readable by the Nginx runtime
- Explicit path mapping if Emby and Nginx use different mount paths

### 2. Copy Configuration

Copy `nginx-ui/conf.d/` into your Nginx-UI configuration directory.

### 3. Load the Global File

Load [`nginx-ui/conf.d/emby.global.conf`](nginx-ui/conf.d/emby.global.conf) from the global `http {}` context.

This file contains only HTTP-scope directives:

- `js_path`
- `js_import`
- `js_shared_dict_zone`
- `proxy_cache_path`

### 4. Load the Site File

Load [`nginx-ui/conf.d/emby.server.conf`](nginx-ui/conf.d/emby.server.conf) as the Emby/Jellyfin site configuration.

### 5. Configure Required Variables

Edit [`nginx-ui/conf.d/emby.server.conf`](nginx-ui/conf.d/emby.server.conf) and set:

```nginx
set $emby "http://127.0.0.1:8096";
set $embyApiKey "YOUR_EMBY_API_KEY";
set $embyPathMapping "/media:/mnt";
```

Meaning:

- `$emby`: upstream Emby/Jellyfin address
- `$embyApiKey`: API key used by internal NJS requests
- `$embyPathMapping`: maps the media path visible to Emby to the path visible to Nginx

### 6. Validate

```bash
nginx -t
nginx -s reload
```

Then verify:

- image requests
- normal playback
- `.strm` playback
- subtitle requests

## Cache Paths

The current configuration uses container-local cache directories:

- `/var/cache/nginx/images`
- `/var/cache/nginx/subtitles`

If your image does not create them automatically, create them before Nginx starts.

## File and Function Reference

### `nginx-ui/conf.d/emby.global.conf`

Purpose:

- Loads all NJS modules
- Declares shared memory dictionaries
- Declares image and subtitle cache paths

### `nginx-ui/conf.d/emby.server.conf`

Purpose:

- Defines the Emby/Jellyfin site `server` block
- Declares upstream-related variables such as `$emby`, `$embyApiKey`, and `$embyPathMapping`
- Routes playback, subtitle, image, websocket, and metadata requests to the proper NJS handlers or upstream proxy rules

Key location groups:

- playback routes: video, audio, download, live, master playlist
- subtitle routes: subtitle proxying and virtual subtitle adaptation
- image routes: image cache and cache bypass handling
- metadata routes: playback info, item list filtering, system info handling
- fallback routes: proxy pass-through and internal redirect targets

### `nginx-ui/conf.d/emby/config.js`

Purpose:

- Central configuration store for route rules, cache behavior, playback flags, and feature toggles

Exports:

- `mediaMountPath`: local media root list
- `strHead`: built-in UA, IP, and client string presets
- `fallbackUseOriginal`: whether to fall back to upstream on failure
- `redirectConfig`: redirect feature switches
- `routeCacheConfig`: route cache settings
- `routeRule`: route decision rules
- `mediaPathMapping`: path mapping rules
- `symlinkRule`: symlink realpath resolution rules
- `redirectStrmLastLinkRule`: final-link rewrite rules for `.strm`
- `clientSelfAlistRule`: client-side self-link mapping rules
- `transcodeConfig`: transcode-related switches
- `embyNotificationsAdmin`: admin notification settings
- `embyRedirectSendMessage`: device message settings
- `itemHiddenRule`: item filtering rules
- `streamConfig`: stream naming and behavior settings
- `searchConfig`: interactive search settings
- `directHlsConfig`: direct HLS settings
- `playbackInfoConfig`: playback-info rewrite settings
- `nginxConfig`: Nginx-related switches exposed to NJS
- `getDisableDocs(r)`: returns whether swagger/openapi endpoints should be hidden

### `nginx-ui/conf.d/emby/main.js`

Purpose:

- Main request orchestration layer for playback redirect and playback-info rewriting

Exported functions:

- `redirect2Pan(r)`: main playback redirect entry; resolves media info, applies route rules, reads `.strm` when needed, and decides redirect or proxy fallback
- `allowRedirect(r)`: checks whether the current request is allowed to leave the normal upstream path
- `fetchEmbyFilePath(itemInfoUri, itemId, Etag, mediaSourceId)`: fetches item metadata from Emby and extracts the effective media path
- `transferPlaybackInfo(r)`: intercepts PlaybackInfo and rewrites media-source payloads before returning it to the client
- `modifyBaseHtmlPlayer(r)`: rewrites Emby web player JavaScript when browser-side behavior needs adjustment
- `redirect(r, url, cachedRouteDictKey)`: performs external redirect and runs post-redirect side effects
- `internalRedirect(r, uri, cachedRouteDictKey)`: performs internal Nginx redirect back to the upstream path
- `internalRedirectExpect(r, uri)`: internal redirect helper used when only the redirect target needs to be normalized
- `blocked(r)`: returns the block response for routes that are explicitly denied

Important internal helpers:

- `playbackInfoHandler(r, upstreamBody)`: main PlaybackInfo response handler
- `vMediaSourcesHandler(r, upstreamBody)`: injects virtual media sources when direct HLS logic is enabled
- `modifyDirectPlayInfo(r, upstreamBody)`: adjusts direct-play and direct-stream capability flags
- `modifyDirectPlaySupports(source, flag)`: toggles support flags on a media source
- `modifyDirectStreamUrl(r, source)`: rewrites `DirectStreamUrl`
- `mediaSourceBeforeHandler(r, mediaSource)`: per-source preprocessing before aggregation
- `mediaSourcesAfterHandler(r, mediaSources)`: postprocessing after all sources are collected
- `sourcesSortFitHandler(r, mediaSources)`: sorts sources according to playback rules
- `routeCacheL2PreloadHandler(r, mediaSource)`: preloads level-2 route cache entries
- `sendMessage2EmbyDevice(deviceId, header, text, timeoutMs)`: pushes a message to an Emby client device
- `cachePreload(r, url, cacheLevel)`: warms cache for redirect targets
- `preload(r, url)`: low-level preload wrapper
- `redirectAfter(r, url, cachedRouteDictKey)`: post-redirect side effects
- `internalRedirectAfter(r, uri, cachedRouteDictKey)`: post-internal-redirect side effects
- `blockedAfter(r)`: post-block cleanup

### `nginx-ui/conf.d/emby/api/emby-api.js`

Purpose:

- Small internal wrapper around Emby API requests used by the NJS handlers

Exports:

- `PLAY_METHOD_ENUM`: playback method constants
- `fetchNotificationsAdmin(r, Name, Description)`: sends an Emby admin notification
- `fetchSessionsMessage(r, Id, Header, Text, TimeoutMs)`: sends a popup message to a specific client session
- `fetchSessions(host, apiKey, queryParams)`: requests session data
- `fetchPlaybackInfo(r, itemId)`: requests PlaybackInfo for an item
- `fetchItems(host, apiKey, queryParams)`: requests item metadata
- `fetchVideosActiveEncodingsDelete(host, apiKey, queryParams)`: stops an active encoding job
- `fetchBaseHtmlPlayer(host, queryParams)`: fetches Emby web player JavaScript for rewrite

### `nginx-ui/conf.d/emby/common/events.js`

Purpose:

- Lightweight NJS lifecycle event helpers

Exports:

- `njsOnExit(mark, callbacks, r)`: registers exit callbacks and emits begin/exit logs
- `njsOn(eventName, callback)`: thin wrapper over `njs.on`

Internal helpers:

- `njsOnBeginNotice(mark)`: begin log helper
- `njsOnExitNotice(mark)`: exit log helper

### `nginx-ui/conf.d/emby/common/live-util.js`

Purpose:

- Subtitle and playlist utility helpers used by virtual media and live playback modules

Exports:

- `SUBS_CODEC_ENUM`: supported subtitle codec constants
- `parseM3U8(content)`: parses master playlist content into stream/audio/subtitle structures
- `subCodecConvert(data, sourceCodec, targetCodec)`: converts subtitle data between codecs, currently focused on SRT to WebVTT

Internal helpers:

- `srt2webvtt(data)`: converts raw SRT content to WebVTT
- `convertSrtCue(caption)`: converts a single SRT cue block

### `nginx-ui/conf.d/emby/common/periodics.js`

Purpose:

- Periodic maintenance helpers

Exports:

- `logHandler(s)`: clears Nginx error/access logs when triggered by periodic tasks

### `nginx-ui/conf.d/emby/common/url-util.js`

Purpose:

- URL, query-string, request-context, and path helpers shared across the project

Exports:

- `proxyUri(uri)`: builds the internal proxy URI
- `appendUrlArg(u, k, v)`: appends a query parameter if it does not already exist
- `generateUrl(r, host, uri, skipKeys)`: rebuilds a request URL with selected arguments
- `addDefaultApiKey(r, u)`: appends the default Emby API key to a URL
- `getCurrentRequestUrl(r)`: builds the current request URL including API key
- `getCurrentRequestUrlPrefix(r)`: returns scheme + host prefix
- `getDefaultApiKey(r)`: resolves the API key from request args or Nginx variables
- `getDeviceId(r)`: extracts the Emby device ID from request args or headers
- `getMediaSourceId(rArgs)`: resolves media-source ID from query parameters
- `generateDirectStreamUrl(r, mediaSourceId, resourceKey)`: builds a direct-stream URL from PlaybackInfo context
- `getFilePathPart(url)`: extracts the path segment from AList or CloudDrive style URLs
- `parseUrl(url)`: parses a URL into protocol, host, port, path, search, and hash
- `getRealIp(r)`: resolves the effective client IP from headers and Nginx variables

### `nginx-ui/conf.d/emby/common/util.js`

Purpose:

- Core shared utilities for route matching, path mapping, string matching, cache writes, and metadata parsing

Exports:

- `ARGS`: shared request argument key constants
- `ROUTE_ENUM`: route decision constants
- `CHCHE_LEVEL_ENUM`: cache level constants
- `SOURCE_STR_ENUM`: source string type constants
- `AUTH_TYPE_ENUM`: authentication type constants
- `doUrlMapping(r, url, notLocal, mappingArr, mark)`: applies path/URL mapping rules
- `copyHeaders(sourceHeaders, targetHeaders, skipKeys)`: copies headers while skipping selected keys
- `getRouteMode(r, filePath, isAlistRes, notLocal)`: resolves redirect, proxy, block, or transcode mode
- `parseExpression(rootObj, expression, propertySplit, groupSplit)`: evaluates a simple property expression against an object
- `strMapping(type, sourceValue, searchValue, replaceValue)`: applies a string replacement strategy
- `strMatches(type, source, target)`: evaluates string or regex match conditions
- `checkIsStrmByMediaSource(source)`: checks whether a media source points to a `.strm`
- `checkIsStrmByPath(filePath)`: checks whether a path ends with `.strm`
- `isAbsolutePath(filePath)`: checks whether a path is absolute
- `getFileNameByPath(filePath)`: extracts the file name from a path
- `simpleRuleFilter(r, ruleArr3D, filePath, firstSourceStr, mark)`: evaluates a simple rule set and returns the matched rule
- `getClientSelfAlistLink(r, filePath, alistFilePath)`: resolves a client-specific direct link override
- `getItemInfo(r)`: builds the Emby item info request and extracts IDs from the current request
- `dictAdd(dictName, key, value, timeout, isSet)`: writes to an Nginx shared dictionary
- `cost(func)`: measures execution time of an async function
- `calculateHMAC(data, key)`: computes HMAC for signed URL generation
- `addAlistSign(url, alistToken, alistSignExpireTime)`: adds AList sign parameters to a URL
- `checkAndGetRealpathSync(path)`: resolves realpath for symlink targets
- `parseM3U8(content)`: parses M3U8 text into line arrays
- `extractQueryValue(url, key)`: extracts a single query parameter from a URL

Important internal helpers:

- `groupBy(array, key)`: groups rules or records by a key
- `getMatchedRuleGroupKey(r, groupRuleArr3D, filePath)`: resolves the matched rule group
- `getMatchedRule(r, ruleArr3D, filePath)`: resolves the matched rule
- `getItemIdByUri(uri)`: extracts Emby item ID from request URI

### `nginx-ui/conf.d/emby/modules/emby-items.js`

Purpose:

- Item-list filtering and latest-item filtering

Exports:

- `itemsFilter(r)`: filters item list responses before returning them to the client
- `usersItemsLatestFilter(r)`: filters `/Users/.../Items/Latest` responses

Internal helpers:

- `subrequestForPath(r)`: fetches item data and path information via subrequest

### `nginx-ui/conf.d/emby/modules/emby-live.js`

Purpose:

- Handles live stream and master-playlist requests

Exports:

- `directLive(r)`: decides whether a live request should be redirected, kept as upstream proxy, or rewritten using virtual media logic

### `nginx-ui/conf.d/emby/modules/emby-playback-info.js`

Purpose:

- Media-source sorting helpers for PlaybackInfo rewrites

Exports:

- `sourcesSort(mediaSources, rules)`: sorts media sources according to configured nested-field rules

Internal helpers:

- `getNestedValue(obj, path)`: resolves nested property values used by the sort logic

### `nginx-ui/conf.d/emby/modules/emby-search.js`

Purpose:

- Handles search-related directives and image-cache bypass behavior

Exports:

- `searchHandle(r)`: intercepts search requests and processes built-in command-like directives
- `getNocache(r)`: returns the cache-bypass flag used by image requests

Internal helpers:

- `handleHelp(r)`: returns help output for search directives
- `handleWithTimeout(r, searchTerm, directiveKey)`: handles directives that write with timeout semantics
- `handleShowDictZoneStat(r, searchTerm)`: shows dictionary zone statistics
- `handleClearDictZone(r, searchTerm)`: clears a shared dictionary zone

### `nginx-ui/conf.d/emby/modules/emby-system.js`

Purpose:

- Rewrites Emby system-info responses when needed

Exports:

- `systemInfoHandler(r)`: fetches and rewrites `/system/info` before returning it to the client

### `nginx-ui/conf.d/emby/modules/emby-v-media.js`

Purpose:

- Virtual media-source handling for direct HLS and subtitle adaptation

Exports:

- `ARGS`: virtual-media constants
- `vSubtitlesAdepter(r)`: adapts subtitle requests for virtual media sources
- `fetchHls(alistFilePath, ua)`: placeholder HLS fetch function
- `checkVirtual(mediaSourceId)`: checks whether a media-source ID belongs to a virtual source
- `fetchHlsWithCache(r, source, playSessionId)`: builds or retrieves cached virtual media sources
- `getVMediaSourceChcheById(vSourceId, ua)`: reads a virtual media source from cache
- `delVMediaSourceChcheById(vSourceId, ua)`: removes a cached virtual media source
- `getUrlByVMediaSources(r)`: resolves the final playback URL from virtual media sources
- `getVMediaSourcesIsPlayback(rArgs)`: resolves virtual media source data during PlaybackInfo handling
- `getVMediaSourcesByHls(r, source, notLocal, playSessionId)`: generates virtual media sources from HLS input

Important internal helpers:

- `generateVMdiaSourceId(oriSourceId, streamIndex)`: builds a virtual media-source ID
- `toVMediaSources(parsedM3U8)`: converts parsed playlist data into Emby-style media-source objects
- `fetchHlsByPlh(r)`: refreshes placeholder virtual media entries

## Troubleshooting

### `SyntaxError: Token "of" not supported in this version`

Your NJS runtime is too old for the syntax being used. Upgrade NJS or rewrite unsupported syntax to an older-compatible form.

### `mkdir() "/var/cache/nginx/..." failed`

The cache directory does not exist in the container. Create it at startup or change `proxy_cache_path` to an existing writable directory.

### `cannot get property "embyApiKey" of undefined`

This usually means a request context object was passed incorrectly inside the NJS calling chain. Check the caller before debugging the upstream Emby service.
