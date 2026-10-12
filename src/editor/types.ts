export type Vec = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }

export const COLORS = [
	'black',
	'grey',
	'light-violet',
	'violet',
	'blue',
	'light-blue',
	'yellow',
	'orange',
	'green',
	'light-green',
	'light-red',
	'red',
] as const
export type ColorName = (typeof COLORS)[number]

export const FILLS = ['none', 'semi', 'solid', 'pattern', 'fill'] as const
export type FillStyle = (typeof FILLS)[number]
export const DASHES = ['draw', 'dashed', 'dotted', 'solid'] as const
export type DashStyle = (typeof DASHES)[number]
export const SIZES = ['s', 'm', 'l', 'xl'] as const
export type SizeStyle = (typeof SIZES)[number]
export const FONTS = ['draw', 'sans', 'serif', 'mono'] as const
export type FontStyle = (typeof FONTS)[number]
export const ALIGNS = ['start', 'middle', 'end'] as const
export type AlignStyle = (typeof ALIGNS)[number]

// Order matches the overflow grid observed in the tldraw toolbar.
export const GEO_TYPES = [
	'rectangle',
	'ellipse',
	'triangle',
	'diamond',
	'hexagon',
	'oval',
	'rhombus',
	'star',
	'cloud',
	'heart',
	'x-box',
	'check-box',
	'arrow-left',
	'arrow-up',
	'arrow-down',
	'arrow-right',
] as const
export type GeoType = (typeof GEO_TYPES)[number]

export interface Styles {
	color: ColorName
	fill: FillStyle
	dash: DashStyle
	size: SizeStyle
	font: FontStyle
	align: AlignStyle
	verticalAlign: AlignStyle
	opacity: number
}
export type StyleKey = keyof Styles

interface ShapeBase {
	id: string
	x: number
	y: number
	rotation: number
	opacity: number
	color: ColorName
	size: SizeStyle
	groupId?: string
}

export interface GeoShape extends ShapeBase {
	type: 'geo'
	geo: GeoType
	w: number
	h: number
	fill: FillStyle
	dash: DashStyle
	font: FontStyle
	align: AlignStyle
	verticalAlign: AlignStyle
	text: string
}

/** Freehand strokes. Points are [x, y, pressure] relative to the shape origin. */
export interface DrawShape extends ShapeBase {
	type: 'draw' | 'highlight'
	points: number[][]
	fill: FillStyle
	dash: DashStyle
	isClosed: boolean
	isComplete: boolean
}

export interface LineShape extends ShapeBase {
	type: 'line'
	a: Vec
	b: Vec
	dash: DashStyle
}

/** An arrow end attached to another shape; nx/ny are normalized within the target's box. */
export interface Binding {
	id: string
	nx: number
	ny: number
}

export interface ArrowShape extends ShapeBase {
	type: 'arrow'
	a: Vec
	b: Vec
	bend: number
	dash: DashStyle
	startBinding?: Binding
	endBinding?: Binding
}

export interface TextShape extends ShapeBase {
	type: 'text'
	text: string
	font: FontStyle
	align: AlignStyle
	w: number
	h: number
	scale: number
}

export interface NoteShape extends ShapeBase {
	type: 'note'
	text: string
	font: FontStyle
	align: AlignStyle
	verticalAlign: AlignStyle
	h: number
}

export interface FrameShape extends ShapeBase {
	type: 'frame'
	w: number
	h: number
	name: string
}

export interface ImageShape extends ShapeBase {
	type: 'image'
	w: number
	h: number
	src: string
}

export type Shape =
	| GeoShape
	| DrawShape
	| LineShape
	| ArrowShape
	| TextShape
	| NoteShape
	| FrameShape
	| ImageShape
export type ShapeType = Shape['type']

export interface Doc {
	shapes: Record<string, Shape>
	/** Shape ids, back to front. */
	order: string[]
}

export type ToolId =
	| 'select'
	| 'hand'
	| 'draw'
	| 'eraser'
	| 'arrow'
	| 'text'
	| 'note'
	| 'geo'
	| 'line'
	| 'highlight'
	| 'laser'
	| 'frame'

export interface Camera {
	x: number
	y: number
	z: number
}

export type ResizeHandle =
	| 'top_left'
	| 'top'
	| 'top_right'
	| 'right'
	| 'bottom_right'
	| 'bottom'
	| 'bottom_left'
	| 'left'
