const SERVER_URL = 'http://127.0.0.1:1738/event'

// State for the popup
let activeAppId = ''
let activeWindowTitle = ''
let activeSessionStartTime = Date.now()

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    // First try active tab in last focused normal window
    const [lastFocusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' })
    if (lastFocusedTab) return lastFocusedTab

    // Fallback to any active tab in a normal browser window
    const normalTabs = await chrome.tabs.query({ active: true, windowType: 'normal' })
    if (normalTabs.length > 0) return normalTabs[0]

    // Fallback to active tab in current window
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return currentTab
  } catch (e) {
    return undefined
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    getActiveTab().then(async (tab) => {
      if (tab && tab.url) {
        try {
          const url = new URL(tab.url)
          if (url.protocol !== 'chrome:' && url.protocol !== 'chrome-extension:' && url.protocol !== 'edge:') {
            const appId = url.hostname
            let windowTitle = tab.title || appId

            try {
              const meta: any = await Promise.race([
                chrome.tabs.sendMessage(tab.id!, { type: 'GET_PAGE_METADATA' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300))
              ])
              if (meta && meta.title) {
                windowTitle = meta.title
              }
            } catch (e) {}

            if (activeAppId !== appId || activeWindowTitle !== windowTitle) {
              activeAppId = appId
              activeWindowTitle = windowTitle
              activeSessionStartTime = Date.now()
            }
          }
        } catch (e) {}
      }
      sendResponse({
        appId: activeAppId,
        windowTitle: activeWindowTitle,
        startTime: activeSessionStartTime
      })
    })
    return true
  } else if (message.type === 'FORCE_TRACKING_UPDATE') {
    if (sender.tab && sender.tab.active) {
      sendTrackingEvent(sender.tab.id)
    }
  }
})

async function sendTrackingEvent(tabId?: number) {
  try {
    let tab: chrome.tabs.Tab | undefined
    if (tabId) {
      try {
        tab = await chrome.tabs.get(tabId)
      } catch (e) {}
    }
    if (!tab) {
      tab = await getActiveTab()
      if (!tab) return
    }

    if (!tab.url) return // E.g., restricted pages where we don't have permission

    let appId = ''
    try {
      const url = new URL(tab.url)
      // Ignore internal browser pages
      if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol !== 'http:' && url.protocol !== 'https:') {
        return
      }
      appId = url.hostname
    } catch (e) {
      // Invalid URL
      return
    }

    // Fetch metadata from content script
    let pageMetadata: Record<string, any> = {}
    try {
      // Small timeout to not block tracking if content script isn't loaded yet
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id!, { type: 'GET_PAGE_METADATA' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
      ])
      if (response) {
        pageMetadata = response as Record<string, any>
      }
    } catch (e) {
      // Content script might not be injected yet on initial load or internal pages
      console.debug('Could not fetch page metadata:', e)
    }

    const windowTitle = pageMetadata.title || tab.title || appId
    
    // Update local state for popup
    if (activeAppId !== appId || activeWindowTitle !== windowTitle) {
      activeAppId = appId
      activeWindowTitle = windowTitle
      activeSessionStartTime = Date.now()
    }

    await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId,
        app_name: 'Browser',
        window_title: windowTitle,
        source: 'browser_extension',
        url: tab.url,
        favicon: tab.favIconUrl || '',
        metadata: pageMetadata
      })
    })
  } catch (err) {
    // Failed to send (e.g. desktop app is not running)
    console.debug('Chrolog tracking event failed:', err)
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  sendTrackingEvent(activeInfo.tabId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only send when the page title or URL changes
  if (changeInfo.title || changeInfo.url) {
    if (tab.active) {
      sendTrackingEvent(tabId)
    }
  }
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus. Clear high-priority tracking.
    fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: '',
        app_name: '',
        window_title: '',
        source: 'browser_extension'
      })
    }).catch(err => console.debug('Chrolog focus loss event failed:', err))
    return
  }
  sendTrackingEvent()
})

chrome.runtime.onInstalled.addListener(() => {
  sendTrackingEvent()
})

chrome.runtime.onStartup.addListener(() => {
  sendTrackingEvent()
})
