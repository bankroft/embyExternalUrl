[English](README.md) | [简体中文](README.zh-Hans.md)

# emby2Alist for Nginx-UI

`emby2Alist` 是一套面向 Nginx-UI 场景的 Emby / Jellyfin Nginx + NJS 配置方案。

它的目标是由 Nginx 统一接管播放相关请求，在一个可维护的入口中完成以下能力：

- 直链重定向
- 代理回退
- 图片缓存
- 字幕处理
- 播放信息改写
- 指定接口的请求与响应调整

## 目录结构

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

## 部署方式

### 1. 使用前提

- Nginx 已启用 `ngx_http_js_module`
- Emby / Jellyfin 可以被 Nginx-UI 所在容器或主机访问
- Nginx 运行环境可以读取 Emby 所依赖的媒体路径或 `.strm` 文件
- 如果 Emby 与 Nginx-UI 的挂载路径不同，需要通过路径映射显式转换

### 2. 复制配置

将 `nginx-ui/conf.d/` 下的内容复制到你的 Nginx-UI 配置目录。

### 3. 加载全局配置

将 [`nginx-ui/conf.d/emby.global.conf`](nginx-ui/conf.d/emby.global.conf) 加载到全局 `http {}` 作用域。

这个文件只包含 HTTP 级指令，例如：

- `js_path`
- `js_import`
- `js_shared_dict_zone`
- `proxy_cache_path`

### 4. 加载站点配置

将 [`nginx-ui/conf.d/emby.server.conf`](nginx-ui/conf.d/emby.server.conf) 作为 Emby / Jellyfin 的站点配置使用。

### 5. 配置必要变量

编辑 [`nginx-ui/conf.d/emby.server.conf`](nginx-ui/conf.d/emby.server.conf)，至少设置以下变量：

```nginx
set $emby "http://127.0.0.1:8096";
set $embyApiKey "YOUR_EMBY_API_KEY";
set $embyPathMapping "/media:/mnt";
```

参数说明：

- `$emby`：Emby / Jellyfin 上游地址
- `$embyApiKey`：供 NJS 内部请求使用的 API Key
- `$embyPathMapping`：将 Emby 看到的媒体路径映射为 Nginx 实际可读路径

示例：

- Emby 容器内路径为 `/media`
- Nginx-UI 容器内同一批文件挂载为 `/mnt`

则应配置为：

```nginx
set $embyPathMapping "/media:/mnt";
```

### 6. 验证

```bash
nginx -t
nginx -s reload
```

重载后至少检查以下内容：

- 图片请求是否正常
- 普通播放是否正常
- `.strm` 播放是否正常
- 字幕访问是否正常

## 缓存目录

当前配置使用容器内缓存目录：

- `/var/cache/nginx/images`
- `/var/cache/nginx/subtitles`

如果运行环境不会自动创建这些目录，需要在 Nginx 启动前提前创建。

## 文件与函数说明

### `nginx-ui/conf.d/emby.global.conf`

文件作用：

- 加载所有 NJS 模块
- 声明共享字典
- 声明图片与字幕缓存目录

### `nginx-ui/conf.d/emby.server.conf`

文件作用：

- 定义 Emby / Jellyfin 的 `server` 站点入口
- 暴露 `$emby`、`$embyApiKey`、`$embyPathMapping` 等核心变量
- 将播放、字幕、图片、搜索、系统信息等请求路由到对应 NJS 处理器或上游代理逻辑

关键 `location` 分组：

- 播放相关：视频、音频、下载、直播、主播放列表
- 字幕相关：字幕缓存与虚拟字幕适配
- 图片相关：图片缓存与缓存绕过
- 元数据相关：PlaybackInfo、Items、System Info
- 回退相关：原始代理和内部重定向

### `nginx-ui/conf.d/emby/config.js`

文件作用：

- 集中定义项目配置、规则数组、开关和默认行为

导出对象与函数：

- `mediaMountPath`：本地媒体挂载根路径列表
- `strHead`：内置 UA、IP、客户端识别字符串集合
- `fallbackUseOriginal`：异常时是否回退到原始上游链路
- `redirectConfig`：重定向行为总开关
- `routeCacheConfig`：路由缓存配置
- `routeRule`：路由判定规则
- `mediaPathMapping`：媒体路径映射规则
- `symlinkRule`：软链接解析规则
- `redirectStrmLastLinkRule`：`.strm` 最终链接改写规则
- `clientSelfAlistRule`：面向客户端的自定义直链规则
- `transcodeConfig`：转码相关配置
- `embyNotificationsAdmin`：管理员通知配置
- `embyRedirectSendMessage`：客户端弹窗消息配置
- `itemHiddenRule`：项目过滤规则
- `streamConfig`：流地址相关配置
- `searchConfig`：搜索相关配置
- `directHlsConfig`：直连 HLS 相关配置
- `playbackInfoConfig`：PlaybackInfo 改写配置
- `nginxConfig`：暴露给 NJS 使用的 Nginx 相关配置
- `getDisableDocs(r)`：判断是否隐藏 swagger / openapi 文档入口

### `nginx-ui/conf.d/emby/main.js`

文件作用：

- 这是主流程入口文件，负责播放重定向、PlaybackInfo 改写、播放器脚本改写、阻断与回退逻辑

导出函数：

- `redirect2Pan(r)`：播放重定向主入口，负责提取媒体信息、判断路由模式、读取 `.strm`、决定重定向或回退
- `allowRedirect(r)`：判断当前请求是否允许进入重定向流程
- `fetchEmbyFilePath(itemInfoUri, itemId, Etag, mediaSourceId)`：从 Emby 拉取媒体项信息并提取有效媒体路径
- `transferPlaybackInfo(r)`：拦截并改写 PlaybackInfo 响应
- `modifyBaseHtmlPlayer(r)`：改写 Emby Web 播放器脚本
- `redirect(r, url, cachedRouteDictKey)`：执行外部重定向
- `internalRedirect(r, uri, cachedRouteDictKey)`：执行内部重定向回原始上游
- `internalRedirectExpect(r, uri)`：标准化内部重定向目标
- `blocked(r)`：返回阻断响应

关键内部函数：

- `playbackInfoHandler(r, upstreamBody)`：处理 PlaybackInfo 主逻辑
- `vMediaSourcesHandler(r, upstreamBody)`：注入虚拟媒体源
- `modifyDirectPlayInfo(r, upstreamBody)`：改写直放与直链能力信息
- `modifyDirectPlaySupports(source, flag)`：修改单个媒体源的支持标记
- `modifyDirectStreamUrl(r, source)`：改写 `DirectStreamUrl`
- `mediaSourceBeforeHandler(r, mediaSource)`：媒体源预处理
- `mediaSourcesAfterHandler(r, mediaSources)`：媒体源集合后处理
- `sourcesSortFitHandler(r, mediaSources)`：按照规则对媒体源排序
- `routeCacheL2PreloadHandler(r, mediaSource)`：预热二级路由缓存
- `sendMessage2EmbyDevice(deviceId, header, text, timeoutMs)`：给 Emby 客户端发送消息
- `cachePreload(r, url, cacheLevel)`：按缓存级别预热目标 URL
- `preload(r, url)`：底层预热执行函数
- `redirectAfter(r, url, cachedRouteDictKey)`：重定向后的附加处理
- `internalRedirectAfter(r, uri, cachedRouteDictKey)`：内部重定向后的附加处理
- `blockedAfter(r)`：阻断后的附加处理

### `nginx-ui/conf.d/emby/api/emby-api.js`

文件作用：

- 封装 NJS 内部会调用到的 Emby API 请求

导出对象与函数：

- `PLAY_METHOD_ENUM`：播放方式常量
- `fetchNotificationsAdmin(r, Name, Description)`：发送管理员通知
- `fetchSessionsMessage(r, Id, Header, Text, TimeoutMs)`：向指定会话发送弹窗消息
- `fetchSessions(host, apiKey, queryParams)`：查询会话列表
- `fetchPlaybackInfo(r, itemId)`：请求指定媒体项的 PlaybackInfo
- `fetchItems(host, apiKey, queryParams)`：请求媒体项信息
- `fetchVideosActiveEncodingsDelete(host, apiKey, queryParams)`：删除活动转码任务
- `fetchBaseHtmlPlayer(host, queryParams)`：获取 Web 播放器脚本内容

### `nginx-ui/conf.d/emby/common/events.js`

文件作用：

- 提供轻量级 NJS 生命周期事件封装

导出函数：

- `njsOnExit(mark, callbacks, r)`：注册退出回调并输出开始/结束日志
- `njsOn(eventName, callback)`：对 `njs.on` 的简单封装

内部函数：

- `njsOnBeginNotice(mark)`：输出开始日志
- `njsOnExitNotice(mark)`：输出结束日志

### `nginx-ui/conf.d/emby/common/live-util.js`

文件作用：

- 提供播放列表解析和字幕格式转换工具

导出对象与函数：

- `SUBS_CODEC_ENUM`：字幕编码常量
- `parseM3U8(content)`：解析主播放列表为流、音轨、字幕结构
- `subCodecConvert(data, sourceCodec, targetCodec)`：字幕编码转换，目前主要用于 SRT 转 WebVTT

内部函数：

- `srt2webvtt(data)`：将 SRT 文本转换为 WebVTT
- `convertSrtCue(caption)`：转换单个字幕片段

### `nginx-ui/conf.d/emby/common/periodics.js`

文件作用：

- 提供定时任务处理逻辑

导出函数：

- `logHandler(s)`：用于清理 Nginx 日志

### `nginx-ui/conf.d/emby/common/url-util.js`

文件作用：

- 提供 URL、查询参数、请求上下文、路径解析相关工具函数

导出函数：

- `proxyUri(uri)`：生成内部代理 URI
- `appendUrlArg(u, k, v)`：向 URL 追加查询参数
- `generateUrl(r, host, uri, skipKeys)`：根据请求重建 URL
- `addDefaultApiKey(r, u)`：为 URL 自动补齐默认 API Key
- `getCurrentRequestUrl(r)`：生成当前请求完整 URL
- `getCurrentRequestUrlPrefix(r)`：获取当前请求的协议和主机前缀
- `getDefaultApiKey(r)`：从请求参数或变量中提取 API Key
- `getDeviceId(r)`：从请求中提取设备 ID
- `getMediaSourceId(rArgs)`：从参数中提取媒体源 ID
- `generateDirectStreamUrl(r, mediaSourceId, resourceKey)`：构造直链流地址
- `getFilePathPart(url)`：从 AList / CloudDrive 风格链接中提取文件路径部分
- `parseUrl(url)`：解析 URL 为结构化对象
- `getRealIp(r)`：提取真实客户端 IP

### `nginx-ui/conf.d/emby/common/util.js`

文件作用：

- 提供项目级核心通用工具，覆盖路径映射、路由规则匹配、字符串处理、缓存写入、元数据构造等能力

导出对象与函数：

- `ARGS`：公共请求参数键名常量
- `ROUTE_ENUM`：路由模式常量
- `CHCHE_LEVEL_ENUM`：缓存级别常量
- `SOURCE_STR_ENUM`：源字符串类型常量
- `AUTH_TYPE_ENUM`：认证类型常量
- `doUrlMapping(r, url, notLocal, mappingArr, mark)`：执行路径或 URL 映射
- `copyHeaders(sourceHeaders, targetHeaders, skipKeys)`：复制请求头
- `getRouteMode(r, filePath, isAlistRes, notLocal)`：根据规则判定代理、重定向、阻断或转码模式
- `parseExpression(rootObj, expression, propertySplit, groupSplit)`：按表达式读取对象属性
- `strMapping(type, sourceValue, searchValue, replaceValue)`：按指定模式执行字符串替换
- `strMatches(type, source, target)`：判断字符串或正则是否匹配
- `checkIsStrmByMediaSource(source)`：判断媒体源是否指向 `.strm`
- `checkIsStrmByPath(filePath)`：判断路径是否为 `.strm`
- `isAbsolutePath(filePath)`：判断路径是否为绝对路径
- `getFileNameByPath(filePath)`：提取文件名
- `simpleRuleFilter(r, ruleArr3D, filePath, firstSourceStr, mark)`：执行简单规则过滤
- `getClientSelfAlistLink(r, filePath, alistFilePath)`：生成客户端自定义直链
- `getItemInfo(r)`：从当前请求构造 Emby 项目信息请求
- `dictAdd(dictName, key, value, timeout, isSet)`：写入共享字典
- `cost(func)`：统计函数耗时
- `calculateHMAC(data, key)`：计算 HMAC
- `addAlistSign(url, alistToken, alistSignExpireTime)`：为链接追加 AList 签名
- `checkAndGetRealpathSync(path)`：解析真实路径
- `parseM3U8(content)`：将 M3U8 文本拆为行数组
- `extractQueryValue(url, key)`：从 URL 中提取单个查询参数

关键内部函数：

- `groupBy(array, key)`：对规则或数据分组
- `getMatchedRuleGroupKey(r, groupRuleArr3D, filePath)`：获取命中的规则组
- `getMatchedRule(r, ruleArr3D, filePath)`：获取命中的单条规则
- `getItemIdByUri(uri)`：从 URI 中提取 Emby 项目 ID

### `nginx-ui/conf.d/emby/modules/emby-items.js`

文件作用：

- 处理媒体项列表过滤和最新项目过滤

导出函数：

- `itemsFilter(r)`：过滤 Items 接口返回结果
- `usersItemsLatestFilter(r)`：过滤 `/Users/.../Items/Latest` 返回结果

内部函数：

- `subrequestForPath(r)`：通过子请求补充路径信息

### `nginx-ui/conf.d/emby/modules/emby-live.js`

文件作用：

- 处理直播和主播放列表请求

导出函数：

- `directLive(r)`：决定直播请求是走重定向、保留原始代理，还是转入虚拟媒体逻辑

### `nginx-ui/conf.d/emby/modules/emby-playback-info.js`

文件作用：

- 提供 PlaybackInfo 中媒体源排序能力

导出函数：

- `sourcesSort(mediaSources, rules)`：根据规则对媒体源排序

内部函数：

- `getNestedValue(obj, path)`：按路径读取嵌套字段值

### `nginx-ui/conf.d/emby/modules/emby-search.js`

文件作用：

- 处理搜索相关指令和图片缓存绕过逻辑

导出函数：

- `searchHandle(r)`：处理搜索请求以及内置指令
- `getNocache(r)`：返回图片缓存绕过标记

内部函数：

- `handleHelp(r)`：输出帮助信息
- `handleWithTimeout(r, searchTerm, directiveKey)`：处理带超时写入的指令
- `handleShowDictZoneStat(r, searchTerm)`：查看共享字典统计
- `handleClearDictZone(r, searchTerm)`：清理共享字典

### `nginx-ui/conf.d/emby/modules/emby-system.js`

文件作用：

- 处理 System Info 接口响应改写

导出函数：

- `systemInfoHandler(r)`：获取并改写 `/system/info` 响应

### `nginx-ui/conf.d/emby/modules/emby-v-media.js`

文件作用：

- 处理虚拟媒体源、直连 HLS 和虚拟字幕适配

导出对象与函数：

- `ARGS`：虚拟媒体相关常量
- `vSubtitlesAdepter(r)`：处理虚拟媒体的字幕请求
- `fetchHls(alistFilePath, ua)`：获取 HLS 信息的占位实现
- `checkVirtual(mediaSourceId)`：判断媒体源是否为虚拟媒体
- `fetchHlsWithCache(r, source, playSessionId)`：构建或读取虚拟媒体缓存
- `getVMediaSourceChcheById(vSourceId, ua)`：按 ID 读取虚拟媒体缓存
- `delVMediaSourceChcheById(vSourceId, ua)`：删除虚拟媒体缓存
- `getUrlByVMediaSources(r)`：从虚拟媒体中解析最终播放地址
- `getVMediaSourcesIsPlayback(rArgs)`：在 PlaybackInfo 阶段解析虚拟媒体
- `getVMediaSourcesByHls(r, source, notLocal, playSessionId)`：根据 HLS 生成虚拟媒体源

关键内部函数：

- `generateVMdiaSourceId(oriSourceId, streamIndex)`：生成虚拟媒体源 ID
- `toVMediaSources(parsedM3U8)`：将播放列表结构转换为 Emby 媒体源结构
- `fetchHlsByPlh(r)`：刷新占位型虚拟媒体缓存

## 常见问题

### `SyntaxError: Token "of" not supported in this version`

说明当前 NJS 版本过旧，不支持所使用的语法。需要升级 NJS，或将相关写法改为旧版本兼容形式。

### `mkdir() "/var/cache/nginx/..." failed`

说明缓存目录在容器内不存在。请在启动阶段创建目录，或将 `proxy_cache_path` 调整到一个已存在且可写的目录。

### `cannot get property "embyApiKey" of undefined`

说明某个 NJS 处理函数拿到的请求上下文不完整或传参错误。优先检查 NJS 内部调用链，而不是先排查上游 Emby 服务。
