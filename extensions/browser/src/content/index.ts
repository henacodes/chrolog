function extractPageMetadata() {
  const metadata: Record<string, any> = {};

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
    const channelName = document.querySelector('link[itemprop="name"]')?.getAttribute('content');
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

  return metadata;
}

// Listen for requests from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_METADATA') {
    sendResponse(extractPageMetadata());
  }
});

// Setup live event listeners for YouTube play/pause events
let youtubeVideoElement: HTMLVideoElement | null = null;
function setupYouTubeListeners() {
  if (!window.location.hostname.includes('youtube.com')) return;

  const video = document.querySelector('video');
  if (video && video !== youtubeVideoElement) {
    youtubeVideoElement = video;
    
    // When video play state changes, notify the background script to re-poll
    const triggerUpdate = () => {
      chrome.runtime.sendMessage({ type: 'FORCE_TRACKING_UPDATE' }).catch(() => {});
    };
    
    video.addEventListener('play', triggerUpdate);
    video.addEventListener('pause', triggerUpdate);
  }
}

// YouTube is an SPA, so we need to monitor for the video element appearing/changing
if (window.location.hostname.includes('youtube.com')) {
  const observer = new MutationObserver(() => setupYouTubeListeners());
  observer.observe(document.body, { childList: true, subtree: true });
  setupYouTubeListeners();
}

