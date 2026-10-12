import { useSyncExternalStore } from 'react'
import { resolveArrow } from './geometry'
import type { Box, Camera, Doc, GeoType, Shape, Styles, ToolId, Vec } from './types'

const STORAGE_KEY = 'tldraw-clone:v1'
const MAX_HISTORY = 200

/** Where the signed-in user's drawing stands relative to their account. "off" when signed out. */
export type SyncStatus = 'off' | 'loading' | 'saving' | 'saved' | 'offline' | 'too-large'

export interface Scribble {
	kind: 'eraser' | 'laser'
	points: Vec[]
}

export interface State {
	doc: Doc
	camera: Camera
	viewport: { w: number; h: number }
	selectedIds: string[]
	hoveredId: string | null
	editingId: string | null
	erasingIds: string[]
	tool: ToolId
	geo: GeoType
	styles: Styles
	dark: boolean
	grid: boolean
	minimap: boolean
	toolLock: boolean
	brush: Box | null
	scribble: Scribble | null
	cursor: string
	canUndo: boolean
	canRedo: boolean
	dialog: 'shortcuts' | null
	sync: SyncStatus
}

const DEFAULT_STYLES: Styles = {
	color: 'black',
	fill: 'none',
	dash: 'draw',
	size: 'm',
	font: 'draw',
	align: 'middle',
	verticalAlign: 'middle',
	opacity: 1,
}

type Persisted = Pick<State, 'doc' | 'camera' | 'styles' | 'geo' | 'dark' | 'grid' | 'minimap'>

function load(): Partial<Persisted> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return {}
		const data = JSON.parse(raw) as Partial<Persisted>
		if (data.doc && (!data.doc.shapes || !Array.isArray(data.doc.order))) delete data.doc
		return data
	} catch {
		return {}
	}
}

function initialState(): State {
	const saved = load()
	return {
		doc: saved.doc ?? { shapes: {}, order: [] },
		camera: saved.camera ?? { x: 0, y: 0, z: 1 },
		viewport: { w: window.innerWidth, h: window.innerHeight },
		selectedIds: [],
		hoveredId: null,
		editingId: null,
		erasingIds: [],
		tool: 'select',
		geo: saved.geo ?? 'rectangle',
		styles: { ...DEFAULT_STYLES, ...saved.styles },
		dark: saved.dark ?? false,
		grid: saved.grid ?? false,
		minimap: saved.minimap ?? false,
		toolLock: false,
		brush: null,
		scribble: null,
		cursor: 'default',
		canUndo: false,
		canRedo: false,
		dialog: null,
		sync: 'off',
	}
}

let state: State = initialState()
const listeners = new Set<() => void>()

export const getState = () => state
export const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

let persistTimer: number | undefined
function persist() {
	persistTimer = undefined
	const { doc, camera, styles, geo, dark, grid, minimap } = state
	const data: Persisted = { doc, camera, styles, geo, dark, grid, minimap }
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
	} catch {
		// Storage is full (large images) or unavailable; the session keeps working in memory.
	}
}

export function setState(patch: Partial<State>) {
	state = { ...state, ...patch }
	for (const listener of listeners) listener()
	if (persistTimer === undefined) persistTimer = window.setTimeout(persist, 400)
}

/** Subscribe a component to a slice of state. The selector must return a stable reference. */
export function useStore<T>(selector: (s: State) => T): T {
	return useSyncExternalStore(subscribe, () => selector(state))
}

// ---- history ----

const undoStack: Doc[] = []
const redoStack: Doc[] = []
let gestureDoc: Doc | null = null

function pushUndo(doc: Doc) {
	undoStack.push(doc)
	if (undoStack.length > MAX_HISTORY) undoStack.shift()
	redoStack.length = 0
}

const historyFlags = () => ({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 })

/** Start a gesture: document changes until commit() collapse into one undo step. */
export function begin() {
	if (!gestureDoc) gestureDoc = state.doc
}

/** True when two documents hold the same shapes in the same order (by reference). */
function sameDoc(a: Doc, b: Doc) {
	if (a === b) return true
	if (a.order.length !== b.order.length) return false
	return a.order.every((id, i) => id === b.order[i] && a.shapes[id] === b.shapes[id])
}

export function commit() {
	if (!gestureDoc) return
	if (!sameDoc(gestureDoc, state.doc)) pushUndo(gestureDoc)
	gestureDoc = null
	setState(historyFlags())
}

export function cancel() {
	if (!gestureDoc) return
	const doc = gestureDoc
	gestureDoc = null
	setState({ doc, selectedIds: state.selectedIds.filter((id) => doc.shapes[id]) })
}

/** Change the document. Outside a gesture each call is its own undo step. */
export function apply(fn: (doc: Doc) => Doc, patch?: Partial<State>) {
	const prev = state.doc
	const next = fn(prev)
	if (next === prev) {
		if (patch) setState(patch)
		return
	}
	if (!gestureDoc) pushUndo(prev)
	setState({ doc: next, ...historyFlags(), ...patch })
}

function restore(from: Doc[], to: Doc[]) {
	commit()
	const doc = from.pop()
	if (!doc) return
	to.push(state.doc)
	setState({
		doc,
		selectedIds: state.selectedIds.filter((id) => doc.shapes[id]),
		editingId: null,
		hoveredId: null,
		...historyFlags(),
	})
}

/** Swap in a different drawing wholesale, such as the one saved to an account. Undo history does not carry over. */
export function resetDoc(doc: Doc) {
	undoStack.length = 0
	redoStack.length = 0
	gestureDoc = null
	setState({ doc, selectedIds: [], hoveredId: null, editingId: null, erasingIds: [], ...historyFlags() })
}

export const undo = () => restore(undoStack, redoStack)
export const redo = () => restore(redoStack, undoStack)

// ---- document helpers ----

export const createId = () => `shape:${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`

/** Add shapes, or replace the ones that already exist. New shapes go on top. */
export function putShapes(doc: Doc, shapes: Shape[]): Doc {
	if (!shapes.length) return doc
	const next = { ...doc.shapes }
	const added: string[] = []
	for (const s of shapes) {
		if (!next[s.id]) added.push(s.id)
		next[s.id] = s
	}
	return { shapes: next, order: added.length ? [...doc.order, ...added] : doc.order }
}

export function updateShapes(doc: Doc, ids: string[], fn: (s: Shape) => Shape): Doc {
	const changed: Shape[] = []
	for (const id of ids) {
		const s = doc.shapes[id]
		if (!s) continue
		const next = fn(s)
		if (next !== s) changed.push(next)
	}
	return putShapes(doc, changed)
}

/** Remove shapes. Arrows bound to a removed shape keep their current endpoint. */
export function removeShapes(doc: Doc, ids: string[]): Doc {
	const gone = new Set(ids.filter((id) => doc.shapes[id]))
	if (!gone.size) return doc
	const shapes: Record<string, Shape> = {}
	for (const id of doc.order) {
		if (gone.has(id)) continue
		const s = doc.shapes[id]
		if (s.type === 'arrow' && ((s.startBinding && gone.has(s.startBinding.id)) || (s.endBinding && gone.has(s.endBinding.id)))) {
			const resolved = resolveArrow(s, doc)
			shapes[id] = {
				...s,
				a: resolved.a,
				b: resolved.b,
				startBinding: s.startBinding && gone.has(s.startBinding.id) ? undefined : s.startBinding,
				endBinding: s.endBinding && gone.has(s.endBinding.id) ? undefined : s.endBinding,
			}
		} else {
			shapes[id] = s
		}
	}
	return { shapes, order: doc.order.filter((id) => !gone.has(id)) }
}

// ---- camera ----

export const screenToPage = (p: Vec, camera: Camera = state.camera): Vec => ({
	x: p.x / camera.z - camera.x,
	y: p.y / camera.z - camera.y,
})

export const pageToScreen = (p: Vec, camera: Camera = state.camera): Vec => ({
	x: (p.x + camera.x) * camera.z,
	y: (p.y + camera.y) * camera.z,
})

export const viewportPageBounds = (s: State = state): Box => ({
	x: -s.camera.x,
	y: -s.camera.y,
	w: s.viewport.w / s.camera.z,
	h: s.viewport.h / s.camera.z,
})
