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
