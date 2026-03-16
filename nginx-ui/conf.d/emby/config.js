// Nginx-UI 直读预设版精简配置

const mediaMountPath = [""];

const strHead = {
  lanIp: ["172.", "10.", "192.", "[fd00:"],
  xEmbyClients: { seekBug: ["Emby for iOS"] },
  xUAs: {
    seekBug: ["Infuse", "VidHub", "SenPlayer"],
    clientsPC: ["EmbyTheater"],
    clients3rdParty: ["Fileball", "Infuse", "SenPlayer", "VidHub"],
    player3rdParty: ["dandanplay", "VLC", "MXPlayer", "PotPlayer"],
    blockDownload: ["Infuse-Download"],
    infuse: { direct: "Infuse-Direct", download: "Infuse-Download" },
  },
  userIds: { allowInteractiveSearch: [] },
  filePaths: { mediaMountPath: [], redirectStrmLastLinkRule: [], mediaPathMappingGroup01: [] },
};

const routeRule = [];
const symlinkRule = [];
const mediaPathMapping = [];
const redirectStrmLastLinkRule = [];
const clientSelfAlistRule = [];

const redirectConfig = {
  enable: true,
  enableVideoLivePlay: true,
  enableVideoStreamPlay: true,
  enableAudioStreamPlay: true,
  enableItemsDownload: true,
  enableSyncDownload: true,
};

const routeCacheConfig = {
  enable: true,
  enableL2: false,
  keyExpression: "r.uri:r.args.MediaSourceId",
};

const fallbackUseOriginal = true;

const transcodeConfig = {
  enable: false,
};

const imageCachePolicy = 0;

const embyNotificationsAdmin = {
  enable: false,
  includeUrl: false,
  name: "【emby2Alist】",
};

const embyRedirectSendMessage = {
  enable: false,
  header: "【emby2Alist】",
  timeoutMs: -1,
};

const itemHiddenRule = [];

const streamConfig = {
  useRealFileName: false,
};

const searchConfig = {
  interactiveEnable: false,
  interactiveFast: false,
};

const directHlsConfig = {
  enable: false,
  defaultPlayMax: false,
  enableRule: [],
};

const playbackInfoConfig = {
  enabled: true,
  sourcesSortFitRule: [],
  sourcesSortRules: {},
}

const nginxConfig = {
  disableDocs: true,
};

function getDisableDocs(r) {
  const value = nginxConfig.disableDocs
    && !ngx.shared["tmpDict"].get("opendocs");
  return value;
}

export default {
  mediaMountPath,
  strHead,
  fallbackUseOriginal,
  redirectConfig,
  routeCacheConfig,
  routeRule,
  mediaPathMapping,
  symlinkRule,
  redirectStrmLastLinkRule,
  clientSelfAlistRule,
  transcodeConfig,
  embyNotificationsAdmin,
  embyRedirectSendMessage,
  itemHiddenRule,
  streamConfig,
  searchConfig,
  directHlsConfig,
  playbackInfoConfig,
  nginxConfig,
  getDisableDocs,
};
