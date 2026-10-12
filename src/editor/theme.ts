import type { ColorName, FontStyle, SizeStyle } from './types'

// Values in this file were read out of tldraw 5.5.0's shipped bundle and stylesheet
// (theme object + size multiplier tables), not guessed.

export interface ColorEntry {
	solid: string
	semi: string
	pattern: string
	noteFill: string
	noteText: string
	highlight: string
	frameStroke: string
	frameFill: string
}

export interface Palette {
	background: string
	/** Near-white used by the "semi" fill. */
	solid: string
	text: string
	colors: Record<ColorName, ColorEntry>
}

function row(
	solid: string,
	semi: string,
	pattern: string,
	noteFill: string,
	noteText: string,
	highlight: string,
	frameStroke: string,
	frameFill: string
): ColorEntry {
	return { solid, semi, pattern, noteFill, noteText, highlight, frameStroke, frameFill }
}

export const LIGHT: Palette = {
	background: '#f9fafb',
	solid: '#fcfffe',
	text: '#000000',
	colors: {
		black: row('#1d1d1d', '#e8e8e8', '#494949', '#FCE19C', '#000000', '#fddd00', '#717171', '#ffffff'),
		grey: row('#9fa8b2', '#eceef0', '#bcc3c9', '#C0CAD3', '#000000', '#cbe7f1', '#aaaaab', '#fcfcfd'),
		'light-violet': row('#e085f4', '#f5eafa', '#e9acf8', '#DFB0F9', '#000000', '#ff88ff', '#e59bf5', '#fefbff'),
		violet: row('#ae3ec9', '#ecdcf2', '#bd63d3', '#DB91FD', '#000000', '#c77cff', '#bc62d3', '#fdf9fd'),
		blue: row('#4465e9', '#dce1f8', '#6681ee', '#8AA3FF', '#000000', '#10acff', '#6681ec', '#f9fafe'),
		'light-blue': row('#4ba1f1', '#ddedfa', '#6fbbf8', '#9BC4FD', '#000000', '#00f4ff', '#6cb2f3', '#fafcff'),
		yellow: row('#f1ac4b', '#f9f0e6', '#fecb92', '#FED49A', '#000000', '#fddd00', '#f3bb6c', '#fffdfa'),
		orange: row('#e16919', '#f8e2d4', '#f78438', '#FAA475', '#000000', '#ffa500', '#e68544', '#fef9f6'),
		green: row('#099268', '#d3e9e3', '#39a785', '#6FC896', '#000000', '#00ffc8', '#37a684', '#f8fcfa'),
		'light-green': row('#4cb05e', '#dbf0e0', '#65cb78', '#98D08A', '#000000', '#65f641', '#6dbe7c', '#fafdfa'),
		'light-red': row('#f87777', '#f4dadb', '#fe9e9e', '#F7A5A1', '#000000', '#ff7fa3', '#f89090', '#fffbfb'),
		red: row('#e03131', '#f4dadb', '#e55959', '#FC8282', '#000000', '#ff636e', '#e55757', '#fef9f9'),
	},
}

export const DARK: Palette = {
	background: '#101011',
	solid: '#010403',
	text: '#f9fafb',
	colors: {
		black: row('#f2f2f2', '#2c3036', '#989898', '#2c2c2c', '#f2f2f2', '#d2b700', '#5c5c5c', '#0c0c0c'),
		grey: row('#9398b0', '#33373c', '#7c8187', '#56595F', '#f2f2f2', '#9cb4cb', '#42474D', '#151719'),
		'light-violet': row('#e599f7', '#383442', '#9770a9', '#762F8E', '#f2f2f2', '#c400c7', '#6c367a', '#1C151E'),
		violet: row('#ae3ec9', '#342938', '#763a8b', '#5f1c70', '#f2f2f2', '#9e00ee', '#6d1583', '#1b0f21'),
		blue: row('#4f72fc', '#262d40', '#3a4b9e', '#2A3F98', '#f2f2f2', '#0079d2', '#384994', '#11141f'),
		'light-blue': row('#4dabf7', '#2a3642', '#4d7aa9', '#1F5495', '#f2f2f2', '#00bdc8', '#075797', '#0B1823'),
		yellow: row('#ffc034', '#3b352b', '#fecb92', '#8a5e1c', '#f2f2f2', '#d2b700', '#684e12', '#1e1911'),
		orange: row('#f76707', '#3b2e27', '#9f552d', '#7c3905', '#f2f2f2', '#d07a00', '#773a0e', '#1c1512'),
		green: row('#099268', '#253231', '#366a53', '#014429', '#f2f2f2', '#009774', '#10513C', '#0E1614'),
		'light-green': row('#40c057', '#2a3830', '#4e874e', '#21581D', '#f2f2f2', '#00a000', '#1C5427', '#0F1911'),
		'light-red': row('#ff8787', '#3c2b2b', '#a56767', '#7a3333', '#f2f2f2', '#db005b', '#6f3232', '#181212'),
		red: row('#e03131', '#382726', '#8f3734', '#7e201f', '#f2f2f2', '#de002c', '#701e1e', '#1b1313'),
	},
}

export const getPalette = (dark: boolean) => (dark ? DARK : LIGHT)

// Base stroke width 2 × {s:1, m:1.75, l:2.5, xl:5}
export const STROKE_SIZES: Record<SizeStyle, number> = { s: 2, m: 3.5, l: 5, xl: 10 }
// Base font size 16 × {s:1.125, m:1.5, l:2.25, xl:2.75}
export const FONT_SIZES: Record<SizeStyle, number> = { s: 18, m: 24, l: 36, xl: 44 }
// Base font size 16 × {s:1.125, m:1.375, l:1.625, xl:2}
export const LABEL_FONT_SIZES: Record<SizeStyle, number> = { s: 18, m: 22, l: 26, xl: 32 }
export const LINE_HEIGHT = 1.35

export const FONT_FAMILIES: Record<FontStyle, string> = {
	draw: "'Shantell Sans', 'Comic Sans MS', cursive, sans-serif",
	sans: "'IBM Plex Sans', system-ui, sans-serif",
	serif: "'IBM Plex Serif', Georgia, serif",
	mono: "'IBM Plex Mono', ui-monospace, monospace",
}

export const NOTE_SIZE = 200
export const NOTE_PADDING = 16
export const LABEL_PADDING = 16
export const OPACITY_STOPS = [0.1, 0.25, 0.5, 0.75, 1]
export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8
export const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8]
