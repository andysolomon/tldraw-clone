import { createTextShape, defaultBoxSize, startEditing, toolCursor } from './actions'
import {
	bindingAnchor,
	boxCenter,
	boxContainsBox,
	boxContainsPoint,
	boxFromTwoPoints,
	boxUnion,
	clamp,
	dist,
	getLocalBounds,
	getPageBounds,
	getPageCenter,
	getPageOutline,
	getSelectionBounds,
	getShapeAtPoint,
	hitTestShape,
	lerp,
	mid,
	norm,
	outlineIntersectsBox,
	per,
	resolveArrow,
	resolveShape,
	rot,
	strokeWidth,
	sub,
	toLocal,
	vec,
} from './geometry'
import { sizeNoteShape, sizeTextShape } from './measure'
import { type ResizeFrame, cloneShapes, expandGroups, getFrameContents, resizeShape, rotateShape } from './ops'
import { begin, cancel, commit, createId, getState, putShapes, removeShapes, setState } from './store'
import { NOTE_SIZE } from './theme'
import type { ArrowShape, Binding, Box, Camera, Doc, DrawShape, ResizeHandle, Shape, ShapeType, Vec } from './types'

export interface PointerInfo {
	/** Position relative to the canvas element. */
	screen: Vec
	page: Vec
	shift: boolean
	alt: boolean
	button: number
	pressure: number
	/** `data-handle` of the overlay element under the pointer, if any. */
	handle: string | null
}

type Interaction =
	| { type: 'idle' }
	| { type: 'pan'; screen: Vec; camera: Camera }
	| { type: 'pointCanvas'; origin: Vec; screen: Vec; initial: string[] }
	| { type: 'brush'; origin: Vec; initial: string[] }
	| { type: 'pointShape'; id: string | null; origin: Vec; screen: Vec; onUp: 'none' | 'toggle' | 'isolate' | 'clear' }
	| { type: 'translate'; origin: Vec; initial: Shape[] }
	| { type: 'resize'; handle: ResizeHandle; frame: ResizeFrame; b0: Box; initial: Shape[]; lockAspect: boolean }
	| { type: 'rotate'; center: Vec; startAngle: number; initial: Shape[] }
	| { type: 'point'; id: string; which: 'a' | 'b' | 'bend' }
	| { type: 'createBox'; id: string; kind: 'geo' | 'frame'; origin: Vec; screen: Vec; moved: boolean }
	| { type: 'createLine'; id: string; kind: 'arrow' | 'line'; origin: Vec; screen: Vec; moved: boolean }
	| { type: 'draw'; id: string; origin: Vec }
	| { type: 'erase'; last: Vec }
	| { type: 'laser' }

const DRAG_DISTANCE = 4
const SNAP_ANGLE = Math.PI / 12
const BINDABLE: ShapeType[] = ['geo', 'note', 'text', 'frame', 'image']

let ix: Interaction = { type: 'idle' }
let spaceHeld = false
let laserTimer: number | undefined

export const isInteracting = () => ix.type !== 'idle'

export function setSpaceHeld(held: boolean) {
	if (spaceHeld === held) return
	spaceHeld = held
	if (ix.type === 'idle') setState({ cursor: held ? 'grab' : toolCursor(getState().tool) })
}

const setDoc = (doc: Doc) => setState({ doc })
const hitMargin = () => 4 / getState().camera.z

function baseProps() {
	const { styles } = getState()
	return { rotation: 0, opacity: styles.opacity, color: styles.color, size: styles.size }
}

/** Return to the select tool with the new shape selected, unless the tool is locked. */
function finishCreate(id: string) {
	commit()
	if (getState().toolLock) setState({ selectedIds: [] })
	else setState({ tool: 'select', cursor: 'default', selectedIds: [id] })
}

function createAndEdit(shape: Shape) {
	begin()
	const s = getState()
	setState({
		doc: putShapes(s.doc, [shape]),
		editingId: shape.id,
		selectedIds: [shape.id],
		hoveredId: null,
		...(s.toolLock ? {} : { tool: 'select' as const, cursor: 'default' }),
	})
}

function findBindTarget(doc: Doc, page: Vec, arrowId: string, precise: boolean, skipId?: string) {
	const target = getShapeAtPoint(
		doc,
		page,
		0,
		(s) => s.id !== arrowId && s.id !== skipId && BINDABLE.includes(s.type)
	)
	if (!target) return null
	const b = getLocalBounds(target)
	let nx = 0.5
	let ny = 0.5
	if (precise) {
		const local = toLocal(target, page)
		nx = clamp((local.x - b.x) / (b.w || 1), 0, 1)
		ny = clamp((local.y - b.y) / (b.h || 1), 0, 1)
	}
	const binding: Binding = { id: target.id, nx, ny }
	return { binding, point: bindingAnchor(target, binding) }
}

/** Snap the direction from `from` to `to` onto 15° steps. */
function snapAngle(from: Vec, to: Vec): Vec {
	const d = sub(to, from)
	const angle = Math.round(Math.atan2(d.y, d.x) / SNAP_ANGLE) * SNAP_ANGLE
	const length = Math.hypot(d.x, d.y)
	return vec(from.x + Math.cos(angle) * length, from.y + Math.sin(angle) * length)
}

// ---- starting interactions ----

function startTranslate(origin: Vec, clone: boolean) {
	const started = { type: 'translate' as const, origin, initial: [] as Shape[] }
	begin()
	const s = getState()
	let doc = s.doc
	let ids = expandGroups(doc, s.selectedIds)
	if (clone) {
		const clones = cloneShapes(doc, ids, vec(0, 0))
		doc = putShapes(doc, clones)
		ids = clones.map((c) => c.id)
		setState({ doc, selectedIds: ids })
	}
	const moving = new Set([...ids, ...getFrameContents(doc, ids)])
	const { initial } = started
	for (const id of moving) {
		let shape = doc.shapes[id]
		if (!shape) continue
		if (shape.type === 'arrow') {
			// an arrow dragged away from a shape it is attached to lets go of it
			const keepA = !!shape.startBinding && moving.has(shape.startBinding.id)
			const keepB = !!shape.endBinding && moving.has(shape.endBinding.id)
			if ((shape.startBinding && !keepA) || (shape.endBinding && !keepB)) {
				const r = resolveArrow(shape, doc)
				shape = {
					...shape,
					a: r.a,
					b: r.b,
					startBinding: keepA ? shape.startBinding : undefined,
					endBinding: keepB ? shape.endBinding : undefined,
				}
			}
		}
		initial.push(shape)
	}
	ix = started
	setState({ hoveredId: null })
	return started
}

function startResize(handle: ResizeHandle) {
	const s = getState()
	const initial = s.selectedIds.filter((id) => s.doc.shapes[id]).map((id) => resolveShape(s.doc.shapes[id], s.doc))
	if (!initial.length) return
	begin()
	const single = initial.length === 1 ? initial[0] : null
	const frame: ResizeFrame = single
		? { origin: vec(single.x, single.y), rotation: single.rotation }
		: { origin: vec(0, 0), rotation: 0 }
	const b0 = single ? getLocalBounds(single) : boxUnion(initial.map(getPageBounds))
	const lockAspect = initial.every((shape) => shape.type === 'text' || shape.type === 'image')
	ix = { type: 'resize', handle, frame, b0, initial, lockAspect }
	setState({ hoveredId: null })
}

function startRotate(page: Vec) {
	const s = getState()
	const initial = s.selectedIds.filter((id) => s.doc.shapes[id]).map((id) => s.doc.shapes[id])
	if (!initial.length) return
	begin()
	const center =
		initial.length === 1
			? getPageCenter(resolveShape(initial[0], s.doc))
			: boxCenter(getSelectionBounds(s.doc, s.selectedIds)!)
	ix = { type: 'rotate', center, startAngle: Math.atan2(page.y - center.y, page.x - center.x), initial }
	setState({ hoveredId: null, cursor: 'grabbing' })
}

// ---- pointer down ----

export function pointerDown(e: PointerInfo) {
	const s = getState()
	if (e.button === 2) return
	if (e.button === 1 || spaceHeld || s.tool === 'hand') {
		ix = { type: 'pan', screen: e.screen, camera: s.camera }
		setState({ cursor: 'grabbing' })
		return
	}

	switch (s.tool) {
		case 'select': {
			if (e.handle) {
				const [kind, which] = e.handle.split(':')
				if (kind === 'resize') startResize(which as ResizeHandle)
				else if (kind === 'rotate') startRotate(e.page)
				else if (kind === 'point' && s.selectedIds[0]) {
					begin()
					ix = { type: 'point', id: s.selectedIds[0], which: which as 'a' | 'b' | 'bend' }
				}
				return
			}
			const hit = getShapeAtPoint(s.doc, e.page, hitMargin())
			if (hit) {
				const ids = expandGroups(s.doc, [hit.id])
				const isSelected = s.selectedIds.includes(hit.id)
				let onUp: 'none' | 'toggle' | 'isolate' = 'none'
				if (e.shift) {
					if (isSelected) onUp = 'toggle'
					else setState({ selectedIds: [...new Set([...s.selectedIds, ...ids])] })
				} else if (!isSelected) {
					setState({ selectedIds: ids })
				} else if (s.selectedIds.length > ids.length) {
					onUp = 'isolate'
				}
				ix = { type: 'pointShape', id: hit.id, origin: e.page, screen: e.screen, onUp }
				return
			}
			// empty space inside a multi-selection still drags the selection
			const bounds = s.selectedIds.length > 1 ? getSelectionBounds(s.doc, s.selectedIds) : null
			if (bounds && boxContainsPoint(bounds, e.page) && !e.shift) {
				ix = { type: 'pointShape', id: null, origin: e.page, screen: e.screen, onUp: 'clear' }
				return
			}
			if (!e.shift) setState({ selectedIds: [] })
			ix = { type: 'pointCanvas', origin: e.page, screen: e.screen, initial: e.shift ? s.selectedIds : [] }
			return
		}

		case 'draw':
		case 'highlight': {
			begin()
			const shape: DrawShape = {
				...baseProps(),
				id: createId(),
				type: s.tool,
				x: e.page.x,
				y: e.page.y,
				points: [[0, 0, e.pressure]],
				fill: s.styles.fill,
				dash: s.styles.dash,
				isClosed: false,
				isComplete: false,
			}
			setState({ doc: putShapes(s.doc, [shape]), selectedIds: [] })
			ix = { type: 'draw', id: shape.id, origin: e.page }
			return
		}

		case 'eraser':
			begin()
			ix = { type: 'erase', last: e.page }
			setState({ scribble: { kind: 'eraser', points: [e.page] } })
			eraseAlong(e.page, e.page)
			return

		case 'laser':
			window.clearTimeout(laserTimer)
			ix = { type: 'laser' }
			setState({ scribble: { kind: 'laser', points: [e.page] } })
			return

		case 'geo':
		case 'frame':
			begin()
			ix = { type: 'createBox', id: createId(), kind: s.tool, origin: e.page, screen: e.screen, moved: false }
			return

		case 'arrow':
		case 'line':
			begin()
			ix = { type: 'createLine', id: createId(), kind: s.tool, origin: e.page, screen: e.screen, moved: false }
			return

		case 'text':
			createAndEdit(createTextShape(e.page))
			return

		case 'note': {
			const note: Shape = sizeNoteShape({
				...baseProps(),
				id: createId(),
				type: 'note',
				x: e.page.x - NOTE_SIZE / 2,
				y: e.page.y - NOTE_SIZE / 2,
				text: '',
				font: s.styles.font,
				align: s.styles.align,
				verticalAlign: s.styles.verticalAlign,
				h: NOTE_SIZE,
			})
			createAndEdit(note)
			return
		}
	}
}

// ---- pointer move ----

function boxShape(id: string, kind: 'geo' | 'frame', box: Box): Shape {
	const s = getState()
	const base = { ...baseProps(), id, x: box.x, y: box.y, w: Math.max(box.w, 1), h: Math.max(box.h, 1) }
	if (kind === 'frame') return { ...base, type: 'frame', name: 'Frame' }
	return {
		...base,
		type: 'geo',
		geo: s.geo,
		fill: s.styles.fill,
		dash: s.styles.dash,
		font: s.styles.font,
		align: s.styles.align,
		verticalAlign: s.styles.verticalAlign,
		text: '',
	}
}

function eraseAlong(from: Vec, to: Vec) {
	const s = getState()
	const margin = hitMargin()
	const steps = clamp(Math.ceil(dist(from, to) / (3 / s.camera.z)), 1, 60)
	const erasing = new Set(s.erasingIds)
	for (let i = 0; i <= steps; i++) {
		const p = lerp(from, to, i / steps)
		for (const id of s.doc.order) {
			if (erasing.has(id)) continue
			const hit = hitTestShape(resolveShape(s.doc.shapes[id], s.doc), p, margin)
			if (hit === 'fill' || hit === 'edge') {
				for (const member of expandGroups(s.doc, [id])) erasing.add(member)
			}
		}
	}
	if (erasing.size !== s.erasingIds.length) setState({ erasingIds: [...erasing] })
}

function resizeBox(e: PointerInfo, i: Extract<Interaction, { type: 'resize' }>): Box {
	const { b0, frame, handle } = i
	const q = rot(sub(e.page, frame.origin), -frame.rotation)
	let left = b0.x
	let right = b0.x + b0.w
	let top = b0.y
	let bottom = b0.y + b0.h
	const movesLeft = handle.includes('left')
	const movesRight = handle.includes('right')
	const movesTop = handle.includes('top')
	const movesBottom = handle.includes('bottom')
	if (movesLeft) left = q.x
	if (movesRight) right = q.x
	if (movesTop) top = q.y
	if (movesBottom) bottom = q.y

	if ((e.shift || i.lockAspect) && b0.w && b0.h) {
		const isCorner = (movesLeft || movesRight) && (movesTop || movesBottom)
		const w = right - left
		const h = bottom - top
		if (isCorner) {
			const scale = Math.max(Math.abs(w) / b0.w, Math.abs(h) / b0.h)
			const nw = (Math.sign(w) || 1) * b0.w * scale
			const nh = (Math.sign(h) || 1) * b0.h * scale
			if (movesLeft) left = right - nw
			else right = left + nw
			if (movesTop) top = bottom - nh
			else bottom = top + nh
		} else if (movesLeft || movesRight) {
			const nh = (Math.abs(w) / b0.w) * b0.h
			top = b0.y + b0.h / 2 - nh / 2
			bottom = top + nh
		} else {
			const nw = (Math.abs(h) / b0.h) * b0.w
			left = b0.x + b0.w / 2 - nw / 2
			right = left + nw
		}
	}

	if (e.alt) {
		// resize around the center: mirror each moved edge onto its opposite
		const cx = b0.x + b0.w / 2
		const cy = b0.y + b0.h / 2
		if (movesLeft) right = 2 * cx - left
		else if (movesRight) left = 2 * cx - right
		if (movesTop) bottom = 2 * cy - top
		else if (movesBottom) top = 2 * cy - bottom
	}

	const w = right - left
	const h = bottom - top
	return { x: left, y: top, w: Math.abs(w) < 1 ? 1 : w, h: Math.abs(h) < 1 ? 1 : h }
}

function movePoint(e: PointerInfo, id: string, which: 'a' | 'b' | 'bend') {
	const s = getState()
	const shape = s.doc.shapes[id]
	if (!shape || (shape.type !== 'arrow' && shape.type !== 'line')) return
	const origin = vec(shape.x, shape.y)

	if (shape.type === 'line') {
		if (which === 'bend') return
		const other = which === 'a' ? shape.b : shape.a
		const local = sub(e.page, origin)
		setDoc(putShapes(s.doc, [{ ...shape, [which]: e.shift ? snapAngle(other, local) : local }]))
		return
	}

	if (which === 'bend') {
		const r = resolveArrow(shape, s.doc)
		const m0 = mid(r.a, r.b)
		const normal = per(norm(sub(r.b, r.a)))
		const offset = sub(sub(e.page, origin), m0)
		const bend = offset.x * normal.x + offset.y * normal.y
		setDoc(putShapes(s.doc, [{ ...shape, bend: Math.abs(bend) < 8 / s.camera.z ? 0 : bend }]))
		return
	}

	const otherBinding = which === 'a' ? shape.endBinding : shape.startBinding
	const target = findBindTarget(s.doc, e.page, id, e.alt, otherBinding?.id)
	const other = which === 'a' ? shape.b : shape.a
	const local = target ? sub(target.point, origin) : sub(e.page, origin)
	const next: ArrowShape = {
		...shape,
		[which]: !target && e.shift ? snapAngle(other, local) : local,
		[which === 'a' ? 'startBinding' : 'endBinding']: target?.binding,
	}
	setState({ doc: putShapes(s.doc, [next]), hoveredId: target?.binding.id ?? null })
}

function brushTo(page: Vec, origin: Vec, initial: string[]) {
	const s = getState()
	const brush = boxFromTwoPoints(origin, page)
	const picked = new Set(initial)
	for (const id of s.doc.order) {
		const shape = resolveShape(s.doc.shapes[id], s.doc)
		if (boxContainsBox(brush, getPageBounds(shape))) picked.add(id)
		else if (shape.type !== 'frame') {
			// frames are only picked up when fully enclosed, so you can brush the shapes inside one
			const { points, closed } = getPageOutline(shape)
			if (outlineIntersectsBox(points, closed, brush)) picked.add(id)
		}
	}
	setState({ brush, selectedIds: expandGroups(s.doc, [...picked]), hoveredId: null })
}

function translateTo(e: PointerInfo, origin: Vec, initial: Shape[]) {
	const d = sub(e.page, origin)
	if (e.shift) {
		if (Math.abs(d.x) > Math.abs(d.y)) d.y = 0
		else d.x = 0
	}
	setDoc(putShapes(getState().doc, initial.map((shape) => ({ ...shape, x: shape.x + d.x, y: shape.y + d.y }))))
}

export function pointerMove(e: PointerInfo) {
	const s = getState()
	switch (ix.type) {
		case 'idle': {
			if (s.tool !== 'select' || s.editingId) {
				if (s.hoveredId) setState({ hoveredId: null })
				return
			}
			const hit = e.handle ? null : getShapeAtPoint(s.doc, e.page, hitMargin())
			const hoveredId = hit && !s.selectedIds.includes(hit.id) ? hit.id : null
			if (hoveredId !== s.hoveredId) setState({ hoveredId })
			return
		}

		case 'pan': {
			const { camera, screen } = ix
			setState({
				camera: {
					...camera,
					x: camera.x + (e.screen.x - screen.x) / camera.z,
					y: camera.y + (e.screen.y - screen.y) / camera.z,
				},
			})
			return
		}

		case 'pointCanvas':
			if (dist(e.screen, ix.screen) < DRAG_DISTANCE) return
			ix = { type: 'brush', origin: ix.origin, initial: ix.initial }
			brushTo(e.page, ix.origin, ix.initial)
			return

		case 'brush':
			brushTo(e.page, ix.origin, ix.initial)
			return

		case 'pointShape': {
			if (dist(e.screen, ix.screen) < DRAG_DISTANCE) return
			const moving = startTranslate(ix.origin, e.alt)
			translateTo(e, moving.origin, moving.initial)
			return
		}

		case 'translate':
			translateTo(e, ix.origin, ix.initial)
			return

		case 'resize': {
			const { frame, b0, initial } = ix
			const b1 = resizeBox(e, ix)
			setDoc(
				putShapes(
					s.doc,
					initial.map((shape) => {
						const next = resizeShape(shape, frame, b0, b1)
						return next.type === 'text' ? sizeTextShape(next) : next
					})
				)
			)
			return
		}

		case 'rotate': {
			const { center, startAngle, initial } = ix
			let delta = Math.atan2(e.page.y - center.y, e.page.x - center.x) - startAngle
			if (e.shift) delta = Math.round(delta / SNAP_ANGLE) * SNAP_ANGLE
			setDoc(putShapes(s.doc, initial.map((shape) => rotateShape(shape, center, delta))))
			return
		}

		case 'point':
			movePoint(e, ix.id, ix.which)
			return

		case 'createBox': {
			if (!ix.moved && dist(e.screen, ix.screen) < DRAG_DISTANCE) return
			ix.moved = true
			let corner = e.page
			if (e.shift) {
				const d = sub(e.page, ix.origin)
				const side = Math.max(Math.abs(d.x), Math.abs(d.y))
				corner = vec(ix.origin.x + (Math.sign(d.x) || 1) * side, ix.origin.y + (Math.sign(d.y) || 1) * side)
			}
			const start = e.alt ? vec(2 * ix.origin.x - corner.x, 2 * ix.origin.y - corner.y) : ix.origin
			setState({ doc: putShapes(s.doc, [boxShape(ix.id, ix.kind, boxFromTwoPoints(start, corner))]), selectedIds: [ix.id] })
			return
		}

		case 'createLine': {
			if (!ix.moved && dist(e.screen, ix.screen) < DRAG_DISTANCE) return
			const origin = ix.origin
			let doc = s.doc
			if (!ix.moved) {
				ix.moved = true
				const base = { ...baseProps(), id: ix.id, x: origin.x, y: origin.y, a: vec(0, 0), b: vec(0, 0), dash: s.styles.dash }
				const shape: Shape =
					ix.kind === 'line'
						? { ...base, type: 'line' }
						: { ...base, type: 'arrow', bend: 0, startBinding: findBindTarget(doc, origin, ix.id, e.alt)?.binding }
				doc = putShapes(doc, [shape])
			}
			const shape = doc.shapes[ix.id]
			if (shape.type === 'line') {
				const local = sub(e.page, origin)
				setState({ doc: putShapes(doc, [{ ...shape, b: e.shift ? snapAngle(vec(0, 0), local) : local }]), selectedIds: [] })
			} else if (shape.type === 'arrow') {
				const target = findBindTarget(doc, e.page, ix.id, e.alt, shape.startBinding?.id)
				const local = target ? sub(target.point, origin) : sub(e.page, origin)
				setState({
					doc: putShapes(doc, [
						{ ...shape, b: !target && e.shift ? snapAngle(vec(0, 0), local) : local, endBinding: target?.binding },
					]),
					hoveredId: target?.binding.id ?? null,
					selectedIds: [],
				})
			}
			return
		}

		case 'draw': {
			const shape = s.doc.shapes[ix.id]
			if (!shape || (shape.type !== 'draw' && shape.type !== 'highlight')) return
			const p = sub(e.page, ix.origin)
			const last = shape.points[shape.points.length - 1]
			if (Math.hypot(p.x - last[0], p.y - last[1]) < 1 / s.camera.z) return
			setDoc(putShapes(s.doc, [{ ...shape, points: [...shape.points, [p.x, p.y, e.pressure]] }]))
			return
		}

		case 'erase': {
			eraseAlong(ix.last, e.page)
			ix.last = e.page
			const points = getState().scribble?.points ?? []
			setState({ scribble: { kind: 'eraser', points: [...points.slice(-24), e.page] } })
			return
		}

		case 'laser': {
			const points = s.scribble?.points ?? []
			setState({ scribble: { kind: 'laser', points: [...points.slice(-60), e.page] } })
			return
		}
	}
}

// ---- pointer up ----

export function pointerUp() {
	const s = getState()
	const done = ix
	ix = { type: 'idle' }
	const restCursor = spaceHeld ? 'grab' : toolCursor(s.tool)

	switch (done.type) {
		case 'idle':
			return

		case 'pan':
		case 'pointCanvas':
			setState({ cursor: restCursor })
			return

		case 'brush':
			setState({ brush: null })
			return

		case 'pointShape': {
			if (done.onUp === 'clear') setState({ selectedIds: [] })
			if (!done.id) return
			const ids = expandGroups(s.doc, [done.id])
			if (done.onUp === 'toggle') setState({ selectedIds: s.selectedIds.filter((id) => !ids.includes(id)) })
			if (done.onUp === 'isolate') setState({ selectedIds: ids })
			return
		}

		case 'translate':
		case 'resize':
		case 'point':
			commit()
			setState({ hoveredId: null })
			return

		case 'rotate':
			commit()
			setState({ cursor: restCursor })
			return

		case 'createBox': {
			if (!done.moved) {
				// a plain click drops a default-size shape centered on the pointer
				const size = defaultBoxSize(done.kind)
				const box = { x: done.origin.x - size.w / 2, y: done.origin.y - size.h / 2, ...size }
				setState({ doc: putShapes(s.doc, [boxShape(done.id, done.kind, box)]) })
			}
			finishCreate(done.id)
			return
		}

		case 'createLine':
			if (!done.moved) {
				cancel()
				return
			}
			setState({ hoveredId: null })
			finishCreate(done.id)
			return

		case 'draw': {
			const shape = s.doc.shapes[done.id]
			if (shape && (shape.type === 'draw' || shape.type === 'highlight')) {
				const first = shape.points[0]
				const last = shape.points[shape.points.length - 1]
				const isClosed =
					shape.type === 'draw' &&
					shape.points.length > 8 &&
					Math.hypot(first[0] - last[0], first[1] - last[1]) < strokeWidth(shape) * 3
				setState({ doc: putShapes(s.doc, [{ ...shape, isComplete: true, isClosed }]) })
			}
			commit()
			return
		}

		case 'erase': {
			const ids = s.erasingIds
			setState({ erasingIds: [], scribble: null, doc: removeShapes(s.doc, ids) })
			commit()
			return
		}

		case 'laser':
			laserTimer = window.setTimeout(() => {
				if (ix.type !== 'laser' && getState().scribble?.kind === 'laser') setState({ scribble: null })
			}, 500)
			return
	}
}

/** Abandon whatever the pointer is doing. Returns false when there was nothing to abandon. */
export function cancelInteraction(): boolean {
	if (ix.type === 'idle') return false
	ix = { type: 'idle' }
	cancel()
	setState({ brush: null, scribble: null, erasingIds: [], hoveredId: null, cursor: toolCursor(getState().tool) })
	return true
}

export function doubleClick(e: PointerInfo) {
	const s = getState()
	if (s.tool !== 'select' || e.handle) return
	const hit = getShapeAtPoint(s.doc, e.page, hitMargin())
	if (!hit) {
		createAndEdit(createTextShape(e.page))
		return
	}
	if (hit.type === 'geo' || hit.type === 'note' || hit.type === 'text') startEditing(hit.id)
}
