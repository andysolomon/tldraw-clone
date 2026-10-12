import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Vercel's Clerk integration names its key NEXT_PUBLIC_…, so expose that prefix alongside Vite's own.
const ENV_PREFIXES = ['VITE_', 'NEXT_PUBLIC_']

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), ENV_PREFIXES)
	const hasClerkKey = !!(env.VITE_CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
	// shows up in build logs, so a deploy without the key is easy to spot
	console.log(`[auth] Clerk publishable key ${hasClerkKey ? 'found' : 'not set: sign-in is disabled'}`)
	return {
		plugins: [react()],
		envPrefix: ENV_PREFIXES,
		server: { port: 5420, strictPort: false },
	}
})
