import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { GET, type KeyValue, PUT, readDoc, verifySession, writeDoc } from '../api/doc.ts'

const ISSUER = 'https://example.clerk.accounts.dev'
const ORIGIN = 'https://app.example.com'

async function keyPair() {
	const { publicKey, privateKey } = await generateKeyPair('RS256')
	const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] })
	const sign = (claims: Record<string, unknown>, expires = '1m', issuer = ISSUER) =>
		new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(issuer).setExpirationTime(expires).sign(privateKey)
	return { keys, sign }
}

function memoryStore(): KeyValue {
	const data = new Map<string, unknown>()
	return {
		get: async <T>(key: string) => (data.get(key) as T | undefined) ?? null,
		set: async (key, value) => data.set(key, value),
	}
}

test('accepts a valid session and returns its user id', async () => {
	const { keys, sign } = await keyPair()
	const token = await sign({ sub: 'user_1', azp: ORIGIN })
	assert.equal(await verifySession(token, keys, ISSUER, [ORIGIN]), 'user_1')
})

test('rejects tokens that are expired, from another issuer, for another site, or signed by another key', async () => {
	const { keys, sign } = await keyPair()
	const other = await keyPair()
	assert.equal(await verifySession(await sign({ sub: 'u', azp: ORIGIN }, '-1m'), keys, ISSUER, [ORIGIN]), null)
	assert.equal(await verifySession(await sign({ sub: 'u', azp: ORIGIN }, '1m', 'https://evil.example'), keys, ISSUER, [ORIGIN]), null)
	assert.equal(await verifySession(await sign({ sub: 'u', azp: 'https://evil.example' }), keys, ISSUER, [ORIGIN]), null)
	assert.equal(await verifySession(await other.sign({ sub: 'u', azp: ORIGIN }), keys, ISSUER, [ORIGIN]), null)
	assert.equal(await verifySession('not-a-token', keys, ISSUER, [ORIGIN]), null)
})

test('rejects an unsigned token', async () => {
	const { keys } = await keyPair()
	const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
	const exp = Math.floor(Date.now() / 1000) + 60
	const token = `${part({ alg: 'none' })}.${part({ sub: 'u', iss: ISSUER, exp })}.`
	assert.equal(await verifySession(token, keys, ISSUER, [ORIGIN]), null)
})

test('saves a drawing and reads it back per user', async () => {
	const kv = memoryStore()
	const doc = { shapes: { a: { id: 'a' } }, order: ['a'] }
	const saved = await writeDoc(kv, 'user_1', doc, null)
	assert.ok(saved.ok)
	assert.deepEqual(await readDoc(kv, 'user_1'), { doc, updatedAt: saved.updatedAt })
	assert.equal(await readDoc(kv, 'user_2'), null)
})

test('refuses a save based on a stale version and returns what is stored', async () => {
	const kv = memoryStore()
	const first = await writeDoc(kv, 'user_1', { shapes: {}, order: [] }, null)
	assert.ok(first.ok)
	const second = await writeDoc(kv, 'user_1', { shapes: {}, order: ['b'] }, first.updatedAt)
	assert.ok(second.ok)
	assert.ok(second.updatedAt > first.updatedAt)
	const stale = await writeDoc(kv, 'user_1', { shapes: {}, order: ['c'] }, first.updatedAt)
	assert.equal(stale.ok, false)
	assert.deepEqual(!stale.ok && stale.current.doc, { shapes: {}, order: ['b'] })
	assert.deepEqual((await readDoc(kv, 'user_1'))?.doc, { shapes: {}, order: ['b'] })
})

test('the endpoint refuses to serve when storage or auth is not configured', async () => {
	// this process has neither a Clerk key nor Redis credentials
	const res = await GET(new Request('https://app.example.com/api/doc'))
	assert.equal(res.status, 503)
	const put = await PUT(new Request('https://app.example.com/api/doc', { method: 'PUT', body: '{}' }))
	assert.equal(put.status, 503)
})
