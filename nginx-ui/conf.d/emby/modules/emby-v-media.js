// @author: itinybad
// @date: 2024-08-03

import config from "../config.js";
import util from "../common/util.js";
import urlUtil from "../common/url-util.js";
import liveUtil from "../common/live-util.js";
import events from "../common/events.js";
// import emby from "../main.js";
// import embyApi from "../api/emby-api.js";
import qs from "querystring";

const ARGS = {
  idSplit: "_",
  virtualPrefix: "virtual",
};

async function vSubtitlesAdepter(r) {
  events.njsOnExit(`vSubtitlesAdepter: ${r.uri}`);

  const ua = r.headersIn["User-Agent"];
  r.warn(`vSubtitlesAdepter, UA: ${ua}`);

  const uriParts = r.uri.split("/");
  const subtitlesIndex = uriParts.indexOf("Subtitles");
  const mediaSourceId = uriParts[subtitlesIndex - 1];
  const mediaStreamIndex = uriParts[subtitlesIndex + 1];

  const vMediaSource = getVMediaSourceChcheById(mediaSourceId, ua);
  if (!vMediaSource) {
    return r.return(404);
  }
  const subtitle = vMediaSource.MediaStreams[mediaStreamIndex];
  let subtitleData = await util.cost(async function fetchSubtitle() {
    // Subtitles not have UA check,but already payload
    return await (await ngx.fetch(subtitle["XUrl"], { headers: { "User-Agent": ua} })).text();
  });
  // !!!important, emby web hls only support vtt, and first line must be WEBVTT
  // <track> load: srt => vtt, <canvas> load ass not need convert
  if (subtitle.Codec !== liveUtil.SUBS_CODEC_ENUM.webvtt) {
    const convertedData = liveUtil.subCodecConvert(subtitleData, subtitle.Codec);
    if (convertedData) {
      r.warn(`vSubtitlesAdepter convert ${subtitle.Codec} => ${liveUtil.SUBS_CODEC_ENUM.webvtt}`);
      subtitleData = convertedData;
    }
  }
  return r.return(200, subtitleData);
}

async function fetchHls(alistFilePath, ua) {
  // Removed Alist and 115 HLS parsing because this is a direct STRM version without Alist dependency.
  return null;
}

function generateVMdiaSourceId(oriSourceId, streamIndex) {
  return `virtual-transcoded${ARGS.idSplit}${oriSourceId}${ARGS.idSplit}${streamIndex}`;
}

function checkVirtual(mediaSourceId) {
  return mediaSourceId.includes(ARGS.virtualPrefix);
}

function toVMediaSources(parsedM3U8) {
  const vSources = [];
  parsedM3U8.streams.map((stream, streamI) => {
    // virtual live stream behavior
    const Id = generateVMdiaSourceId(parsedM3U8.XId, streamI);
    const MediaStreams = [];
    if (parsedM3U8.subtitles) {
      parsedM3U8.subtitles.map((subtitle, subtitleI) => {
        // !!!important, Protocol: "Http", IsExternalUrl: true, maybe only support web client
        MediaStreams.push({
          Codec: subtitle.type,
          // Language: "chi",
          // Title: "简体",
          DisplayTitle: subtitle.title,
          IsDefault: subtitle.isDefault,
          // IsForced: subtitleI === 0,
          Type: "Subtitle",
          Index: subtitleI,
          IsExternal: true,
          DeliveryMethod: "External",
          // Unsafe attempt to load URL xxx from frame with URL xxx Domains, protocols and ports must match.
          DeliveryUrl: `/Videos/${parsedM3U8.ItemId}/${Id}/Subtitles/${subtitleI}/0/Stream.${subtitle.type}?api_key=${parsedM3U8.api_key}`,
          IsExternalUrl: false,
          IsTextSubtitleStream: true,
          SupportsExternalStream: true,
          // Path: `Stream.${subtitle.type}`,
          Protocol: "File",
          // SubtitleLocationType: "InternalStream",
          XUrl: subtitle.url,
        })
      })
    }
    let Name = `网盘转码直链[${parsedM3U8.ItemId}]`;
    if (parsedM3U8.namePrefix) {
      Name = parsedM3U8.namePrefix + Name;
    }
    if (stream.quality) {
      Name += ` - ${stream.quality}`;
    }
    if (stream.resolution) {
      Name += ` (${stream.resolution}P)`;
    }
    const RequiredHttpHeaders = {};
    if (parsedM3U8.ua) {
      RequiredHttpHeaders["User-Agent"] = parsedM3U8.ua;
    }
    vSources.push({
      // Container: "hls",
      Id,
      MediaStreams,
      Name,
      Path: stream.url,
      Protocol: "Http",
      RequiredHttpHeaders,
      IsRemote: true,
      SupportsDirectPlay: true,
      SupportsDirectStream: true,
      SupportsTranscoding: false,
      // some origin MediaSource and Extra fields
      ItemId: parsedM3U8.ItemId,
      XName: parsedM3U8.XName,
      XId: parsedM3U8.XId,
      XPath: parsedM3U8.XPath,
      XIsPlaceholder: parsedM3U8.XIsPlaceholder,
      XPlaySessionId: parsedM3U8.XPlaySessionId,
      // XparsedM3U8: parsedM3U8, // for debug
    });
  });
  return vSources;
}

async function fetchHlsWithCache(r, source, playSessionId) {
  const isVirtual = checkVirtual(source.Id);
  const mediaSourceId = isVirtual ? source.XId : source.Id;
  const sourcePath = isVirtual ? source.XPath : source.Path;
  const cacheKey = mediaSourceId;
  let vMediaSources = ngx.shared["versionDict"].get(cacheKey);
  if (vMediaSources && !isVirtual) {
    ngx.log(ngx.WARN, `PlaybackInfo isPlayback false, source param is original`);
    vMediaSources = JSON.parse(vMediaSources);
  } else {
    let parsedM3U8 = null;
    if (!isVirtual) {
      parsedM3U8 = { streams: [{ url: sourcePath }], audios: [], subtitles: [] };
      ngx.log(ngx.WARN, `fetchHlsWithCache used fast placeholder version`);
    } else {
      const ua = r.headersIn["User-Agent"];
      ngx.log(ngx.WARN, `fetchHls, UA: ${ua}`);
      parsedM3U8 = await fetchHls(sourcePath, ua);
      parsedM3U8.XIsFetchHls = true;
      ngx.log(ngx.WARN, `fetchHlsWithCache get slow hls version`);
    }
    ngx.log(ngx.INFO, `fetchHlsWithCache parsedM3U8: ${JSON.stringify(parsedM3U8)}`);
    parsedM3U8.ItemId = source.ItemId;
    parsedM3U8.XName = isVirtual ? source.XName : source.Name;
    parsedM3U8.XId = isVirtual ? source.XId : source.Id;
    parsedM3U8.XPath = sourcePath;
    parsedM3U8.XIsPlaceholder = !isVirtual;
    parsedM3U8.XPlaySessionId = playSessionId;
    parsedM3U8.api_key = r.variables.embyApiKey;
    vMediaSources = toVMediaSources(parsedM3U8);
    const plhVSourceId = generateVMdiaSourceId(mediaSourceId, 0);
    vMediaSources.map(vSource => {
      vSource.DirectStreamUrl = urlUtil.generateDirectStreamUrl(r, vSource.Id, "master.m3u8");
      if (r.uri.includes("master.m3u8")) {
        ngx.log(ngx.WARN, `not from PlaybackInfo, start fix vSource.DirectStreamUrl`);
        vSource.DirectStreamUrl = vSource.DirectStreamUrl.replace(plhVSourceId, vSource.Id).replace("/emby", "");
      }
    });
    const requiredUA = parsedM3U8.ua;
    if (parsedM3U8.XIsFetchHls && requiredUA) {
      ngx.log(ngx.WARN, `fetchHls has requiredUA, cache one UA`);
      util.dictAdd("versionDict", cacheKey + `:${requiredUA}`, JSON.stringify(vMediaSources), null, true);
      ngx.log(ngx.WARN, `cache two, hls version cache cover placeholder version`);
    }
    util.dictAdd("versionDict", cacheKey, JSON.stringify(vMediaSources), null, true);
  }
  return vMediaSources;
}

function getVMediaSourceChcheById(vSourceId, ua) {
  if (!vSourceId) { return null; }
  let rvt = null;
  if (checkVirtual(vSourceId)) {
    const oriSourceId = vSourceId.split(ARGS.idSplit)[1];
    const cacheSourceIndex = parseInt(vSourceId.split(ARGS.idSplit)[2]);
    let cacheKey = oriSourceId;
    // Placeholder or Bitrate Ver can be null, Playback is required UA check
    if (ua) {
      cacheKey += `:${ua}`;
      ngx.log(ngx.WARN, `getVMediaSourceChcheById ua in, cacheKey add UA`);
    }
    let vMediaSource = ngx.shared["versionDict"].get(cacheKey);
    if (vMediaSource) {
      vMediaSource = JSON.parse(vMediaSource)[cacheSourceIndex];
      rvt = vMediaSource;
    } else {
      ngx.log(ngx.WARN, `cacheKey with UA not find, will try placeholder version`);
      vMediaSource = ngx.shared["versionDict"].get(oriSourceId);
      if (vMediaSource) {
        vMediaSource = JSON.parse(vMediaSource)[cacheSourceIndex];
        rvt = vMediaSource;
        ngx.log(ngx.WARN, `getVMediaSourceChcheById placeholder: ${JSON.stringify(rvt)}`);
      }
    }
  }
  return rvt;
}

function delVMediaSourceChcheById(vSourceId, ua) {
  if (vSourceId && vSourceId.startsWith(ARGS.virtualPrefix)) {
    const oriSourceId = vSourceId.split(ARGS.idSplit)[1];
    return ngx.shared["versionDict"].delete(`${oriSourceId}:${ua}`);
  }
}

// only for emby-live.js
async function getUrlByVMediaSources(r) {
  const ua = r.headersIn["User-Agent"];
  let rvt = "";
  const directHlsConfig = config.directHlsConfig;
  if (directHlsConfig.enable) {
    r.warn(`getUrlByVMediaSources, UA: ${ua}`);
    const mediaSourceId = urlUtil.getMediaSourceId(r.args);
    ngx.log(ngx.WARN, `getUrlByVMediaSources mediaSourceId: ${mediaSourceId}`);
    const vMediaSource = getVMediaSourceChcheById(mediaSourceId, ua);
    ngx.log(ngx.WARN, `getUrlByVMediaSources vMediaSource: ${JSON.stringify(vMediaSource)}`);
    if (vMediaSource) {
      r.warn(`mediaSourceId hit virtual: ${mediaSourceId}`);
      const requiredUA = vMediaSource.RequiredHttpHeaders["User-Agent"];
      const needFetch = vMediaSource.XIsPlaceholder || (requiredUA && requiredUA !== ua);
      if (needFetch) {
        if (requiredUA && requiredUA !== ua) {
          ngx.log(ngx.WARN, `fetchHlsWithCache because currentUA not same as requiredUA: ${requiredUA}`);
        }
        let extMediaSources = null;
        try {
          extMediaSources = await util.cost(fetchHlsWithCache, r, vMediaSource, vMediaSource.XPlaySessionId);
        } catch (error) {
          ngx.log(ngx.ERR, `fetchHlsWithCache: ${error}`);
        }
        if (!extMediaSources || extMediaSources.length < 1) {
          ngx.log(ngx.ERR, `extMediaSources unexpected length: ${extMediaSources.length}`);
          return rvt;
        }
        // rvt = 1;
        if (directHlsConfig.defaultPlayMax) {
          rvt = extMediaSources[extMediaSources.length - 1].Path;
        } else {
          rvt = extMediaSources[0].Path;
        }
      } else {
        rvt = vMediaSource.Path;
      }
    }
  }
  return rvt;
}

// only for PlaybackInfo
async function fetchHlsByPlh(r) {
  const ua = r.headersIn["User-Agent"];
  ngx.log(ngx.INFO, `fetchHlsByPlh, UA: ${ua}`);
  const placeholderVSourceId = r.args.MediaSourceId;
  const directHlsConfig = config.directHlsConfig;
  if (!directHlsConfig.enable) { return; }
  let vMediaSource = getVMediaSourceChcheById(placeholderVSourceId, ua);
  if (!vMediaSource || !vMediaSource.XIsPlaceholder) { return; }
  const extMediaSources = await fetchHlsWithCache(r, vMediaSource, vMediaSource.XPlaySessionId);
  if (directHlsConfig.defaultPlayMax) {
    vMediaSource = extMediaSources[extMediaSources.length - 1];
  } else {
    vMediaSource = extMediaSources[0];
  }
  return vMediaSource;
}

function getVMediaSourcesIsPlayback(rArgs) {
  const isPlayback = rArgs.IsPlayback === "true";
  if (!isPlayback) { return; }
  // PlaybackInfo UA and Real Playback UA is not same, do't use UA filter
  const vMediaSource = embyVMedia.getVMediaSourceChcheById(rArgs.MediaSourceId);
  if (vMediaSource) {
    // rArgs.AudioStreamIndex; DefaultAudioStreamIndex
    let subtitleStreamIndex = parseInt(rArgs.SubtitleStreamIndex);
    if (!subtitleStreamIndex || subtitleStreamIndex === -1) {
      subtitleStreamIndex = vMediaSource.MediaStreams.findIndex(s => s.Type === "Subtitle" && s.IsDefault);
    }
    vMediaSource.DefaultSubtitleStreamIndex = subtitleStreamIndex;
    // PlaySessionId is important, will error in /emby/Sessions/Playing/Progress
    return { MediaSources: [vMediaSource], PlaySessionId: vMediaSource.XPlaySessionId };
  }
}

async function getVMediaSourcesByHls(r, source, notLocal, playSessionId) {
  const mark = "getVMediaSourcesByHls";
  const isPlayback = r.args.IsPlayback === "true";
  if (isPlayback) {
    return ngx.log(ngx.WARN, `${mark} not isPlayback, return;`);
  }
  const directHlsConfig = config.directHlsConfig;
  if (!directHlsConfig.enable) {
    return ngx.log(ngx.WARN, `${mark} directHlsConfig.enable is false, return;`);
  }
  ngx.log(ngx.WARN, `${mark} start`);
  const mediaPathMapping = config.mediaPathMapping.slice(); // warnning config.XX Objects is current VM shared variable
  config.mediaMountPath.filter(s => s).map(s => mediaPathMapping.unshift([0, 0, s, ""]));
  const mediaItemPath = util.doUrlMapping(r, source.Path, notLocal, mediaPathMapping, "mediaPathMapping");
  ngx.log(ngx.WARN, `${mark} mapped emby file path: ${mediaItemPath}`);
  let realEnable = true;
  if (directHlsConfig.enableRule && directHlsConfig.enableRule.length > 0) {
    const rule = util.simpleRuleFilter(r, directHlsConfig.enableRule, mediaItemPath, null, "directHlsEnableRule");
    realEnable = rule && rule.length > 0;
  }
  if (realEnable) {
    const sourceCopy = Object.assign({}, source);
    sourceCopy.Path = mediaItemPath;
    try {
      return await util.cost(fetchHlsWithCache, r, sourceCopy, playSessionId);
    } catch (error) {
      ngx.log(ngx.ERR, `${mark}: ${error}`);
    }
  }
}

export default {
  ARGS,
  vSubtitlesAdepter,
  fetchHls,
  checkVirtual,
  fetchHlsWithCache,
  getVMediaSourceChcheById,
  delVMediaSourceChcheById,
  // fetchHlsByPlh,
  getUrlByVMediaSources,
  getVMediaSourcesIsPlayback,
  getVMediaSourcesByHls,
};
