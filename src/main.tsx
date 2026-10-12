import '@fontsource/shantell-sans/400.css'
import '@fontsource/shantell-sans/700.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-serif/500.css'
import '@fontsource/ibm-plex-mono/500.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth'
import './styles.css'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<AuthProvider>
			<App />
		</AuthProvider>
	</StrictMode>
)
