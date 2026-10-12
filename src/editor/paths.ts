import { getStroke } from 'perfect-freehand'
import {
	HEART_CURVES,
	HEART_START,
	add,
	clamp,
	dist,
	geoVertices,
	getArrowInfo,
	isPolygonGeo,
	mul,
	norm,
	rot,
	sub,
	vec,
} from './geometry'
import { FONT_SIZES } from './theme'
import type { ArrowShape, DashStyle, DrawShape, GeoType, Vec } from './types'

const f = (n: number) => +n.toFixed(3)
const pt = (p: Vec) => `${f(p.x)} ${f(p.y)}`

/** Deterministic random numbers so a shape's hand-drawn wobble is stable across renders. */
export function seededRandom(seed: string): () => number {
	let h = 1779033703 ^ seed.length
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
		h = (h << 13) | (h >>> 19)
	}
	let a = h >>> 0
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export interface Dash {
	strokeDasharray?: string
	strokeDashoffset?: number
}

/** Dash pattern fitted to the path length, so open paths start and end on a dash. */
export function dashProps(length: number, sw: number, dash: DashStyle, closed: boolean): Dash {
	const unit = sw * 2
	if (dash === 'dashed') {
		if (closed) {
			const n = Math.max(2, Math.round(length / (unit * 2)))
			const d = length / n / 2
			return { strokeDasharray: `${f(d)} ${f(d)}`, strokeDashoffset: f(d / 2) }
		}
		const n = Math.max(2, Math.round((length / unit + 1) / 2))
		const d = length / (2 * n - 1)
		return { strokeDasharray: `${f(d)} ${f(d)}` }
	}
	if (dash === 'dotted') {
		const n = closed ? Math.max(3, Math.round(length / unit)) : Math.max(1, Math.round(length / unit))
		const gap = length / n
		return { strokeDasharray: `0.1 ${f(Math.max(gap - 0.1, 0.1))}` }
	}
	return {}
}

export function polygonPath(pts: Vec[], closed = true): string {
	if (!pts.length) return ''
	return `M ${pts.map(pt).join(' L ')}${closed ? ' Z' : ''}`
}

/** Closed polygon with quadratic corners. Matches the path shape tldraw emits for geo shapes. */
export function roundedPolygonPath(pts: Vec[], radius: number, jitter?: () => Vec): string {
	const n = pts.length
	const vs = jitter ? pts.map((p) => add(p, jitter())) : pts
	const corner = (i: number) => {
		const v = vs[i]
		const prev = vs[(i - 1 + n) % n]
		const next = vs[(i + 1) % n]
		const r = Math.min(radius, dist(v, prev) / 2, dist(v, next) / 2)
		return { v, p1: add(v, mul(norm(sub(prev, v)), r)), p2: add(v, mul(norm(sub(next, v)), r)) }
	}
	let d = `M ${pt(corner(0).p2)}`
	for (let k = 1; k <= n; k++) {
		const c = corner(k % n)
		d += ` L ${pt(c.p1)} Q ${pt(c.v)} ${pt(c.p2)}`
	}
	return d
}

const KAPPA = 0.5522847498

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
	const kx = rx * KAPPA
	const ky = ry * KAPPA
	return (
		`M ${f(cx - rx)} ${f(cy)} ` +
		`C ${f(cx - rx)} ${f(cy - ky)} ${f(cx - kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} ` +
		`C ${f(cx + kx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ky)} ${f(cx + rx)} ${f(cy)} ` +
		`C ${f(cx + rx)} ${f(cy + ky)} ${f(cx + kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} ` +
		`C ${f(cx - kx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ky)} ${f(cx - rx)} ${f(cy)}`
	)
}

const ellipsePerimeter = (rx: number, ry: number) =>
	Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))

function ovalPath(w: number, h: number, dx = 0, dy = 0): string {
	if (w >= h) {
		const r = h / 2
		return `M ${f(r + dx)} ${f(dy)} L ${f(w - r + dx)} ${f(dy)} A ${f(r)} ${f(r)} 0 0 1 ${f(w - r + dx)} ${f(h + dy)} L ${f(r + dx)} ${f(h + dy)} A ${f(r)} ${f(r)} 0 0 1 ${f(r + dx)} ${f(dy)} Z`
	}
	const r = w / 2
	return `M ${f(dx)} ${f(r + dy)} A ${f(r)} ${f(r)} 0 0 1 ${f(w + dx)} ${f(r + dy)} L ${f(w + dx)} ${f(h - r + dy)} A ${f(r)} ${f(r)} 0 0 1 ${f(dx)} ${f(h - r + dy)} Z`
}

function heartPath(w: number, h: number, dx = 0, dy = 0): string {
	const x = (n: number) => f(n * w + dx)
	const y = (n: number) => f(n * h + dy)
	let d = `M ${x(HEART_START[0])} ${y(HEART_START[1])}`
	for (const c of HEART_CURVES) {
		d += ` C ${x(c[0])} ${y(c[1])} ${x(c[2])} ${y(c[3])} ${x(c[4])} ${y(c[5])}`
	}
	return d + ' Z'
}

function cloudPath(w: number, h: number, seed: string): { d: string; length: number } {
	const random = seededRandom(seed)
	const pad = Math.min(w, h) * 0.1
	const rx = Math.max(w / 2 - pad, 1)
	const ry = Math.max(h / 2 - pad, 1)
	const n = clamp(Math.round(ellipsePerimeter(rx, ry) / (Math.min(w, h) * 0.42 || 1)), 6, 18)
	const pts: Vec[] = []
	for (let i = 0; i < n; i++) {
		const t = ((i + (random() - 0.5) * 0.3) / n) * Math.PI * 2 - Math.PI / 2
		pts.push(vec(w / 2 + rx * Math.cos(t), h / 2 + ry * Math.sin(t)))
	}
	let d = `M ${pt(pts[0])}`
	let length = 0
	for (let i = 1; i <= n; i++) {
		const p = pts[i % n]
		const chord = dist(pts[i - 1], p)
		const r = chord * 0.62
		length += chord * 1.163
		d += ` A ${f(r)} ${f(r)} 0 0 1 ${pt(p)}`
	}
	return { d: d + ' Z', length }
}

export interface StrokePart {
	d: string
	dash?: Dash
}

export interface GeoPaths {
	fill: string
	strokes: StrokePart[]
}

/** Extra interior marks for x-box and check-box. */
function geoMarks(geo: GeoType, w: number, h: number): Vec[][] {
	if (geo === 'x-box') {
		return [
			[vec(0, 0), vec(w, h)],
			[vec(w, 0), vec(0, h)],
		]
	}
	if (geo === 'check-box') {
		const size = Math.min(w, h) * 0.82
		const ox = (w - size) / 2
		const oy = (h - size) / 2
		return [
			[
				vec(ox + size * 0.25, oy + size * 0.52),
				vec(ox + size * 0.43, oy + size * 0.7),
				vec(ox + size * 0.78, oy + size * 0.31),
			],
		]
	}
	return []
}

export function getGeoPaths(
	geo: GeoType,
	w: number,
	h: number,
	sw: number,
	dash: DashStyle,
	seed: string
): GeoPaths {
	const random = seededRandom(seed)
	const wobble = sw * 0.3
	const j = () => (random() - 0.5) * 2 * wobble
	const jitter = () => vec(j(), j())

	if (isPolygonGeo(geo)) {
		const verts = geoVertices(geo, w, h)
		const marks = geoMarks(geo, w, h).map((m) => {
			let length = 0
			for (let i = 1; i < m.length; i++) length += dist(m[i - 1], m[i])
			return { d: polygonPath(m, false), dash: dashProps(length, sw, dash, false) }
		})
		if (dash === 'draw') {
			const radius = sw * 2
			return {
				fill: roundedPolygonPath(verts, radius),
				strokes: [
					{ d: `${roundedPolygonPath(verts, radius, jitter)} ${roundedPolygonPath(verts, radius, jitter)}` },
					...marks,
				],
			}
		}
		const fill = polygonPath(verts)
		if (dash === 'solid') return { fill, strokes: [{ d: fill }, ...marks] }
		const edges = verts.map((a, i) => {
			const b = verts[(i + 1) % verts.length]
			return { d: `M ${pt(a)} L ${pt(b)}`, dash: dashProps(dist(a, b), sw, dash, false) }
		})
		return { fill, strokes: [...edges, ...marks] }
	}

	if (geo === 'ellipse') {
		const fill = ellipsePath(w / 2, h / 2, w / 2, h / 2)
		if (dash === 'draw') {
			const pass = () => ellipsePath(w / 2 + j(), h / 2 + j(), w / 2 + j(), h / 2 + j())
			return { fill, strokes: [{ d: `${pass()} ${pass()}` }] }
		}
		return { fill, strokes: [{ d: fill + ' Z', dash: dashProps(ellipsePerimeter(w / 2, h / 2), sw, dash, true) }] }
	}

	if (geo === 'oval') {
		const fill = ovalPath(w, h)
		if (dash === 'draw') return { fill, strokes: [{ d: `${ovalPath(w, h, j(), j())} ${ovalPath(w, h, j(), j())}` }] }
		const length = 2 * Math.abs(w - h) + Math.PI * Math.min(w, h)
		return { fill, strokes: [{ d: fill, dash: dashProps(length, sw, dash, true) }] }
	}

	if (geo === 'heart') {
		const fill = heartPath(w, h)
		if (dash === 'draw') return { fill, strokes: [{ d: `${heartPath(w, h, j(), j())} ${heartPath(w, h, j(), j())}` }] }
		const verts = geoVertices(geo, w, h)
		let length = 0
		verts.forEach((p, i) => (length += dist(p, verts[(i + 1) % verts.length])))
		return { fill, strokes: [{ d: fill, dash: dashProps(length, sw, dash, true) }] }
	}

	const cloud = cloudPath(w, h, seed)
	return { fill: cloud.d, strokes: [{ d: cloud.d, dash: dashProps(cloud.length, sw, dash, true) }] }
}

// ---- freehand ----

const avg = (a: number, b: number) => (a + b) / 2

function pathFromStrokeOutline(pts: number[][]): string {
	const n = pts.length
	if (n < 4) return ''
	let a = pts[0]
	let b = pts[1]
	const c = pts[2]
	let d = `M${f(a[0])},${f(a[1])} Q${f(b[0])},${f(b[1])} ${f(avg(b[0], c[0]))},${f(avg(b[1], c[1]))} T`
	for (let i = 2; i < n - 1; i++) {
		a = pts[i]
		b = pts[i + 1]
		d += `${f(avg(a[0], b[0]))},${f(avg(a[1], b[1]))} `
	}
	return d + 'Z'
}

export function smoothPolylinePath(points: number[][], closed: boolean): string {
	const n = points.length
	if (n === 0) return ''
	if (n < 3) return `M ${points.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L ')}`
	let d = `M ${f(points[0][0])} ${f(points[0][1])}`
	for (let i = 1; i < n - 1; i++) {
		const a = points[i]
		const b = points[i + 1]
		d += ` Q ${f(a[0])} ${f(a[1])} ${f(avg(a[0], b[0]))} ${f(avg(a[1], b[1]))}`
	}
	d += ` L ${f(points[n - 1][0])} ${f(points[n - 1][1])}`
	return closed ? d + ' Z' : d
}

export function polylineLength(points: number[][]): number {
	let length = 0
	for (let i = 1; i < points.length; i++) {
		length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
	}
	return length
}

const dotPath = (x: number, y: number, r: number) =>
	`M ${f(x - r)} ${f(y)} a ${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0 Z`

export interface DrawPaths {
	/** Path for the ink itself. */
	d: string
	/** When true the ink path is an outline to fill; otherwise it is a centerline to stroke. */
	outline: boolean
	dash?: Dash
	/** Interior fill for closed strokes. */
	fill?: string
}

export function getDrawPaths(s: DrawShape, sw: number): DrawPaths {
	const length = polylineLength(s.points)
	if (s.points.length < 2 || length < 1) {
		const p = s.points[0] ?? [0, 0]
		return { d: dotPath(p[0], p[1], sw * 0.65), outline: true }
	}
	const fill = s.isClosed && s.fill !== 'none' ? smoothPolylinePath(s.points, true) : undefined
	if (s.dash === 'draw') {
		const hasPressure = s.points.some((p) => p[2] !== undefined && p[2] !== 0.5)
		const outline = getStroke(s.points, {
			size: 1 + sw * 1.75,
			thinning: 0.6,
			streamline: 0.62,
			smoothing: 0.62,
			simulatePressure: !hasPressure,
			last: s.isComplete,
		})
		return { d: pathFromStrokeOutline(outline), outline: true, fill }
	}
	return {
		d: smoothPolylinePath(s.points, s.isClosed),
		outline: false,
		dash: dashProps(length, sw, s.dash, s.isClosed),
		fill,
	}
}

export const highlightWidth = (s: DrawShape) => FONT_SIZES[s.size] * 1.12

export function getHighlightPath(s: DrawShape): string {
	const size = highlightWidth(s)
	if (s.points.length < 2 || polylineLength(s.points) < 1) {
		const p = s.points[0] ?? [0, 0]
		return dotPath(p[0], p[1], size / 2)
	}
	const outline = getStroke(s.points, {
		size,
		thinning: 0,
		streamline: 0.5,
		smoothing: 0.5,
		simulatePressure: false,
		last: s.isComplete,
	})
	return pathFromStrokeOutline(outline)
}

// ---- arrows ----

export interface ArrowPaths {
	body: string
	head: string
	length: number
}

/** Pass a resolved arrow (bound ends already moved to their targets). */
export function getArrowPaths(s: ArrowShape, sw: number): ArrowPaths {
	const info = getArrowInfo(s)
	const body = info.isArc
		? `M ${pt(info.a)} A ${f(info.radius)} ${f(info.radius)} 0 ${info.large} ${info.sweep} ${pt(info.b)}`
		: `M ${pt(info.a)} L ${pt(info.b)}`
	const headLength = Math.min(info.length / 3, sw * 4.5)
	const p1 = sub(info.b, mul(rot(info.endDir, Math.PI / 6), headLength))
	const p2 = sub(info.b, mul(rot(info.endDir, -Math.PI / 6), headLength))
	return { body, head: `M ${pt(p1)} L ${pt(info.b)} L ${pt(p2)}`, length: info.length }
}
