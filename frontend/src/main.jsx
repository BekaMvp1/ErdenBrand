import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/print.css'
import { API_URL } from './apiBaseUrl.js'

// Пинг /api/health в production (смягчает засыпание бесплатного Render).
if (import.meta.env.PROD && API_URL) {
  const base = API_URL.replace(/\/$/, '')
  const health = `${base}/api/health`
  setInterval(() => {
    fetch(health).catch(() => {})
  }, 10 * 60 * 1000)
}

async function wakeUpServer() {
  if (!import.meta.env.PROD) return
  const base = (API_URL || '').trim().replace(/\/$/, '')
  if (!base) return
  const health = `${base}/api/health`
  console.log('[App] будим сервер…')
  const fetchWithTimeout = (url, ms = 10000) => {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), ms)
    return fetch(url, { signal: ctrl.signal }).finally(() => window.clearTimeout(t))
  }
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetchWithTimeout(health, 10000)
      if (res.ok) {
        console.log('[App] сервер проснулся ✓')
        return
      }
    } catch {
      /* ignore */
    }
    if (i < 4) {
      await new Promise((r) => setTimeout(r, 3000))
      console.log(`[App] попытка пробуждения ${i + 2}/5`)
    }
  }
}

wakeUpServer()

// Режим печати: bw (по умолчанию) или color
const printTheme = (import.meta.env.VITE_PRINT_THEME || 'bw').toLowerCase()
document.documentElement.setAttribute('data-print-theme', printTheme === 'color' ? 'color' : 'bw')
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { PrintProvider } from './context/PrintContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PrintProvider>
        <App />
      </PrintProvider>
    </ErrorBoundary>
  </StrictMode>,
)
