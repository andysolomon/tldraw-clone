import { NOTE_SIZE, STROKE_SIZES } from './theme'
import type { ArrowShape, Binding, Box, Doc, GeoType, Shape, Vec } from './types'

// ---- vectors ----

export const vec = (x: number, y: number): Vec => ({ x, y })
export const add = (a: Vec, b: Vec) => vec(a.x + b.x, a.y + b.y)
export const sub = (a: Vec, b: Vec) => vec(a.x - b.x, a.y - b.y)
export const mul = (a: Vec, s: number) => vec(a.x * s, a.y * s)
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec, b: Vec, t: number) => vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
export const mid = (a: Vec, b: Vec) => lerp(a, b, 0.5)
export const rot = (a: Vec, r: number) => {
	if (!r) return a
	const c = Math.cos(r)
	const s = Math.sin(r)
	return vec(a.x * c - a.y * s, a.x * s + a.y * c)
}
export const rotAround = (p: Vec, c: Vec, r: number) => add(c, rot(sub(p, c), r))
export const norm = (a: Vec) => {
	const l = len(a) || 1
	return vec(a.x / l, a.y / l)
}
export const per = (a: Vec) => vec(a.y, -a.x)
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

// ---- boxes ----

export function boxFromPoints(pts: Vec[]): Box {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const p of pts) {
		if (p.x < minX) minX = p.x
		if (p.y < minY) minY = p.y
		if (p.x > maxX) maxX = p.x
		if (p.y > maxY) maxY = p.y
	}
	if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
export const boxCorners = (b: Box): Vec[] => [
	vec(b.x, b.y),
	vec(b.x + b.w, b.y),
	vec(b.x + b.w, b.y + b.h),
	vec(b.x, b.y + b.h),
]
export const boxCenter = (b: Box) => vec(b.x + b.w / 2, b.y + b.h / 2)
export const boxUnion = (boxes: Box[]) => boxFromPoints(boxes.flatMap(boxCorners))
export const boxContainsPoint = (b: Box, p: Vec, m = 0) =>
	p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m
export const boxContainsBox = (a: Box, b: Box) =>
	b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
export const boxFromTwoPoints = (a: Vec, b: Vec): Box => ({
	x: Math.min(a.x, b.x),
	y: Math.min(a.y, b.y),
	w: Math.abs(a.x - b.x),
	h: Math.abs(a.y - b.y),
})

// ---- shape space ----

export const toPage = (s: Shape, p: Vec) => add(vec(s.x, s.y), rot(p, s.rotation))
export const toLocal = (s: Shape, p: Vec) => rot(sub(p, vec(s.x, s.y)), -s.rotation)
export const strokeWidth = (s: Shape) => STROKE_SIZES[s.size]

// ---- geo outlines ----

function fitToBox(pts: Vec[], w: number, h: number): Vec[] {
	const b = boxFromPoints(pts)
	return pts.map((p) => vec(((p.x - b.x) / (b.w || 1)) * w, ((p.y - b.y) / (b.h || 1)) * h))
}

export function ellipsePoints(w: number, h: number, n = 48): Vec[] {
	const pts: Vec[] = []
	for (let i = 0; i < n; i++) {
		const t = (i / n) * Math.PI * 2
		pts.push(vec(w / 2 + (w / 2) * Math.cos(t), h / 2 + (h / 2) * Math.sin(t)))
	}
	return pts
}

function stadiumPoints(w: number, h: number, n = 14): Vec[] {
	const pts: Vec[] = []
	const arc = (cx: number, cy: number, r: number, from: number) => {
		for (let i = 0; i <= n; i++) {
			const t = from + (i / n) * Math.PI
			pts.push(vec(cx + r * Math.cos(t), cy + r * Math.sin(t)))
		}
	}
	if (w >= h) {
		const r = h / 2
		arc(w - r, r, r, -Math.PI / 2)
		arc(r, r, r, Math.PI / 2)
	} else {
		const r = w / 2
		arc(r, h - r, r, 0)
		arc(r, r, r, Math.PI)
	}
	return pts
}

/** Heart as cubic segments in a unit box: [c1, c2, end] triples following the start point. */
export const HEART_START: [number, number] = [0.5, 0.27]
export const HEART_CURVES: number[][] = [
	[0.5, 0.12, 0.38, 0, 0.25, 0],
	[0.11, 0, 0, 0.11, 0, 0.28],
	[0, 0.52, 0.25, 0.72, 0.5, 1],
	[0.75, 0.72, 1, 0.52, 1, 0.28],
	[1, 0.11, 0.89, 0, 0.75, 0],
	[0.62, 0, 0.5, 0.12, 0.5, 0.27],
]

function heartPoints(w: number, h: number): Vec[] {
	const pts: Vec[] = []
	let [px, py] = HEART_START
	for (const [x1, y1, x2, y2, x, y] of HEART_CURVES) {
		for (let i = 0; i < 8; i++) {
			const t = i / 8
			const u = 1 - t
			pts.push(
				vec(
					(u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x) * w,
					(u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y) * h
				)
			)
		}
		px = x
		py = y
	}
	return pts
}

/** Whether a geo type is drawn as straight edges between its vertices. */
export const isPolygonGeo = (geo: GeoType) =>
	geo !== 'ellipse' && geo !== 'oval' && geo !== 'cloud' && geo !== 'heart'

export function geoVertices(geo: GeoType, w: number, h: number): Vec[] {
	switch (geo) {
		case 'rectangle':
		case 'x-box':
		case 'check-box':
			return [vec(0, 0), vec(w, 0), vec(w, h), vec(0, h)]
		case 'triangle':
			return [vec(w / 2, 0), vec(w, h), vec(0, h)]
		case 'diamond':
			return [vec(w / 2, 0), vec(w, h / 2), vec(w / 2, h), vec(0, h / 2)]
		case 'hexagon': {
			const pts: Vec[] = []
			for (let i = 0; i < 6; i++) {
				const t = -Math.PI / 2 + (i * Math.PI) / 3
				pts.push(vec(Math.cos(t), Math.sin(t)))
			}
			return fitToBox(pts, w, h)
		}
		case 'rhombus': {
			const o = Math.min(w * 0.38, h * 0.38)
			return [vec(o, 0), vec(w, 0), vec(w - o, h), vec(0, h)]
		}
		case 'star': {
			const pts: Vec[] = []
			for (let i = 0; i < 10; i++) {
				const t = -Math.PI / 2 + (i * Math.PI) / 5
				const r = i % 2 === 0 ? 1 : 0.5
				pts.push(vec(Math.cos(t) * r, Math.sin(t) * r))
			}
			return fitToBox(pts, w, h)
		}
		case 'arrow-right': {
			const ox = Math.min(w, h) * 0.38
			const oy = h * 0.16
			return [vec(0, oy), vec(w - ox, oy), vec(w - ox, 0), vec(w, h / 2), vec(w - ox, h), vec(w - ox, h - oy), vec(0, h - oy)]
		}
		case 'arrow-left': {
			const ox = Math.min(w, h) * 0.38
			const oy = h * 0.16
			return [vec(ox, 0), vec(ox, oy), vec(w, oy), vec(w, h - oy), vec(ox, h - oy), vec(ox, h), vec(0, h / 2)]
		}
		case 'arrow-up': {
			const ox = w * 0.16
			const oy = Math.min(w, h) * 0.38
			return [vec(w / 2, 0), vec(w, oy), vec(w - ox, oy), vec(w - ox, h), vec(ox, h), vec(ox, oy), vec(0, oy)]
		}
		case 'arrow-down': {
			const ox = w * 0.16
			const oy = Math.min(w, h) * 0.38
			return [vec(ox, 0), vec(w - ox, 0), vec(w - ox, h - oy), vec(w, h - oy), vec(w / 2, h), vec(0, h - oy), vec(ox, h - oy)]
		}
		case 'ellipse':
		case 'cloud':
			return ellipsePoints(w, h)
		case 'oval':
			return stadiumPoints(w, h)
		case 'heart':
			return heartPoints(w, h)
	}
}

// ---- arrows ----

export interface ArrowInfo {
	a: Vec
	b: Vec
	mid: Vec
	isArc: boolean
	center: Vec
	radius: number
	sweep: 0 | 1
	large: 0 | 1
	length: number
	/** Unit direction of travel at each end. */
	startDir: Vec
	endDir: Vec
}

/** Geometry of an arrow in its own local space. Pass a resolved arrow (see resolveArrow). */
export function getArrowInfo(s: ArrowShape): ArrowInfo {
	const { a, b } = s
	const chord = dist(a, b)
	const m0 = mid(a, b)
	const dir = norm(sub(b, a))
	const straight: ArrowInfo = {
		a,
		b,
		mid: m0,
		isArc: false,
		center: m0,
		radius: 0,
		sweep: 0,
		large: 0,
		length: chord,
		startDir: dir,
		endDir: dir,
	}
	if (Math.abs(s.bend) < 1 || chord < 1) return straight
	const m = add(m0, mul(per(dir), s.bend))
	// circle through a, m, b
	const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y))
	if (Math.abs(d) < 1e-6) return straight
	const a2 = a.x * a.x + a.y * a.y
	const m2 = m.x * m.x + m.y * m.y
	const b2 = b.x * b.x + b.y * b.y
	const center = vec(
		(a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d,
		(a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d
	)
	const radius = dist(center, a)
	const cross = (m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x)
	const sweep: 0 | 1 = cross > 0 ? 1 : 0
	const large: 0 | 1 = Math.abs(s.bend) > chord / 2 ? 1 : 0
	const tangent = (p: Vec) => {
		const r = norm(sub(p, center))
		return sweep ? vec(-r.y, r.x) : vec(r.y, -r.x)
	}
	const half = Math.asin(clamp(chord / 2 / radius, -1, 1))
	const angle = large ? Math.PI * 2 - 2 * half : 2 * half
	return {
		a,
		b,
		mid: m,
		isArc: true,
		center,
		radius,
		sweep,
		large,
		length: radius * angle,
		startDir: tangent(a),
		endDir: tangent(b),
	}
}

export function arrowPoints(s: ArrowShape, n = 24): Vec[] {
	const info = getArrowInfo(s)
	if (!info.isArc) return [info.a, info.b]
	const { center, radius, sweep } = info
	const a0 = Math.atan2(info.a.y - center.y, info.a.x - center.x)
	let a1 = Math.atan2(info.b.y - center.y, info.b.x - center.x)
	if (sweep && a1 < a0) a1 += Math.PI * 2
	if (!sweep && a1 > a0) a1 -= Math.PI * 2
	const pts: Vec[] = []
	for (let i = 0; i <= n; i++) {
		const t = a0 + ((a1 - a0) * i) / n
		pts.push(vec(center.x + radius * Math.cos(t), center.y + radius * Math.sin(t)))
	}
	return pts
}

// ---- bounds & outlines ----

export function getLocalBounds(s: Shape): Box {
	switch (s.type) {
		case 'geo':
		case 'frame':
		case 'image':
		case 'text':
			return { x: 0, y: 0, w: s.w, h: s.h }
		case 'note':
			return { x: 0, y: 0, w: NOTE_SIZE, h: s.h }
		case 'line':
			return boxFromPoints([s.a, s.b])
		case 'arrow':
			return boxFromPoints(arrowPoints(s))
		case 'draw':
		case 'highlight':
			return boxFromPoints(s.points.map((p) => vec(p[0], p[1])))
	}
}

export function getOutline(s: Shape): { points: Vec[]; closed: boolean } {
	switch (s.type) {
		case 'geo':
			return { points: geoVertices(s.geo, s.w, s.h), closed: true }
		case 'line':
			return { points: [s.a, s.b], closed: false }
		case 'arrow':
			return { points: arrowPoints(s), closed: false }
		case 'draw':
		case 'highlight':
			return { points: s.points.map((p) => vec(p[0], p[1])), closed: s.isClosed }
		default:
			return { points: boxCorners(getLocalBounds(s)), closed: true }
	}
}

export const getPageCorners = (s: Shape) => boxCorners(getLocalBounds(s)).map((p) => toPage(s, p))
export const getPageBounds = (s: Shape) => boxFromPoints(getPageCorners(s))
export const getPageCenter = (s: Shape) => toPage(s, boxCenter(getLocalBounds(s)))
export const getPageOutline = (s: Shape) => {
	const o = getOutline(s)
	return { points: o.points.map((p) => toPage(s, p)), closed: o.closed }
}

// ---- intersection / hit testing ----

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
	const ab = sub(b, a)
	const l2 = ab.x * ab.x + ab.y * ab.y
	if (l2 === 0) return dist(p, a)
	const t = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1)
	return dist(p, vec(a.x + ab.x * t, a.y + ab.y * t))
}

export function distToPolyline(p: Vec, pts: Vec[], closed: boolean): number {
	if (pts.length === 0) return Infinity
	if (pts.length === 1) return dist(p, pts[0])
	let best = Infinity
	const n = closed ? pts.length : pts.length - 1
	for (let i = 0; i < n; i++) {
		best = Math.min(best, distToSegment(p, pts[i], pts[(i + 1) % pts.length]))
	}
	return best
}

export function pointInPolygon(p: Vec, pts: Vec[]): boolean {
	let inside = false
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const a = pts[i]
		const b = pts[j]
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside
		}
	}
	return inside
}

export function segmentIntersection(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
	const r = sub(b, a)
	const s = sub(d, c)
	const den = r.x * s.y - r.y * s.x
	if (Math.abs(den) < 1e-9) return null
	const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
	const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
	if (t < 0 || t > 1 || u < 0 || u > 1) return null
	return vec(a.x + r.x * t, a.y + r.y * t)
}

export function segmentPolylineIntersections(a: Vec, b: Vec, pts: Vec[], closed: boolean): Vec[] {
	const out: Vec[] = []
	const n = closed ? pts.length : pts.length - 1
	for (let i = 0; i < n; i++) {
		const hit = segmentIntersection(a, b, pts[i], pts[(i + 1) % pts.length])
		if (hit) out.push(hit)
	}
	return out
}

/** True when an outline touches a box: a vertex inside it, or an edge crossing its border. */
export function outlineIntersectsBox(pts: Vec[], closed: boolean, box: Box): boolean {
	if (pts.some((p) => boxContainsPoint(box, p))) return true
	const corners = boxCorners(box)
	for (let i = 0; i < 4; i++) {
		if (segmentPolylineIntersections(corners[i], corners[(i + 1) % 4], pts, closed).length) return true
	}
	return false
}

export type Hit = 'fill' | 'edge' | 'hollow' | null

export function hitTestShape(s: Shape, pagePoint: Vec, margin: number): Hit {
	const p = toLocal(s, pagePoint)
	const sw = strokeWidth(s)
	const reach = sw / 2 + margin
	const bounds = getLocalBounds(s)
	if (s.type === 'frame') {
		// the name tab sits above the top-left corner
		if (p.x >= 0 && p.x <= Math.min(s.w, 120) && p.y >= -26 && p.y <= 0) return 'edge'
	}
	if (!boxContainsPoint(bounds, p, reach)) return null
	switch (s.type) {
		case 'note':
		case 'image':
		case 'text':
			return boxContainsPoint(bounds, p) ? 'fill' : null
		case 'frame':
			if (distToPolyline(p, boxCorners(bounds), true) <= margin + 2) return 'edge'
			return boxContainsPoint(bounds, p) ? 'hollow' : null
		case 'geo': {
			const pts = geoVertices(s.geo, s.w, s.h)
			if (distToPolyline(p, pts, true) <= reach) return 'edge'
			if (!pointInPolygon(p, pts)) return null
			return s.fill !== 'none' || s.text ? 'fill' : 'hollow'
		}
		case 'line':
		case 'arrow':
		case 'highlight':
		case 'draw': {
			const { points, closed } = getOutline(s)
			const extra = s.type === 'highlight' ? sw * 2.5 : 0
			if (distToPolyline(p, points, closed) <= reach + extra) return 'edge'
			if (s.type === 'draw' && s.isClosed && pointInPolygon(p, points)) {
				return s.fill !== 'none' ? 'fill' : 'hollow'
			}
			return null
		}
	}
}

// ---- arrow bindings ----

export function bindingAnchor(target: Shape, binding: Binding): Vec {
	const b = getLocalBounds(target)
	return toPage(target, vec(b.x + binding.nx * b.w, b.y + binding.ny * b.h))
}

/** Where a segment heading from `from` to `anchor` first meets the target's outline. */
function clipToOutline(target: Shape, from: Vec, anchor: Vec, gap: number): Vec {
	const { points, closed } = getPageOutline(target)
	if (!closed) return anchor
	const hits = segmentPolylineIntersections(from, anchor, points, true)
	if (!hits.length) return anchor
	let best = hits[0]
	for (const h of hits) if (dist(h, from) < dist(best, from)) best = h
	const d = dist(best, from)
	return d > gap * 2 ? lerp(best, from, gap / d) : best
}

/**
 * Returns the arrow with bound ends moved to where they meet their targets.
 * Arrows are never rotated, so local space is page space minus the origin.
 */
export function resolveArrow(s: ArrowShape, doc: Doc): ArrowShape {
	if (!s.startBinding && !s.endBinding) return s
	const origin = vec(s.x, s.y)
	const ta = s.startBinding ? doc.shapes[s.startBinding.id] : undefined
	const tb = s.endBinding ? doc.shapes[s.endBinding.id] : undefined
	if (!ta && !tb) return s
	const anchorA = ta ? bindingAnchor(ta, s.startBinding!) : add(origin, s.a)
	const anchorB = tb ? bindingAnchor(tb, s.endBinding!) : add(origin, s.b)
	const gap = strokeWidth(s) / 2 + 6
	const sameTarget = ta && tb && ta.id === tb.id
	const a = ta && !sameTarget ? clipToOutline(ta, anchorB, anchorA, gap) : anchorA
	const b = tb && !sameTarget ? clipToOutline(tb, anchorA, anchorB, gap) : anchorB
	return { ...s, a: sub(a, origin), b: sub(b, origin) }
}

export const resolveShape = (s: Shape, doc: Doc): Shape => (s.type === 'arrow' ? resolveArrow(s, doc) : s)

// ---- queries ----

/** Topmost shape under a page point. Hollow shapes only win when nothing solid is hit. */
export function getShapeAtPoint(
	doc: Doc,
	p: Vec,
	margin: number,
	filter?: (s: Shape) => boolean
): Shape | null {
	let hollow: Shape | null = null
	let hollowArea = Infinity
	for (let i = doc.order.length - 1; i >= 0; i--) {
		const raw = doc.shapes[doc.order[i]]
		if (!raw || (filter && !filter(raw))) continue
		const s = resolveShape(raw, doc)
		const hit = hitTestShape(s, p, margin)
		if (hit === 'fill' || hit === 'edge') return raw
		if (hit === 'hollow') {
			const b = getLocalBounds(s)
			const area = b.w * b.h
			if (area < hollowArea) {
				hollow = raw
				hollowArea = area
			}
		}
	}
	return hollow
}

export function getSelectionBounds(doc: Doc, ids: string[]): Box | null {
	const boxes: Box[] = []
	for (const id of ids) {
		const s = doc.shapes[id]
		if (s) boxes.push(getPageBounds(resolveShape(s, doc)))
	}
	return boxes.length ? boxUnion(boxes) : null
}

export function getContentBounds(doc: Doc): Box | null {
	return getSelectionBounds(doc, doc.order)
}
