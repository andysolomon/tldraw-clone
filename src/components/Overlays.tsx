import {
	add,
	boxCorners,
	boxUnion,
	getArrowInfo,
	getLocalBounds,
	getPageBounds,
	getPageCorners,
	mul,
	norm,
	resolveShape,
	strokeWidth,
	sub,
	toPage,
	vec,
} from '../editor/geometry'
import { getArrowPaths, getGeoPaths, smoothPolylinePath } from '../editor/paths'
import { useStore } from '../editor/store'
import type { Camera, ResizeHandle, Shape, Vec } from '../editor/types'

/** A clean outline of the shape in its local space, drawn over it when hovered or selected. */
function indicatorPath(s: Shape): string {
	switch (s.type) {
		case 'geo':
			return getGeoPaths(s.geo, s.w, s.h, strokeWidth(s), s.dash, s.id).fill
		case 'draw':
		case 'highlight':
			return smoothPolylinePath(s.points, s.isClosed)
		case 'line':
			return `M ${s.a.x} ${s.a.y} L ${s.b.x} ${s.b.y}`
		case 'arrow':
			return getArrowPaths(s, strokeWidth(s)).body
		default: {
			const b = getLocalBounds(s)
			return `M ${b.x} ${b.y} h ${b.w} v ${b.h} h ${-b.w} Z`
		}
	}
}

function Indicator({ shape, camera, hint }: { shape: Shape; camera: Camera; hint?: boolean }) {
	const deg = (shape.rotation * 180) / Math.PI
	return (
		<path
			className={hint ? 'tl-indicator tl-indicator__hint' : 'tl-indicator'}
			d={indicatorPath(shape)}
			transform={`scale(${camera.z}) translate(${camera.x + shape.x} ${camera.y + shape.y}) rotate(${deg})`}
			vectorEffect="non-scaling-stroke"
		/>
	)
}

const CORNERS: ResizeHandle[] = ['top_left', 'top_right', 'bottom_right', 'bottom_left']
const EDGES: ResizeHandle[] = ['top', 'right', 'bottom', 'left']
const RESIZE_CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']
// angle of each handle from "up", in 45° steps
const HANDLE_STEP: Record<ResizeHandle, number> = {
	top: 0,
	top_right: 1,
	right: 2,
	bottom_right: 3,
	bottom: 4,
	bottom_left: 5,
	left: 6,
	top_left: 7,
}

function resizeCursor(handle: ResizeHandle, rotation: number) {
	const step = HANDLE_STEP[handle] + Math.round(rotation / (Math.PI / 4))
	return RESIZE_CURSORS[((step % 4) + 4) % 4]
}

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='M6 12a6 6 0 1 1 2 4.5M6 18v-4h4' stroke='white' stroke-width='4'/><path d='M6 12a6 6 0 1 1 2 4.5M6 18v-4h4' stroke='black' stroke-width='1.75'/></svg>"
)}") 12 12, grab`

function SelectionBox({ corners, rotation, canResize, cornersOnly }: {
	corners: Vec[]
	rotation: number
	canResize: boolean
	cornersOnly: boolean
}) {
	const center = mul(add(corners[0], corners[2]), 0.5)
	const deg = (rotation * 180) / Math.PI
	const width = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)
	const height = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)
	// handles crowd a tiny selection; drop the edge ones first, like tldraw does
	const showCorners = canResize && Math.max(width, height) > 12
	const showEdges = canResize && !cornersOnly

	return (
		<g>
			<polygon className="tl-selection__fg" points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />
			{corners.map((c, i) => {
				const out = add(c, mul(norm(sub(c, center)), 14))
				return (
					<circle key={`r${i}`} cx={out.x} cy={out.y} r="10" className="tl-hit" data-handle={`rotate:${CORNERS[i]}`} style={{ cursor: ROTATE_CURSOR }} />
				)
			})}
			{showEdges &&
				EDGES.map((handle, i) => {
					const a = corners[i]
					const b = corners[(i + 1) % 4]
					return (
						<line key={handle} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="tl-hit tl-hit__edge" data-handle={`resize:${handle}`} style={{ cursor: resizeCursor(handle, rotation) }} />
					)
				})}
			{showCorners &&
				corners.map((c, i) => (
					<g key={CORNERS[i]} data-handle={`resize:${CORNERS[i]}`} style={{ cursor: resizeCursor(CORNERS[i], rotation) }}>
						<rect className="tl-hit" x={c.x - 10} y={c.y - 10} width="20" height="20" />
						<rect className="tl-corner-handle" x={c.x - 4} y={c.y - 4} width="8" height="8" transform={`rotate(${deg} ${c.x} ${c.y})`} />
					</g>
				))}
		</g>
	)
}

function PointHandle({ at, which, small }: { at: Vec; which: string; small?: boolean }) {
	return (
		<g data-handle={`point:${which}`} style={{ cursor: 'grab' }}>
			<circle className="tl-hit" cx={at.x} cy={at.y} r="12" />
			<circle className="tl-point-handle" cx={at.x} cy={at.y} r={small ? 3.5 : 4.5} />
		</g>
	)
}

export function Overlays() {
	const doc = useStore((s) => s.doc)
	const camera = useStore((s) => s.camera)
	const selectedIds = useStore((s) => s.selectedIds)
	const hoveredId = useStore((s) => s.hoveredId)
	const editingId = useStore((s) => s.editingId)
	const brush = useStore((s) => s.brush)
	const scribble = useStore((s) => s.scribble)
	const tool = useStore((s) => s.tool)

	const toScreen = (p: Vec) => vec((p.x + camera.x) * camera.z, (p.y + camera.y) * camera.z)
	const selected = selectedIds.flatMap((id) => (doc.shapes[id] ? [resolveShape(doc.shapes[id], doc)] : []))
	const hoveredRaw = hoveredId && !selectedIds.includes(hoveredId) ? doc.shapes[hoveredId] : undefined
	const hovered = hoveredRaw ? resolveShape(hoveredRaw, doc) : null
	const single = selected.length === 1 ? selected[0] : null
	const interactive = tool === 'select' && !editingId

	let box = null
	let points = null
	if (interactive && single && (single.type === 'line' || single.type === 'arrow')) {
		const a = toScreen(toPage(single, single.a))
		const b = toScreen(toPage(single, single.b))
		points = (
			<>
				<PointHandle at={a} which="a" />
				<PointHandle at={b} which="b" />
				{single.type === 'arrow' && <PointHandle at={toScreen(toPage(single, getArrowInfo(single).mid))} which="bend" small />}
			</>
		)
	} else if (selected.length && !editingId) {
		const corners = single
			? getPageCorners(single).map(toScreen)
			: boxCorners(boxUnion(selected.map(getPageBounds))).map(toScreen)
		box = interactive ? (
			<SelectionBox
				corners={corners}
				rotation={single ? single.rotation : 0}
				canResize={!(single && single.type === 'note')}
				cornersOnly={!!single && single.type === 'text'}
			/>
		) : (
			<polygon className="tl-selection__fg" points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />
		)
	}

	const brushStart = brush && toScreen(vec(brush.x, brush.y))

	return (
		<svg className="tl-overlays">
			{selected.map((s) => (
				<Indicator key={s.id} shape={s} camera={camera} />
			))}
			{hovered && <Indicator shape={hovered} camera={camera} hint />}
			{box}
			{points}
			{brush && brushStart && (
				<rect className="tl-brush" x={brushStart.x} y={brushStart.y} width={brush.w * camera.z} height={brush.h * camera.z} />
			)}
			{scribble && scribble.points.length > 1 && (
				<polyline
					className={`tl-scribble tl-scribble__${scribble.kind}`}
					points={scribble.points.map((p) => `${(p.x + camera.x) * camera.z},${(p.y + camera.y) * camera.z}`).join(' ')}
				/>
			)}
		</svg>
	)
}
