import { ClerkProvider, Show, SignInButton, UserButton, useAuth } from '@clerk/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { type SyncStatus, useStore } from './editor/store'
import { leaveAccount, startSync } from './sync'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

/** Without a Clerk key the app still runs; it just has no accounts. */
export const authEnabled = !!publishableKey

export function AuthProvider({ children }: { children: ReactNode }) {
	if (!publishableKey) return <>{children}</>
	return (
		<ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/" appearance={{ variables: { colorPrimary: '#3182ed' } }}>
			{children}
		</ClerkProvider>
	)
}

const SYNC_LABELS: Record<SyncStatus, [label: string, hint: string]> = {
	off: ['', ''],
	loading: ['Loading…', 'Fetching the drawing saved to your account'],
	saving: ['Saving…', 'Saving to your account'],
	saved: ['Saved', 'This drawing is saved to your account'],
	offline: ['Not saved', 'Could not reach your account. Changes are kept in this browser and will be retried.'],
	'too-large': ['Too large to save', 'This drawing is over the 4 MB account limit, usually because of images. It is kept in this browser only.'],
}

/** Runs account sync for as long as someone is signed in, and shows how it is going. */
function AccountSync() {
	const { isLoaded, isSignedIn, userId, getToken } = useAuth()
	const sync = useStore((s) => s.sync)
	const token = useRef(getToken)
	token.current = getToken

	useEffect(() => {
		if (!isLoaded) return
		if (!isSignedIn || !userId) return leaveAccount()
		return startSync(userId, () => token.current())
	}, [isLoaded, isSignedIn, userId])

	const [label, hint] = SYNC_LABELS[sync]
	if (!label) return null
	return (
		<span className="tlui-sync-status" data-status={sync} title={hint}>
			{label}
		</span>
	)
}

/** Top-right account control: a sign-in button, or the signed-in user's avatar menu. */
export function AccountButton() {
	if (!authEnabled) return null
	return (
		<div className="tlui-account">
			<AccountSync />
			<Show when="signed-out">
				<SignInButton mode="modal">
					<button type="button" className="tlui-primary-button" data-testid="sign-in-button">
						Sign in
					</button>
				</SignInButton>
			</Show>
			<Show when="signed-in">
				<UserButton />
			</Show>
		</div>
	)
}
