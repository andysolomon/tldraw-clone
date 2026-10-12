import { Redis } from '@upstash/redis'
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose'

// One drawing per account, stored in Upstash Redis and guarded by the caller's Clerk session.
// The helpers are exported so tests can exercise them with their own keys and storage.

/** A stored drawing. `updatedAt` doubles as its version, used to detect edits from elsewhere. */
export interface Saved {
	doc: unknown
	updatedAt: number
}

/** The part of the Redis client this endpoint relies on. */
export interface KeyValue {
	get<T>(key: string): Promise<T | null>
	set(key: string, value: unknown): Promise<unknown>
}

// Vercel rejects request bodies over 4.5 MB; stay under it and answer with a clear 413 instead.
const MAX_BODY_BYTES = 4_000_000
const docKey = (userId: string) => `tldraw-clone:doc:${userId}`

/** Returns the user id for a valid Clerk session token, or null. */
export async function verifySession(
	token: string,
	keys: JWTVerifyGetKey,
	issuer: string,
	origins: string[]
): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['RS256'] })
		// azp names the site the session belongs to; a token issued for another site must not work here
		if (typeof payload.azp === 'string' && !origins.includes(payload.azp)) return null
		return payload.sub ?? null
	} catch {
		return null
	}
}

export const readDoc = (kv: KeyValue, userId: string) => kv.get<Saved>(docKey(userId))

/** Saves a drawing, unless the stored one has changed since the version the caller last saw. */
export async function writeDoc(
	kv: KeyValue,
	userId: string,
	doc: unknown,
	base: number | null
): Promise<{ ok: true; updatedAt: number } | { ok: false; current: Saved }> {
	const current = await readDoc(kv, userId)
	if (current && current.updatedAt !== base) return { ok: false, current }
	const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1)
	await kv.set(docKey(userId), { doc, updatedAt } satisfies Saved)
	return { ok: true, updatedAt }
}

const isDoc = (value: unknown) => {
	const doc = value as { shapes?: unknown; order?: unknown } | null
	return !!doc && typeof doc.shapes === 'object' && doc.shapes !== null && Array.isArray(doc.order)
}

// ---- wiring ----

const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
// A publishable key is "pk_<env>_" followed by base64 of "<clerk frontend api host>$".
const frontendApi = Buffer.from(publishableKey.split('_')[2] ?? '', 'base64').toString().replace(/\$$/, '')
const issuer = `https://${frontendApi}`
const keys = frontendApi ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null

const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Origins this deployment is served from, which is where its own sessions come from. */
function ownOrigins(request: Request): string[] {
	const origins = [new URL(request.url).origin]
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
	if (host) origins.push(`${request.headers.get('x-forwarded-proto') ?? 'https'}://${host}`)
	return origins
}

async function authorize(request: Request): Promise<{ kv: KeyValue; userId: string } | Response> {
	if (!keys || !redis) return json({ error: 'Cloud saving is not configured on this deployment.' }, 503)
	const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
	const userId = token ? await verifySession(token, keys, issuer, ownOrigins(request)) : null
	if (!userId) return json({ error: 'Sign in to load or save your drawing.' }, 401)
	return { kv: redis, userId }
}

export async function GET(request: Request) {
	const auth = await authorize(request)
	if (auth instanceof Response) return auth
	return json((await readDoc(auth.kv, auth.userId)) ?? { doc: null, updatedAt: null })
}

export async function PUT(request: Request) {
	const auth = await authorize(request)
	if (auth instanceof Response) return auth
	const text = await request.text()
	if (Buffer.byteLength(text) > MAX_BODY_BYTES) return json({ error: 'This drawing is too large to save.' }, 413)
	let body: { doc?: unknown; base?: unknown }
	try {
		body = JSON.parse(text)
	} catch {
		return json({ error: 'Expected a JSON body.' }, 400)
	}
	if (!isDoc(body.doc)) return json({ error: 'Expected a drawing in "doc".' }, 400)
	const result = await writeDoc(auth.kv, auth.userId, body.doc, typeof body.base === 'number' ? body.base : null)
	return result.ok ? json({ updatedAt: result.updatedAt }) : json(result.current, 409)
}
