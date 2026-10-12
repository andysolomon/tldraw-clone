import {
	boxCenter,
	boxContainsBox,
	clamp,
	getContentBounds,
	getSelectionBounds,
	vec,
} from './geometry'
import { sizeNoteShape, sizeTextShape } from './measure'
import {
	type AlignMode,
	type ReorderMode,
	alignShapes,
	cloneShapes,
	distributeShapes,
	reorderShapes,
	rotateShape,
} from './ops'
import {
	apply,
	begin,
	commit,
	createId,
	getState,
	putShapes,
	removeShapes,
	screenToPage,
	setState,
	updateShapes,
	viewportPageBounds,
} from './store'
import { FONT_SIZES, MAX_ZOOM, MIN_ZOOM, NOTE_SIZE, ZOOM_STEPS } from './theme'
import type { Box, Doc, GeoType, Shape, ShapeType, StyleKey, Styles, TextShape, ToolId, Vec } from './types'

// ---- tools ----

const TOOL_CURSORS: Record<ToolId, string> = {
	select: 'default',
	hand: 'grab',
	draw: 'crosshair',
	eraser: 'crosshair',
	arrow: 'crosshair',
	text: 'crosshair',
	note: 'crosshair',
	geo: 'crosshair',
	line: 'crosshair',
	highlight: 'crosshair',
	laser: 'crosshair',
	frame: 'crosshair',
}

export const toolCursor = (tool: ToolId) => TOOL_CURSORS[tool]

export function setTool(tool: ToolId, geo?: GeoType) {
	endEditing()
	const s = getState()
	const keepSelection = tool === 'select' || tool === 'hand' || tool === 'laser'
	setState({
		tool,
		geo: geo ?? s.geo,
		cursor: TOOL_CURSORS[tool],
		selectedIds: keepSelection ? s.selectedIds : [],
		hoveredId: null,
		brush: null,
	})
}

// ---- text editing ----

export function startEditing(id: string) {
	endEditing()
	begin()
	setState({ editingId: id, selectedIds: [id], hoveredId: null })
}

export function endEditing() {
	const s = getState()
	const id = s.editingId
	if (!id) return
	const shape = s.doc.shapes[id]
	if (shape?.type === 'text' && !shape.text.trim()) {
		setState({
			editingId: null,
			doc: removeShapes(s.doc, [id]),
			selectedIds: s.selectedIds.filter((x) => x !== id),
		})
	} else {
		setState({ editingId: null })
	}
	commit()
}

export function setShapeText(id: string, text: string) {
	apply((doc) =>
		updateShapes(doc, [id], (s) => {
			if (s.type === 'text') return sizeTextShape({ ...s, text })
			if (s.type === 'note') return sizeNoteShape({ ...s, text })
			if (s.type === 'geo') return { ...s, text }
			return s
		})
	)
}

export function createTextShape(page: Vec, text = ''): TextShape {
	const { styles } = getState()
	const base: TextShape = {
		id: createId(),
		type: 'text',
		x: page.x,
		y: page.y,
		rotation: 0,
		opacity: styles.opacity,
		color: styles.color,
		size: styles.size,
		font: styles.font,
		align: 'start',
		text,
		w: 8,
		h: FONT_SIZES[styles.size] * 1.35,
		scale: 1,
	}
	const sized = sizeTextShape(base)
	// sizeTextShape keeps an alignment anchor; a new shape should simply start at the point
	return { ...sized, x: page.x, y: page.y - sized.h / 2 }
}

// ---- styles ----

const ALL_TYPES: ShapeType[] = ['geo', 'draw', 'highlight', 'line', 'arrow', 'text', 'note', 'frame', 'image']

export const STYLE_SUPPORT: Record<StyleKey, ShapeType[]> = {
	color: ['geo', 'draw', 'highlight', 'line', 'arrow', 'text', 'note', 'frame'],
	opacity: ALL_TYPES,
	fill: ['geo', 'draw'],
	dash: ['geo', 'draw', 'line', 'arrow'],
	size: ['geo', 'draw', 'highlight', 'line', 'arrow', 'text', 'note'],
	font: ['geo', 'text', 'note'],
	align: ['geo', 'text', 'note'],
	verticalAlign: ['geo', 'note'],
}

/** Which shape type a tool is about to create, for deciding which styles to offer. */
export const TOOL_SHAPE: Partial<Record<ToolId, ShapeType>> = {
	select: 'draw',
	draw: 'draw',
	geo: 'geo',
	arrow: 'arrow',
	line: 'line',
	text: 'text',
	note: 'note',
	highlight: 'highlight',
	frame: 'frame',
}

function resize(s: Shape): Shape {
	if (s.type === 'text') return sizeTextShape(s)
	if (s.type === 'note') return sizeNoteShape(s)
	return s
}

export function setStyle<K extends StyleKey>(key: K, value: Styles[K]) {
	const s = getState()
	apply(
		(doc) =>
			updateShapes(doc, s.selectedIds, (shape) =>
				STYLE_SUPPORT[key].includes(shape.type) ? resize({ ...shape, [key]: value } as Shape) : shape
			),
		{ styles: { ...s.styles, [key]: value } }
	)
}

export function setGeo(geo: GeoType) {
	const s = getState()
	apply((doc) => updateShapes(doc, s.selectedIds, (shape) => (shape.type === 'geo' ? { ...shape, geo } : shape)), {
		geo,
	})
}

/** Fonts load after first paint; text boxes measured before then need a second pass. */
export function remeasureText() {
	const s = getState()
	setState({ doc: updateShapes(s.doc, s.doc.order, resize) })
}

// ---- selection commands ----

const selection = () => {
	const s = getState()
	const picked = new Set(s.selectedIds)
	return s.doc.order.filter((id) => picked.has(id))
}

export function deleteSelected() {
	const ids = selection()
	if (!ids.length) return
	apply((doc) => removeShapes(doc, ids), { selectedIds: [], hoveredId: null })
}

export function selectAll() {
	if (getState().tool !== 'select') setTool('select')
	setState({ selectedIds: [...getState().doc.order] })
}

export const selectNone = () => setState({ selectedIds: [] })

export function duplicateSelected() {
	const ids = selection()
	if (!ids.length) return
	const clones = cloneShapes(getState().doc, ids, vec(20, 20))
	apply((doc) => putShapes(doc, clones), { selectedIds: clones.map((c) => c.id) })
}

export function nudge(dx: number, dy: number) {
	const ids = selection()
	if (!ids.length) return
	apply((doc) => updateShapes(doc, ids, (s) => ({ ...s, x: s.x + dx, y: s.y + dy })))
}

export const reorder = (mode: ReorderMode) => apply((doc) => reorderShapes(doc, selection(), mode))
export const align = (mode: AlignMode) => apply((doc) => alignShapes(doc, selection(), mode))
export const distribute = (axis: 'horizontal' | 'vertical') =>
	apply((doc) => distributeShapes(doc, selection(), axis))

export function rotateSelected(delta: number) {
	const ids = selection()
	const bounds = getSelectionBounds(getState().doc, ids)
	if (!bounds) return
	const center = boxCenter(bounds)
	apply((doc) => updateShapes(doc, ids, (s) => rotateShape(s, center, delta)))
}

export function groupSelected() {
	const ids = selection()
	if (ids.length < 2) return
	const groupId = createId()
	apply((doc) => updateShapes(doc, ids, (s) => ({ ...s, groupId })))
}

export function ungroupSelected() {
	const ids = selection()
	apply((doc) => updateShapes(doc, ids, (s) => (s.groupId ? { ...s, groupId: undefined } : s)))
}

// ---- clipboard ----

const CLIP_TYPE = 'tldraw-clone/shapes'
let clipboard: Shape[] = []
let pasteCount = 0

export function copy(): boolean {
	const ids = selection()
	if (!ids.length) return false
	clipboard = cloneShapes(getState().doc, ids, vec(0, 0))
	pasteCount = 0
	return true
}

export const clipboardText = () => JSON.stringify({ type: CLIP_TYPE, shapes: clipboard })
export const hasClipboard = () => clipboard.length > 0

export function cut(): boolean {
	if (!copy()) return false
	deleteSelected()
	return true
}

function pasteShapes(shapes: Shape[]) {
	if (!shapes.length) return
	const temp: Doc = { shapes: Object.fromEntries(shapes.map((s) => [s.id, s])), order: shapes.map((s) => s.id) }
	const bounds = getContentBounds(temp)
	if (!bounds) return
	const view = viewportPageBounds()
	pasteCount++
	// paste next to the original while it is on screen, otherwise in the middle of the view
	const offset = boxContainsBox(view, bounds)
		? vec(20 * pasteCount, 20 * pasteCount)
		: vec(view.x + view.w / 2 - (bounds.x + bounds.w / 2), view.y + view.h / 2 - (bounds.y + bounds.h / 2))
	const clones = cloneShapes(temp, temp.order, offset)
	if (getState().tool !== 'select') setTool('select')
	apply((doc) => putShapes(doc, clones), { selectedIds: clones.map((c) => c.id) })
}

export const paste = () => pasteShapes(clipboard)

/** Handle a system paste: our own shapes, an image file, or plain text. */
export function pasteFromClipboardData(data: DataTransfer) {
	const file = Array.from(data.files).find((f) => f.type.startsWith('image/'))
	if (file) {
		void insertImage(file)
		return
	}
	const text = data.getData('text/plain')
	if (!text) {
		paste()
		return
	}
	try {
		const parsed = JSON.parse(text)
		if (parsed?.type === CLIP_TYPE && Array.isArray(parsed.shapes)) {
			clipboard = parsed.shapes
			pasteShapes(clipboard)
			return
		}
	} catch {
		// not ours; fall through and paste it as text
	}
	const view = viewportPageBounds()
	const shape = createTextShape(vec(view.x + view.w / 2, view.y + view.h / 2), text)
	const centered = { ...shape, x: shape.x - shape.w / 2 }
	if (getState().tool !== 'select') setTool('select')
	apply((doc) => putShapes(doc, [centered]), { selectedIds: [centered.id] })
}

// ---- images ----

export async function insertImage(file: File) {
	const src = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(file)
	})
	const img = new Image()
	img.src = src
	await img.decode()
	const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight))
	const w = img.naturalWidth * scale
	const h = img.naturalHeight * scale
	const view = viewportPageBounds()
	const shape: Shape = {
		id: createId(),
		type: 'image',
		x: view.x + view.w / 2 - w / 2,
		y: view.y + view.h / 2 - h / 2,
		rotation: 0,
		opacity: 1,
		color: 'black',
		size: 'm',
		w,
		h,
		src,
	}
	setTool('select')
	apply((doc) => putShapes(doc, [shape]), { selectedIds: [shape.id] })
}

export function pickImage() {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = 'image/*'
	input.onchange = () => {
		const file = input.files?.[0]
		if (file) void insertImage(file)
	}
	input.click()
}

// ---- camera ----

export function zoomTo(z: number, anchor?: Vec) {
	const s = getState()
	const a = anchor ?? vec(s.viewport.w / 2, s.viewport.h / 2)
	const nz = clamp(z, MIN_ZOOM, MAX_ZOOM)
	const page = screenToPage(a, s.camera)
	setState({ camera: { x: a.x / nz - page.x, y: a.y / nz - page.y, z: nz } })
}

export const zoomIn = () => zoomTo(ZOOM_STEPS.find((z) => z > getState().camera.z + 1e-6) ?? MAX_ZOOM)
export const zoomOut = () =>
	zoomTo([...ZOOM_STEPS].reverse().find((z) => z < getState().camera.z - 1e-6) ?? MIN_ZOOM)
export const resetZoom = () => zoomTo(1)

export function zoomToBounds(b: Box) {
	const { viewport } = getState()
	const pad = Math.min(128, viewport.w * 0.15)
	const z = clamp(
		Math.min((viewport.w - pad * 2) / Math.max(b.w, 1), (viewport.h - pad * 2) / Math.max(b.h, 1)),
		MIN_ZOOM,
		MAX_ZOOM
	)
	setState({ camera: { x: viewport.w / 2 / z - (b.x + b.w / 2), y: viewport.h / 2 / z - (b.y + b.h / 2), z } })
}

export function zoomToFit() {
	const b = getContentBounds(getState().doc)
	if (b) zoomToBounds(b)
}

export function zoomToSelection() {
	const s = getState()
	const b = getSelectionBounds(s.doc, s.selectedIds)
	if (b) zoomToBounds(b)
}

export function panBy(dx: number, dy: number) {
	const { camera } = getState()
	setState({ camera: { ...camera, x: camera.x + dx / camera.z, y: camera.y + dy / camera.z } })
}

// ---- preferences ----

export const toggleDark = () => setState({ dark: !getState().dark })
export const toggleGrid = () => setState({ grid: !getState().grid })
export const toggleMinimap = () => setState({ minimap: !getState().minimap })
export const toggleToolLock = () => setState({ toolLock: !getState().toolLock })

// ---- documents ----

export function clearDocument() {
	apply(() => ({ shapes: {}, order: [] }), { selectedIds: [], hoveredId: null })
}

export function loadDocument(doc: Doc) {
	apply(() => doc, { selectedIds: [], hoveredId: null })
	zoomToFit()
}

/** Size of the shape a plain click creates. tldraw drops a 200×200 geo shape centered on the click. */
export const defaultBoxSize = (kind: 'geo' | 'frame') =>
	kind === 'frame' ? { w: 320, h: 180 } : { w: NOTE_SIZE, h: NOTE_SIZE }
