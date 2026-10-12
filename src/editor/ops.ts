import {
	add,
	boxCenter,
	boxUnion,
	clamp,
	getLocalBounds,
	getPageBounds,
	resolveArrow,
	resolveShape,
	rot,
	rotAround,
	sub,
	toPage,
	vec,
} from './geometry'
import { createId, putShapes } from './store'
import type { Binding, Box, Doc, Shape, Vec } from './types'

// Pure document transforms. Nothing here touches the store's state.

export interface ResizeFrame {
	origin: Vec
	rotation: number
}

const TAU = Math.PI * 2
export const normalizeAngle = (a: number) => ((a % TAU) + TAU) % TAU
const sameAngle = (a: number, b: number) => {
	const d = normalizeAngle(a - b)
	return d < 1e-3 || TAU - d < 1e-3
}

/** Move a shape so the center of its local bounds lands on a page point. */
function placeByCenter<T extends Shape>(s: T, center: Vec): T {
	const offset = rot(boxCenter(getLocalBounds(s)), s.rotation)
	return { ...s, x: center.x - offset.x, y: center.y - offset.y }
}

/**
 * Resize a shape as part of a selection whose box, measured in `frame`, changes from b0 to b1.
 * b1 may have negative width or height when the selection has been flipped.
 */
export function resizeShape(s: Shape, frame: ResizeFrame, b0: Box, b1: Box): Shape {
	const sx = b0.w ? b1.w / b0.w : 1
	const sy = b0.h ? b1.h / b0.h : 1
	const toFrame = (p: Vec) => rot(sub(p, frame.origin), -frame.rotation)
	const fromFrame = (q: Vec) => add(frame.origin, rot(q, frame.rotation))
	const map = (q: Vec) => vec(b1.x + (q.x - b0.x) * sx, b1.y + (q.y - b0.y) * sy)
	const aligned = sameAngle(s.rotation, frame.rotation)
	// uniform factor for shapes that can't stretch on one axis
	const k = Math.sqrt(Math.abs(sx * sy))
	const center = fromFrame(map(toFrame(toPage(s, boxCenter(getLocalBounds(s))))))
	const origin = fromFrame(map(toFrame(vec(s.x, s.y))))
	const px = aligned ? sx : k
	const py = aligned ? sy : k

	switch (s.type) {
		case 'note':
			return placeByCenter(s, center)
		case 'text':
			return placeByCenter({ ...s, scale: clamp(s.scale * k, 0.2, 40), w: s.w * k, h: s.h * k }, center)
		case 'geo':
		case 'frame':
		case 'image':
			return placeByCenter({ ...s, w: Math.max(1, s.w * Math.abs(px)), h: Math.max(1, s.h * Math.abs(py)) }, center)
		case 'line': {
			const next = { ...s, a: vec(s.a.x * px, s.a.y * py), b: vec(s.b.x * px, s.b.y * py) }
			return aligned ? { ...next, x: origin.x, y: origin.y } : placeByCenter(next, center)
		}
		case 'arrow': {
			const next = {
				...s,
				a: vec(s.a.x * px, s.a.y * py),
				b: vec(s.b.x * px, s.b.y * py),
				bend: s.bend * k * Math.sign(px * py || 1),
			}
			return aligned ? { ...next, x: origin.x, y: origin.y } : placeByCenter(next, center)
		}
		case 'draw':
		case 'highlight': {
			const next = { ...s, points: s.points.map((p) => [p[0] * px, p[1] * py, p[2]]) }
			return aligned ? { ...next, x: origin.x, y: origin.y } : placeByCenter(next, center)
		}
	}
}

export function rotateShape(s: Shape, center: Vec, delta: number): Shape {
	const origin = rotAround(vec(s.x, s.y), center, delta)
	// lines and arrows carry their angle in their points, so they never need a rotation of their own
	if (s.type === 'arrow' || s.type === 'line') {
		return { ...s, x: origin.x, y: origin.y, a: rot(s.a, delta), b: rot(s.b, delta) }
	}
	return { ...s, x: origin.x, y: origin.y, rotation: normalizeAngle(s.rotation + delta) }
}

const boundsOf = (doc: Doc, id: string) => getPageBounds(resolveShape(doc.shapes[id], doc))

export type AlignMode = 'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom'

export function alignShapes(doc: Doc, ids: string[], mode: AlignMode): Doc {
	const live = ids.filter((id) => doc.shapes[id])
	if (live.length < 2) return doc
	const all = boxUnion(live.map((id) => boundsOf(doc, id)))
	return putShapes(
		doc,
		live.map((id) => {
			const s = doc.shapes[id]
			const b = boundsOf(doc, id)
			let dx = 0
			let dy = 0
			if (mode === 'left') dx = all.x - b.x
			if (mode === 'right') dx = all.x + all.w - (b.x + b.w)
			if (mode === 'center-horizontal') dx = all.x + all.w / 2 - (b.x + b.w / 2)
			if (mode === 'top') dy = all.y - b.y
			if (mode === 'bottom') dy = all.y + all.h - (b.y + b.h)
			if (mode === 'center-vertical') dy = all.y + all.h / 2 - (b.y + b.h / 2)
			return { ...s, x: s.x + dx, y: s.y + dy }
		})
	)
}

/** Space shapes so the gaps between them are equal; the outermost two stay put. */
export function distributeShapes(doc: Doc, ids: string[], axis: 'horizontal' | 'vertical'): Doc {
	const live = ids.filter((id) => doc.shapes[id])
	if (live.length < 3) return doc
	const pos = axis === 'horizontal' ? 'x' : 'y'
	const dim = axis === 'horizontal' ? 'w' : 'h'
	const items = live
		.map((id) => ({ s: doc.shapes[id], b: boundsOf(doc, id) }))
		.sort((p, q) => p.b[pos] + p.b[dim] / 2 - (q.b[pos] + q.b[dim] / 2))
	const first = items[0].b
	const last = items[items.length - 1].b
	const used = items.reduce((sum, item) => sum + item.b[dim], 0)
	const gap = (last[pos] + last[dim] - first[pos] - used) / (items.length - 1)
	let cursor = first[pos]
	return putShapes(
		doc,
		items.map(({ s, b }) => {
			const delta = cursor - b[pos]
			cursor += b[dim] + gap
			return { ...s, [pos]: s[pos] + delta }
		})
	)
}

export type ReorderMode = 'front' | 'forward' | 'backward' | 'back'

export function reorderShapes(doc: Doc, ids: string[], mode: ReorderMode): Doc {
	const selected = new Set(ids)
	const order = [...doc.order]
	if (mode === 'front' || mode === 'back') {
		const moving = order.filter((id) => selected.has(id))
		const rest = order.filter((id) => !selected.has(id))
		return { ...doc, order: mode === 'front' ? [...rest, ...moving] : [...moving, ...rest] }
	}
	if (mode === 'forward') {
		for (let i = order.length - 2; i >= 0; i--) {
			if (selected.has(order[i]) && !selected.has(order[i + 1])) {
				;[order[i], order[i + 1]] = [order[i + 1], order[i]]
			}
		}
	} else {
		for (let i = 1; i < order.length; i++) {
			if (selected.has(order[i]) && !selected.has(order[i - 1])) {
				;[order[i], order[i - 1]] = [order[i - 1], order[i]]
			}
		}
	}
	return { ...doc, order }
}

/** Every shape that shares a group with one of the given shapes, in z-order. */
export function expandGroups(doc: Doc, ids: string[]): string[] {
	const groups = new Set<string>()
	for (const id of ids) {
		const g = doc.shapes[id]?.groupId
		if (g) groups.add(g)
	}
	if (!groups.size) return ids
	const picked = new Set(ids)
	return doc.order.filter((id) => picked.has(id) || groups.has(doc.shapes[id].groupId ?? ''))
}

/**
 * Copy shapes with fresh ids. Bindings to shapes outside the copied set are dropped,
 * leaving the arrow end where it currently sits.
 */
export function cloneShapes(doc: Doc, ids: string[], offset: Vec): Shape[] {
	const idMap = new Map<string, string>()
	const groupMap = new Map<string, string>()
	for (const id of ids) idMap.set(id, createId())
	return ids
		.filter((id) => doc.shapes[id])
		.map((id) => {
			let s = doc.shapes[id]
			if (s.type === 'arrow') {
				const resolved = resolveArrow(s, doc)
				const keep = (b: Binding | undefined) => (b && idMap.has(b.id) ? { ...b, id: idMap.get(b.id)! } : undefined)
				s = { ...s, a: resolved.a, b: resolved.b, startBinding: keep(s.startBinding), endBinding: keep(s.endBinding) }
			}
			let groupId = s.groupId
			if (groupId) {
				if (!groupMap.has(groupId)) groupMap.set(groupId, createId())
				groupId = groupMap.get(groupId)
			}
			return { ...s, id: idMap.get(id)!, groupId, x: s.x + offset.x, y: s.y + offset.y }
		})
}

/** Shapes sitting entirely inside one of the given frames, so they travel with it. */
export function getFrameContents(doc: Doc, ids: string[]): string[] {
	const frames = ids.map((id) => doc.shapes[id]).filter((s) => s?.type === 'frame')
	if (!frames.length) return []
	const picked = new Set(ids)
	const out: string[] = []
	for (const frame of frames) {
		const fb = getPageBounds(frame)
		const z = doc.order.indexOf(frame.id)
		for (let i = z + 1; i < doc.order.length; i++) {
			const id = doc.order[i]
			if (picked.has(id)) continue
			const b = boundsOf(doc, id)
			if (b.x >= fb.x && b.y >= fb.y && b.x + b.w <= fb.x + fb.w && b.y + b.h <= fb.y + fb.h) {
				picked.add(id)
				out.push(id)
			}
		}
	}
	return out
}
