import { getState, resetDoc, setState, subscribe, type SyncStatus } from './editor/store'
import type { Doc } from './editor/types'

// Keeps the signed-in user's drawing in step with the copy saved to their account (/api/doc).
// Signed-out drawings never leave the browser.

const META_KEY = 'tldraw-clone:sync'
const SAVE_DELAY = 1000
const RETRY_DELAY = 15000
// The endpoint refuses bodies over 4 MB; check here first rather than upload one only to be told no.
const MAX_BODY_LENGTH = 4_000_000

/** What this browser knows about the account copy. */
interface Meta {
	userId: string
	/** Version of the account copy the local drawing was last in step with. */
	version: number | null
	/** True while the local drawing has changes the account copy doesn't. */
	dirty: boolean
}

interface Remote {
	doc: Doc | null
	updatedAt: number | null
}

function loadMeta(): Meta | null {
	try {
		return JSON.parse(localStorage.getItem(META_KEY) ?? 'null')
	} catch {
		return null
	}
}

const status = (sync: SyncStatus) => {
	if (getState().sync !== sync) setState({ sync })
}

/** Combine two drawings without dropping a shape from either. Where both have a shape, `mine` wins. */
export function mergeDocs(theirs: Doc, mine: Doc): Doc {
	const theirIds = new Set(theirs.order)
	return {
		shapes: { ...theirs.shapes, ...mine.shapes },
		order: [...theirs.order, ...mine.order.filter((id) => !theirIds.has(id))],
	}
}

/**
 * Start syncing for a signed-in user. Returns a function that stops it.
 * A drawing made before signing in is merged into the account rather than replaced by it.
 */
export function startSync(userId: string, getToken: () => Promise<string | null>): () => void {
	const previous = loadMeta()
	let meta: Meta =
		previous?.userId === userId ? previous : { userId, version: null, dirty: getState().doc.order.length > 0 }
	let stopped = false
	let busy = false
	let timer: number | undefined
	/** The drawing most recently taken from the account, so loading it doesn't count as an edit. */
	let adopted: Doc | null = null
	let lastDoc = getState().doc

	const setMeta = (patch: Partial<Meta>) => {
		meta = { ...meta, ...patch }
		localStorage.setItem(META_KEY, JSON.stringify(meta))
	}

	async function request(method: 'GET' | 'PUT', body?: string): Promise<Response> {
		const token = await getToken()
		if (!token) throw new Error('no session')
		return fetch('/api/doc', {
			method,
			headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
			body,
		})
	}

	function schedule(delay: number) {
		window.clearTimeout(timer)
		timer = window.setTimeout(() => void save(), delay)
	}

	/** Fold in a newer account copy: take it as is, or merge it when there are local changes to keep. */
	function receive(remote: Remote) {
		if (!remote.doc || remote.updatedAt === meta.version) return
		if (meta.dirty) {
			setState({ doc: mergeDocs(remote.doc, getState().doc) })
			setMeta({ version: remote.updatedAt, dirty: true })
		} else {
			adopted = remote.doc
			resetDoc(remote.doc)
			setMeta({ version: remote.updatedAt, dirty: false })
		}
	}

	async function pull() {
		if (stopped || busy) return
		busy = true
		try {
			const res = await request('GET')
			if (!res.ok) throw new Error(`GET /api/doc ${res.status}`)
			const remote: Remote = await res.json()
			if (stopped) return
			receive(remote)
			if (meta.dirty) schedule(0)
			else status('saved')
		} catch {
			if (stopped) return
			status('offline')
			if (meta.dirty) schedule(RETRY_DELAY)
		} finally {
			busy = false
		}
	}

	async function save() {
		if (stopped) return
		if (busy) return schedule(SAVE_DELAY)
		const doc = getState().doc
		const body = JSON.stringify({ doc, base: meta.version })
		if (body.length > MAX_BODY_LENGTH) return status('too-large')
		busy = true
		status('saving')
		try {
			const res = await request('PUT', body)
			if (stopped) return
			if (res.status === 409) {
				// the account copy changed elsewhere since we last saw it: merge, then save the result
				receive(await res.json())
				schedule(0)
			} else if (res.status === 413) {
				status('too-large')
			} else if (!res.ok) {
				throw new Error(`PUT /api/doc ${res.status}`)
			} else {
				const { updatedAt }: { updatedAt: number } = await res.json()
				const unchanged = getState().doc === doc
				setMeta({ version: updatedAt, dirty: !unchanged })
				if (unchanged) status('saved')
				else schedule(SAVE_DELAY)
			}
		} catch {
			if (!stopped) {
				status('offline')
				schedule(RETRY_DELAY)
			}
		} finally {
			busy = false
		}
	}

	const unsubscribe = subscribe(() => {
		const doc = getState().doc
		if (doc === lastDoc) return
		lastDoc = doc
		if (doc === adopted) return
		if (!meta.dirty) setMeta({ dirty: true })
		schedule(SAVE_DELAY)
	})

	// pick up changes made on another device when the tab comes back into view
	const onVisible = () => {
		if (document.visibilityState !== 'visible') return
		if (meta.dirty) schedule(0)
		else void pull()
	}
	const onOnline = () => (meta.dirty ? schedule(0) : void pull())
	document.addEventListener('visibilitychange', onVisible)
	window.addEventListener('online', onOnline)

	setMeta({})
	status('loading')
	void pull()

	return () => {
		stopped = true
		window.clearTimeout(timer)
		unsubscribe()
		document.removeEventListener('visibilitychange', onVisible)
		window.removeEventListener('online', onOnline)
	}
}

/**
 * Called when nobody is signed in. If this browser was showing an account's drawing, clear it:
 * the account still has it, and the next person here shouldn't. Unsaved changes are kept instead,
 * and get merged into whichever account signs in next.
 */
export function leaveAccount() {
	status('off')
	const meta = loadMeta()
	if (!meta) return
	localStorage.removeItem(META_KEY)
	if (!meta.dirty) resetDoc({ shapes: {}, order: [] })
}
