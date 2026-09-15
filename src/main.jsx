import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { HashRouter } from 'react-router'
import { initTheme } from './utils/theme'

// Re-apply the user's saved custom theme (if any) as CSS variable
// overrides on <html>, BEFORE the app renders. index.css above already
// defines the shipped defaults; this just overwrites whichever
// variables the user customized in Settings > Theme Customizer, so
// there's no flash of default colors before the saved theme kicks in.
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)