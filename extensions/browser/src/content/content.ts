function extractPageMetadata() {
  const metadata: Record<string, any> = {
    title: document.title
  };

  const isPdf = window.location.pathname.toLowerCase().endsWith('.pdf') || document.contentType === 'application/pdf';
  if (isPdf) {
    metadata['category'] = 'document';
    
    let decodedPath = window.location.pathname;
    try {
      decodedPath = decodeURIComponent(window.location.pathname);
    } catch (e) {}

    const filename = decodedPath.split('/').pop() || 'document.pdf';
    metadata['document'] = filename;

    const isLocal = window.location.protocol === 'file:';
    metadata['platform_specific'] = JSON.stringify({
      pdf: {
        path: decodedPath,
        is_local: isLocal,
      }
    });

    if (isLocal) {
      const parts = decodedPath.split('/');
      parts.pop(); // remove filename
      
      const anchors = ['Documents', 'Downloads', 'Desktop', 'Music', 'Videos', 'Pictures'];
      let projectPath = '';
      
      for (let i = 0; i < parts.length; i++) {
        if (anchors.includes(parts[i])) {
          const remaining = parts.slice(i + 1);
          if (remaining.length > 0) {
            projectPath = remaining.join('/');
          }
          break;
        }
      }
      
      if (!projectPath) {
        if (parts.length > 2) {
           projectPath = parts.slice(-2).join('/');
        } else {
           projectPath = parts.join('/') || 'Local Files';
        }
      }
      
      metadata['project'] = projectPath.replace(/^\/+|\/+$/g, '') || 'Local Files';
    } else {
      metadata['project'] = window.location.hostname;
    }
  }

  const getMeta = (selector: string) => {
    const el = document.querySelector(selector);
    return el ? el.getAttribute('content') : null;
  };

  const ogType = getMeta('meta[property="og:type"]');
  if (ogType) metadata['category'] = ogType;

  const ogSiteName = getMeta('meta[property="og:site_name"]');
  if (ogSiteName) metadata['site_name'] = ogSiteName;

  const keywords = getMeta('meta[name="keywords"]');
  if (keywords) metadata['keywords'] = keywords;
  
  const description = getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]');
  if (description) {
    metadata['description'] = description.substring(0, 200); 
  }

  // Detect YouTube video
  if (window.location.hostname.includes('youtube.com')) {
    metadata['category'] = 'video';
    
    const videoId = new URLSearchParams(window.location.search).get('v');
    
    let channelName = null;
    const channelSelectors = [
      'ytd-video-owner-renderer ytd-channel-name a',
      '#owner-name a',
      'ytd-channel-name .yt-simple-endpoint'
    ];
    for (const sel of channelSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        channelName = el.textContent.trim();
        break;
      }
    }
    if (!channelName) {
      channelName = document.querySelector('link[itemprop="name"]')?.getAttribute('content') || null;
    }
    const video = document.querySelector('video');
    
    // Stringify the nested object because Go expects map[string]string
    metadata['platform_specific'] = JSON.stringify({
      youtube: {
        video_id: videoId || null,
        channel_name: channelName || null,
        is_playing: video ? !video.paused : false,
        current_time_seconds: video ? Math.floor(video.currentTime) : 0,
        duration_seconds: video ? Math.floor(video.duration) : 0,
      }
    });
  }

  // Detect GitHub
  if (window.location.hostname.includes('github.com')) {
    metadata['category'] = 'development';
  }

  // Smart fallback classification when OG type is missing or generic
  if (!metadata['category'] || metadata['category'] === 'website') {
    const hostname = window.location.hostname;
    
    const streamingDomains = [
      'netflix.com', 'hulu.com', 'disneyplus.com', 'primevideo.com',
      'hbomax.com', 'max.com', 'crunchyroll.com', 'twitch.tv', 'vimeo.com',
      'dailymotion.com', 'plex.tv', 'jellyfin', 'emby', 'zstream.mov',
      'stremio.com', 'themoviedb.org', 'animesuge', 'animepahe',
      'gogoanime', 'aniwatch', '9anime',
    ];
    
    if (streamingDomains.some(d => hostname.includes(d))) {
      metadata['category'] = 'video';
    } else if (['x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'linkedin.com',
                 'reddit.com', 'mastodon', 'bluesky', 'threads.net', 'tiktok.com'].some(d => hostname.includes(d))) {
      metadata['category'] = 'social';
    } else if (['stackoverflow.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'crates.io',
                 'pkg.go.dev', 'devdocs.io', 'codepen.io', 'jsfiddle.net',
                 'codesandbox.io', 'replit.com'].some(d => hostname.includes(d))) {
      metadata['category'] = 'development';
    } else if (['chat.openai.com', 'gemini.google.com', 'claude.ai', 'perplexity.ai',
                 'copilot.microsoft.com', 'poe.com'].some(d => hostname.includes(d))) {
      metadata['category'] = 'ai';
    } else if (['notion.so', 'docs.google.com', 'drive.google.com', 'sheets.google.com',
                 'slides.google.com', 'figma.com', 'miro.com', 'airtable.com', 'trello.com',
                 'linear.app', 'asana.com', 'monday.com'].some(d => hostname.includes(d))) {
      metadata['category'] = 'productivity';
    } else if (['medium.com', 'substack.com', 'news.ycombinator.com',
                 'nytimes.com', 'bbc.com', 'theguardian.com', 'techcrunch.com',
                 'theverge.com', 'wired.com'].some(d => hostname.includes(d))) {
      metadata['category'] = 'news';
    }
  }

  return metadata;
}

let lastTitle = document.title;
let lastUrl = window.location.href;

function checkAndNotifyChange() {
  const currentTitle = document.title;
  const currentUrl = window.location.href;
  if (currentTitle !== lastTitle || currentUrl !== lastUrl) {
    lastTitle = currentTitle;
    lastUrl = currentUrl;
    chrome.runtime.sendMessage({ type: 'FORCE_TRACKING_UPDATE' }).catch(() => {});
  }
}

// Listen for requests from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_METADATA') {
    sendResponse(extractPageMetadata());
  }
});

// Setup observers and event listeners for SPA navigation (YouTube, GitHub, Next.js, etc.)
function initNavigationListeners() {
  // Title MutationObserver
  const titleEl = document.querySelector('title');
  if (titleEl) {
    const titleObserver = new MutationObserver(() => checkAndNotifyChange());
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  // Head/Body MutationObserver fallback
  const observer = new MutationObserver(() => {
    checkAndNotifyChange();
    if (window.location.hostname.includes('youtube.com')) {
      setupYouTubeListeners();
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // History API overrides
  const origPushState = history.pushState;
  if (origPushState) {
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      setTimeout(checkAndNotifyChange, 100);
      setTimeout(checkAndNotifyChange, 500);
      setTimeout(checkAndNotifyChange, 1000);
    };
  }
  const origReplaceState = history.replaceState;
  if (origReplaceState) {
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      setTimeout(checkAndNotifyChange, 100);
      setTimeout(checkAndNotifyChange, 500);
      setTimeout(checkAndNotifyChange, 1000);
    };
  }

  window.addEventListener('popstate', () => {
    setTimeout(checkAndNotifyChange, 100);
    setTimeout(checkAndNotifyChange, 500);
  });

  // YouTube specific events
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(checkAndNotifyChange, 100);
    setTimeout(checkAndNotifyChange, 500);
  });
  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(checkAndNotifyChange, 100);
  });

  // Periodic polling safety net (every 2s)
  setInterval(checkAndNotifyChange, 2000);
}

// Setup live event listeners for YouTube play/pause events
let youtubeVideoElement: HTMLVideoElement | null = null;

function setupYouTubeListeners() {
  if (!window.location.hostname.includes('youtube.com')) return;

  const video = document.querySelector('video');
  if (video && video !== youtubeVideoElement) {
    youtubeVideoElement = video;
    
    const triggerUpdate = () => {
      checkAndNotifyChange();
      chrome.runtime.sendMessage({ type: 'FORCE_TRACKING_UPDATE' }).catch(() => {});
    };
    
    video.addEventListener('play', triggerUpdate);
    video.addEventListener('pause', triggerUpdate);
    video.addEventListener('ended', triggerUpdate);
  }
}

initNavigationListeners();
if (window.location.hostname.includes('youtube.com')) {
  setupYouTubeListeners();
}
