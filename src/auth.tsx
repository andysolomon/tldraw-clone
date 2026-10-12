import { ClerkProvider, Show, SignInButton, UserButton } from '@clerk/react'
import type { ReactNode } from 'react'

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

/** Top-right account control: a sign-in button, or the signed-in user's avatar menu. */
export function AccountButton() {
	if (!authEnabled) return null
	return (
		<div className="tlui-account">
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
