import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [appId, setAppId] = useState<string>('')
  const [windowTitle, setWindowTitle] = useState<string>('')
  const [startTime, setStartTime] = useState<number>(0)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  useEffect(() => {
    // Query background script on load
    chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((response: any) => {
      if (response) {
        if (response.appId) setAppId(response.appId)
        if (response.windowTitle) setWindowTitle(response.windowTitle)
        if (response.startTime) setStartTime(response.startTime)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!startTime) return
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    // Initial tick
    setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    return () => clearInterval(interval)
  }, [startTime])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    if (seconds < 3600) return `${m}:${s}`
    return `${h}:${m}:${s}`
  }

  const cleanTitle = (title: string) => {
    if (!title) return ''
    let cleaned = title.replace(/^\(\d+\)\s*/, '')
    if (cleaned.includes(' - ')) {
      const parts = cleaned.split(' - ')
      if (parts.length > 1) {
        cleaned = parts.slice(0, parts.length - 1).join(' - ')
      }
    }
    return cleaned
  }

  const displayTitle = cleanTitle(windowTitle) || appId

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h1>Chrolog</h1>
        </div>
      </header>
      
      <main className="popup-main" style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
        <div style={{ marginBottom: '1rem', color: '#558B2F' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', animation: 'pulse-icon 2s infinite' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2 style={{ fontSize: '0.85rem', marginBottom: '0.25rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Focus</h2>
        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={displayTitle}>
          {displayTitle || 'No active page'}
        </div>
        {appId && displayTitle !== appId && (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {appId}
          </div>
        )}
        <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#558B2F', fontFamily: 'monospace', letterSpacing: '2px', textShadow: '0 0 10px rgba(85, 139, 47, 0.3)', marginTop: '0.5rem' }}>
          {formatTime(elapsedSeconds)}
        </div>
      </main>

      <footer className="popup-footer" style={{ justifyContent: 'center' }}>
        <div className="today-summary">
          <span className="label" style={{ color: '#64748b', fontSize: '0.75rem' }}>100% Local • Privacy First</span>
        </div>
      </footer>
    </div>
  )
}

export default App
