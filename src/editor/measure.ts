import { FONT_FAMILIES, FONT_SIZES, LABEL_FONT_SIZES, LINE_HEIGHT, NOTE_PADDING, NOTE_SIZE } from './theme'
import type { FontStyle, NoteShape, TextShape } from './types'

// Shantell Sans ships a regular weight; the IBM Plex families are loaded at medium, as tldraw does.
export const fontWeight = (font: FontStyle) => (font === 'draw' ? 400 : 500)

let el: HTMLDivElement | null = null

/** Measure text with a hidden DOM element, the same approach tldraw's `.tl-text-measure` node takes. */
export function measureText(
	text: string,
	opts: { font: FontStyle; size: number; maxWidth?: number }
): { w: number; h: number } {
	if (!el) {
		el = document.createElement('div')
		el.className = 'tl-text-measure'
		document.body.appendChild(el)
	}
	el.style.fontFamily = FONT_FAMILIES[opts.font]
	el.style.fontWeight = String(fontWeight(opts.font))
	el.style.fontSize = `${opts.size}px`
	el.style.lineHeight = String(LINE_HEIGHT)
	el.style.width = opts.maxWidth ? `${opts.maxWidth}px` : 'max-content'
	el.style.whiteSpace = opts.maxWidth ? 'pre-wrap' : 'pre'
	// A trailing newline (or empty string) has no height of its own; pad it so the caret line counts.
	el.textContent = text === '' || text.endsWith('\n') ? `${text}​` : text
	const rect = el.getBoundingClientRect()
	return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
}

export function sizeTextShape(s: TextShape): TextShape {
	const { w, h } = measureText(s.text, { font: s.font, size: FONT_SIZES[s.size] * s.scale })
	const next = { w: Math.max(w, 8), h }
	if (next.w === s.w && next.h === s.h) return s
	// keep the anchor implied by the alignment fixed as the text grows
	const dx = s.align === 'middle' ? (s.w - next.w) / 2 : s.align === 'end' ? s.w - next.w : 0
	const cos = Math.cos(s.rotation)
	const sin = Math.sin(s.rotation)
	return { ...s, ...next, x: s.x + dx * cos, y: s.y + dx * sin }
}

export function sizeNoteShape(s: NoteShape): NoteShape {
	const inner = NOTE_SIZE - NOTE_PADDING * 2
	const { h } = measureText(s.text, { font: s.font, size: LABEL_FONT_SIZES[s.size], maxWidth: inner })
	const next = Math.max(NOTE_SIZE, h + NOTE_PADDING * 2)
	return next === s.h ? s : { ...s, h: next }
}
