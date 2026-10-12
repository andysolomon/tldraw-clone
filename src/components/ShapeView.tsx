import { memo, useEffect, useRef } from 'react'
import { endEditing, setShapeText } from '../editor/actions'
import { getLocalBounds, resolveShape, strokeWidth } from '../editor/geometry'
import { fontWeight } from '../editor/measure'
import { dashProps, getArrowPaths, getDrawPaths, getGeoPaths, getHighlightPath, polylineLength } from '../editor/paths'
import { useStore } from '../editor/store'
import {
	type ColorEntry,
	FONT_FAMILIES,
	FONT_SIZES,
	LABEL_FONT_SIZES,
	LABEL_PADDING,
	LINE_HEIGHT,
	NOTE_PADDING,
	type Palette,
	getPalette,
} from '../editor/theme'
import type { AlignStyle, FillStyle, FontStyle, Shape } from '../editor/types'

/** What each fill style paints, as observed in tldraw: "semi" is near-white, "solid" is the tint. */
export function fillColor(fill: FillStyle, color: ColorEntry, palette: Palette): string | null {
	switch (fill) {
		case 'none':
			return null
		case 'semi':
			return palette.solid
		case 'solid':
		case 'pattern':
			return color.semi
		case 'fill':
			return color.solid
	}
}

const patternId = (id: string) => `hatch-${id.replace(/[^a-zA-Z0-9]/g, '')}`

/** The SVG part of a shape, in the shape's local space. Shared by the canvas and SVG export. */
export function ShapeInk({ shape, palette }: { shape: Shape; palette: Palette }) {
	const color = palette.colors[shape.color]
	const sw = strokeWidth(shape)
	const stroke = { fill: 'none', stroke: color.solid, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

	switch (shape.type) {
		case 'geo': {
			const geoPaths = getGeoPaths(shape.geo, shape.w, shape.h, sw, shape.dash, shape.id)
			const fill = fillColor(shape.fill, color, palette)
			return (
				<>
					{fill && <path d={geoPaths.fill} fill={fill} />}
					{shape.fill === 'pattern' && (
						<>
							<defs>
								<pattern id={patternId(shape.id)} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
									<line x1="2" y1="0" x2="2" y2="8" stroke={color.pattern} strokeWidth="2" />
								</pattern>
							</defs>
							<path d={geoPaths.fill} fill={`url(#${patternId(shape.id)})`} />
						</>
					)}
					<g {...stroke}>
						{geoPaths.strokes.map((p, i) => (
							<path key={i} d={p.d} {...p.dash} />
						))}
					</g>
				</>
			)
		}
		case 'draw': {
			const paths = getDrawPaths(shape, sw)
			const fill = fillColor(shape.fill, color, palette)
			return (
				<>
					{paths.fill && fill && <path d={paths.fill} fill={fill} />}
					{paths.outline ? <path d={paths.d} fill={color.solid} /> : <path d={paths.d} {...stroke} {...paths.dash} />}
				</>
			)
		}
		case 'highlight':
			return <path d={getHighlightPath(shape)} fill={color.highlight} />
		case 'line': {
			const d = `M ${shape.a.x} ${shape.a.y} L ${shape.b.x} ${shape.b.y}`
			const length = polylineLength([
				[shape.a.x, shape.a.y],
				[shape.b.x, shape.b.y],
			])
			return <path d={d} {...stroke} {...dashProps(length, sw, shape.dash, false)} />
		}
		case 'arrow': {
			const paths = getArrowPaths(shape, sw)
			return (
				<g {...stroke}>
					<path d={paths.body} {...dashProps(paths.length, sw, shape.dash, false)} />
					<path d={paths.head} />
				</g>
			)
		}
		case 'frame':
			return <rect width={shape.w} height={shape.h} rx="1" fill={color.frameFill} stroke={color.frameStroke} strokeWidth="1" />
		case 'image':
			return <image href={shape.src} width={shape.w} height={shape.h} preserveAspectRatio="none" />
		default:
			return null
	}
}

function TextEditor({ id, initial }: { id: string; initial: string }) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = ref.current!
		el.innerText = initial
		el.focus()
		const range = document.createRange()
		range.selectNodeContents(el)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
		// The DOM owns the text while editing, so it is only seeded on mount.
	}, [])

	return (
		<div
			ref={ref}
			className="tl-text-input"
			contentEditable="plaintext-only"
			suppressContentEditableWarning
			spellCheck={false}
			onInput={(e) => {
				// browsers append a newline to keep an empty last line visible
				const text = e.currentTarget.innerText
				setShapeText(id, text.endsWith('\n') ? text.slice(0, -1) : text)
			}}
			onBlur={() => endEditing()}
			onKeyDown={(e) => {
				e.stopPropagation()
				if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
					e.preventDefault()
					endEditing()
				}
			}}
		/>
	)
}

const FLEX: Record<AlignStyle, string> = { start: 'flex-start', middle: 'center', end: 'flex-end' }
const TEXT_ALIGN: Record<AlignStyle, 'left' | 'center' | 'right'> = { start: 'left', middle: 'center', end: 'right' }

function Label(props: {
	id: string
	text: string
	font: FontStyle
	fontSize: number
	align: AlignStyle
	verticalAlign: AlignStyle
	color: string
	padding: number
	editing: boolean
}) {
	return (
		<div
			className="tl-text-label"
			style={{ justifyContent: FLEX[props.align], alignItems: FLEX[props.verticalAlign], padding: props.padding }}
		>
			<div
				className="tl-text-label__inner"
				style={{
					fontFamily: FONT_FAMILIES[props.font],
					fontWeight: fontWeight(props.font),
					fontSize: props.fontSize,
					lineHeight: LINE_HEIGHT,
					color: props.color,
					textAlign: TEXT_ALIGN[props.align],
				}}
			>
				{props.editing ? <TextEditor id={props.id} initial={props.text} /> : props.text}
			</div>
		</div>
	)
}

function ShapeBody({ shape, palette, editing }: { shape: Shape; palette: Palette; editing: boolean }) {
	const color = palette.colors[shape.color]
	if (shape.type === 'note') {
		return (
			<div className="tl-note" style={{ backgroundColor: color.noteFill }}>
				<Label
					id={shape.id}
					text={shape.text}
					font={shape.font}
					fontSize={LABEL_FONT_SIZES[shape.size]}
					align={shape.align}
					verticalAlign={shape.verticalAlign}
					color={color.noteText}
					padding={NOTE_PADDING}
					editing={editing}
				/>
			</div>
		)
	}
	if (shape.type === 'text') {
		return (
			<div
				className="tl-text-shape"
				style={{
					fontFamily: FONT_FAMILIES[shape.font],
					fontWeight: fontWeight(shape.font),
					fontSize: FONT_SIZES[shape.size] * shape.scale,
					lineHeight: LINE_HEIGHT,
					color: color.solid,
					textAlign: TEXT_ALIGN[shape.align],
				}}
			>
				{editing ? <TextEditor id={shape.id} initial={shape.text} /> : shape.text}
			</div>
		)
	}
	return (
		<>
			<svg className="tl-svg-container" aria-hidden="true">
				<ShapeInk shape={shape} palette={palette} />
			</svg>
			{shape.type === 'geo' && (shape.text || editing) && (
				<Label
					id={shape.id}
					text={shape.text}
					font={shape.font}
					fontSize={LABEL_FONT_SIZES[shape.size]}
					align={shape.align}
					verticalAlign={shape.verticalAlign}
					color={color.solid}
					padding={LABEL_PADDING}
					editing={editing}
				/>
			)}
			{shape.type === 'frame' && <div className="tl-frame-heading">{shape.name}</div>}
		</>
	)
}

export const ShapeView = memo(function ShapeView({ id }: { id: string }) {
	const raw = useStore((s) => s.doc.shapes[id])
	// only arrows read other shapes (the ones their ends are attached to)
	const doc = useStore((s) => (s.doc.shapes[id]?.type === 'arrow' ? s.doc : null))
	const dark = useStore((s) => s.dark)
	const editing = useStore((s) => s.editingId === id)
	const erasing = useStore((s) => s.erasingIds.includes(id))
	if (!raw) return null

	const shape = doc ? resolveShape(raw, doc) : raw
	const bounds = getLocalBounds(shape)
	const cos = Math.cos(shape.rotation)
	const sin = Math.sin(shape.rotation)

	return (
		<div
			className="tl-shape"
			data-shape-type={shape.type}
			data-shape-id={shape.id}
			style={{
				transform: `matrix(${cos}, ${sin}, ${-sin}, ${cos}, ${shape.x}, ${shape.y})`,
				width: Math.max(bounds.w, 1),
				height: Math.max(bounds.h, 1),
				opacity: shape.opacity * (erasing ? 0.32 : 1),
			}}
		>
			<ShapeBody shape={shape} palette={getPalette(dark)} editing={editing} />
		</div>
	)
})
