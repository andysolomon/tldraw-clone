import { renderToStaticMarkup } from 'react-dom/server'
import { ShapeInk } from '../components/ShapeView'
import { loadDocument } from './actions'
import { getSelectionBounds, resolveShape } from './geometry'
import { fontWeight } from './measure'
import { getState } from './store'
import {
	FONT_FAMILIES,
	FONT_SIZES,
	LABEL_FONT_SIZES,
	LABEL_PADDING,
	LINE_HEIGHT,
	NOTE_PADDING,
	NOTE_SIZE,
	type Palette,
	getPalette,
} from './theme'
import type { AlignStyle, Doc, FontStyle, Shape } from './types'

const EXPORT_PADDING = 32
const FILE_TYPE = 'tldraw-clone/document'

let measureCanvas: HTMLCanvasElement | null = null

/** Greedy word wrap, measured with a 2D canvas since SVG text can't wrap itself. */
function wrapLines(text: string, font: FontStyle, size: number, maxWidth: number): string[] {
	measureCanvas ??= document.createElement('canvas')
	const ctx = measureCanvas.getContext('2d')!
	ctx.font = `${fontWeight(font)} ${size}px ${FONT_FAMILIES[font]}`
	const lines: string[] = []
	for (const paragraph of text.split('\n')) {
		let line = ''
		for (const token of paragraph.split(/(\s+)/)) {
			if (line && ctx.measureText(line + token).width > maxWidth) {
				lines.push(line.trimEnd())
				line = token.trimStart()
			} else {
				line += token
			}
		}
		lines.push(line)
	}
	return lines
}

function TextBlock(props: {
	lines: string[]
	font: FontStyle
	size: number
	color: string
	align: AlignStyle
	verticalAlign: AlignStyle
	box: { x: number; y: number; w: number; h: number }
}) {
	const { lines, size, box, align, verticalAlign } = props
	const lineHeight = size * LINE_HEIGHT
	const height = lines.length * lineHeight
	const x = align === 'start' ? box.x : align === 'middle' ? box.x + box.w / 2 : box.x + box.w
	const top = verticalAlign === 'start' ? box.y : verticalAlign === 'middle' ? box.y + (box.h - height) / 2 : box.y + box.h - height
	return (
		<text
			fontFamily={FONT_FAMILIES[props.font]}
			fontWeight={fontWeight(props.font)}
			fontSize={size}
			fill={props.color}
			textAnchor={align === 'start' ? 'start' : align === 'middle' ? 'middle' : 'end'}
			style={{ whiteSpace: 'pre' }}
		>
			{lines.map((line, i) => (
				<tspan key={i} x={x} y={top + i * lineHeight + lineHeight / 2} dominantBaseline="central">
					{line || ' '}
				</tspan>
			))}
		</text>
	)
}

/** Text is HTML on the canvas; exports need it as SVG. */
function ShapeText({ shape, palette }: { shape: Shape; palette: Palette }) {
	const color = palette.colors[shape.color]
	if (shape.type === 'text') {
		return (
			<TextBlock
				lines={shape.text.split('\n')}
				font={shape.font}
				size={FONT_SIZES[shape.size] * shape.scale}
				color={color.solid}
				align={shape.align}
				verticalAlign="start"
				box={{ x: 0, y: 0, w: shape.w, h: shape.h }}
			/>
		)
	}
	if (shape.type === 'note') {
		const size = LABEL_FONT_SIZES[shape.size]
		const inner = NOTE_SIZE - NOTE_PADDING * 2
		return (
			<>
				<rect width={NOTE_SIZE} height={shape.h} rx="1" fill={color.noteFill} />
				<TextBlock
					lines={wrapLines(shape.text, shape.font, size, inner)}
					font={shape.font}
					size={size}
					color={color.noteText}
					align={shape.align}
					verticalAlign={shape.verticalAlign}
					box={{ x: NOTE_PADDING, y: NOTE_PADDING, w: inner, h: shape.h - NOTE_PADDING * 2 }}
				/>
			</>
		)
	}
	if (shape.type === 'geo' && shape.text) {
		const size = LABEL_FONT_SIZES[shape.size]
		const inner = Math.max(shape.w - LABEL_PADDING * 2, 1)
		return (
			<TextBlock
				lines={wrapLines(shape.text, shape.font, size, inner)}
				font={shape.font}
				size={size}
				color={color.solid}
				align={shape.align}
				verticalAlign={shape.verticalAlign}
				box={{ x: LABEL_PADDING, y: LABEL_PADDING, w: inner, h: shape.h - LABEL_PADDING * 2 }}
			/>
		)
	}
	if (shape.type === 'frame') {
		return (
			<text x="0" y="-8" fontFamily={FONT_FAMILIES.sans} fontWeight="500" fontSize="12" fill={palette.text}>
				{shape.name}
			</text>
		)
	}
	return null
}

/** The selection (or everything, when nothing is selected) as a standalone SVG document. */
export function buildSvg(doc: Doc, selectedIds: string[], dark: boolean) {
	const picked = new Set(selectedIds)
	const ids = picked.size ? doc.order.filter((id) => picked.has(id)) : doc.order
	const bounds = getSelectionBounds(doc, ids)
	if (!bounds) return null
	const palette = getPalette(dark)
	const w = Math.ceil(bounds.w + EXPORT_PADDING * 2)
	const h = Math.ceil(bounds.h + EXPORT_PADDING * 2)
	const markup = renderToStaticMarkup(
		<svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<rect width={w} height={h} fill={palette.background} />
			<g transform={`translate(${EXPORT_PADDING - bounds.x} ${EXPORT_PADDING - bounds.y})`}>
				{ids.map((id) => {
					const shape = resolveShape(doc.shapes[id], doc)
					const deg = (shape.rotation * 180) / Math.PI
					return (
						<g key={id} transform={`translate(${shape.x} ${shape.y}) rotate(${deg})`} opacity={shape.opacity}>
							<ShapeInk shape={shape} palette={palette} />
							<ShapeText shape={shape} palette={palette} />
						</g>
					)
				})}
			</g>
		</svg>
	)
	return { markup, w, h }
}

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportSvg() {
	const s = getState()
	const svg = buildSvg(s.doc, s.selectedIds, s.dark)
	if (svg) download(new Blob([svg.markup], { type: 'image/svg+xml' }), 'drawing.svg')
}

/**
 * Rasterize the SVG export at 2×. Web fonts are not available to an SVG drawn as an image,
 * so text in the PNG falls back to system fonts.
 */
export async function exportPng() {
	const s = getState()
	const svg = buildSvg(s.doc, s.selectedIds, s.dark)
	if (!svg) return
	const url = URL.createObjectURL(new Blob([svg.markup], { type: 'image/svg+xml' }))
	try {
		const img = new Image()
		img.src = url
		await img.decode()
		const canvas = document.createElement('canvas')
		canvas.width = svg.w * 2
		canvas.height = svg.h * 2
		canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
		if (blob) download(blob, 'drawing.png')
	} finally {
		URL.revokeObjectURL(url)
	}
}

export function saveJson() {
	const data = JSON.stringify({ type: FILE_TYPE, version: 1, doc: getState().doc })
	download(new Blob([data], { type: 'application/json' }), 'drawing.json')
}

export function openJson() {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = 'application/json,.json'
	input.onchange = async () => {
		const file = input.files?.[0]
		if (!file) return
		try {
			const data = JSON.parse(await file.text())
			if (data?.type !== FILE_TYPE || !data.doc?.shapes || !Array.isArray(data.doc.order)) {
				throw new Error('not a tldraw-clone document')
			}
			loadDocument(data.doc)
		} catch (error) {
			window.alert(`Could not open that file: ${error instanceof Error ? error.message : error}`)
		}
	}
	input.click()
}
