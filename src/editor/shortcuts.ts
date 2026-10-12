import {
	align,
	deleteSelected,
	distribute,
	duplicateSelected,
	groupSelected,
	nudge,
	pickImage,
	reorder,
	resetZoom,
	rotateSelected,
	selectAll,
	selectNone,
	setTool,
	startEditing,
	toggleDark,
	toggleGrid,
	toggleToolLock,
	ungroupSelected,
	zoomIn,
	zoomOut,
	zoomToFit,
	zoomToSelection,
} from './actions'
import { getState, redo, setState, undo } from './store'
import { cancelInteraction, isInteracting, setSpaceHeld } from './tools'

export interface Shortcut {
	group: 'Tools' | 'Edit' | 'Arrange' | 'View' | 'Preferences'
	label: string
	/** Modifiers in the order cmd, alt, shift, then the key. "cmd" means ⌘ on macOS and Ctrl elsewhere. */
	kbd: string
	run?: () => void
}

// Key bindings match the ones found in tldraw's shipped action and tool definitions.
export const SHORTCUTS: Shortcut[] = [
	{ group: 'Tools', label: 'Select', kbd: 'v', run: () => setTool('select') },
	{ group: 'Tools', label: 'Hand', kbd: 'h', run: () => setTool('hand') },
	{ group: 'Tools', label: 'Draw', kbd: 'd', run: () => setTool('draw') },
	{ group: 'Tools', label: 'Eraser', kbd: 'e', run: () => setTool('eraser') },
	{ group: 'Tools', label: 'Arrow', kbd: 'a', run: () => setTool('arrow') },
	{ group: 'Tools', label: 'Text', kbd: 't', run: () => setTool('text') },
	{ group: 'Tools', label: 'Note', kbd: 'n', run: () => setTool('note') },
	{ group: 'Tools', label: 'Rectangle', kbd: 'r', run: () => setTool('geo', 'rectangle') },
	{ group: 'Tools', label: 'Ellipse', kbd: 'o', run: () => setTool('geo', 'ellipse') },
	{ group: 'Tools', label: 'Line', kbd: 'l', run: () => setTool('line') },
	{ group: 'Tools', label: 'Frame', kbd: 'f', run: () => setTool('frame') },
	{ group: 'Tools', label: 'Highlight', kbd: 'shift+d', run: () => setTool('highlight') },
	{ group: 'Tools', label: 'Laser', kbd: 'k', run: () => setTool('laser') },
	{ group: 'Tools', label: 'Upload media', kbd: 'cmd+u', run: pickImage },
	{ group: 'Tools', label: 'Tool lock', kbd: 'q', run: toggleToolLock },

	{ group: 'Edit', label: 'Undo', kbd: 'cmd+z', run: undo },
	{ group: 'Edit', label: 'Redo', kbd: 'cmd+shift+z', run: redo },
	// cut, copy and paste are handled by the browser's clipboard events
	{ group: 'Edit', label: 'Cut', kbd: 'cmd+x' },
	{ group: 'Edit', label: 'Copy', kbd: 'cmd+c' },
	{ group: 'Edit', label: 'Paste', kbd: 'cmd+v' },
	{ group: 'Edit', label: 'Duplicate', kbd: 'cmd+d', run: duplicateSelected },
	{ group: 'Edit', label: 'Delete', kbd: 'backspace', run: deleteSelected },
	{ group: 'Edit', label: 'Select all', kbd: 'cmd+a', run: selectAll },
	{ group: 'Edit', label: 'Group', kbd: 'cmd+g', run: groupSelected },
	{ group: 'Edit', label: 'Ungroup', kbd: 'cmd+shift+g', run: ungroupSelected },

	{ group: 'Arrange', label: 'Align left', kbd: 'alt+a', run: () => align('left') },
	{ group: 'Arrange', label: 'Align horizontally', kbd: 'alt+h', run: () => align('center-horizontal') },
	{ group: 'Arrange', label: 'Align right', kbd: 'alt+d', run: () => align('right') },
	{ group: 'Arrange', label: 'Align top', kbd: 'alt+w', run: () => align('top') },
	{ group: 'Arrange', label: 'Align vertically', kbd: 'alt+v', run: () => align('center-vertical') },
	{ group: 'Arrange', label: 'Align bottom', kbd: 'alt+s', run: () => align('bottom') },
	{ group: 'Arrange', label: 'Distribute horizontally', kbd: 'alt+shift+h', run: () => distribute('horizontal') },
	{ group: 'Arrange', label: 'Distribute vertically', kbd: 'alt+shift+v', run: () => distribute('vertical') },
	{ group: 'Arrange', label: 'Bring to front', kbd: ']', run: () => reorder('front') },
	{ group: 'Arrange', label: 'Bring forward', kbd: 'alt+]', run: () => reorder('forward') },
	{ group: 'Arrange', label: 'Send backward', kbd: 'alt+[', run: () => reorder('backward') },
	{ group: 'Arrange', label: 'Send to back', kbd: '[', run: () => reorder('back') },
	{ group: 'Arrange', label: 'Rotate clockwise', kbd: 'shift+.', run: () => rotateSelected(Math.PI / 2) },
	{ group: 'Arrange', label: 'Rotate counterclockwise', kbd: 'shift+,', run: () => rotateSelected(-Math.PI / 2) },

	{ group: 'View', label: 'Zoom in', kbd: 'cmd+=', run: zoomIn },
	{ group: 'View', label: 'Zoom out', kbd: 'cmd+-', run: zoomOut },
	{ group: 'View', label: 'Zoom to 100%', kbd: 'shift+0', run: resetZoom },
	{ group: 'View', label: 'Zoom to fit', kbd: 'shift+1', run: zoomToFit },
	{ group: 'View', label: 'Zoom to selection', kbd: 'shift+2', run: zoomToSelection },

	{ group: 'Preferences', label: 'Dark mode', kbd: 'cmd+/', run: toggleDark },
	{ group: 'Preferences', label: 'Show grid', kbd: "cmd+'", run: toggleGrid },
]

export const kbdFor = (label: string) => SHORTCUTS.find((s) => s.label === label)?.kbd

const BINDINGS = new Map<string, () => void>()
for (const s of SHORTCUTS) if (s.run) BINDINGS.set(s.kbd, s.run)
// secondary bindings that tldraw also accepts
BINDINGS.set('b', () => setTool('draw'))
BINDINGS.set('x', () => setTool('draw'))
BINDINGS.set('=', zoomIn)
BINDINGS.set('-', zoomOut)
BINDINGS.set('delete', deleteSelected)
BINDINGS.set('cmd+y', redo)

const CODE_KEYS: Record<string, string> = {
	Equal: '=',
	Minus: '-',
	BracketLeft: '[',
	BracketRight: ']',
	Comma: ',',
	Period: '.',
	Slash: '/',
	Quote: "'",
	Backspace: 'backspace',
	Delete: 'delete',
}

/** Read the physical key so that ⌥ and ⇧ combinations don't turn into other characters. */
function combo(e: KeyboardEvent): string {
	const key = e.code.startsWith('Key')
		? e.code.slice(3).toLowerCase()
		: e.code.startsWith('Digit')
			? e.code.slice(5)
			: (CODE_KEYS[e.code] ?? e.key.toLowerCase())
	return `${e.metaKey || e.ctrlKey ? 'cmd+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${key}`
}

const isTyping = (target: EventTarget | null) => {
	const el = target as HTMLElement | null
	return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

/** Keys pressed inside something layered over the app, like the sign-in dialog, are not ours. */
const isOutsideApp = (target: EventTarget | null) =>
	target instanceof Element && target !== document.body && !target.closest('.tl-container')

export function handleKeyDown(e: KeyboardEvent) {
	if (isTyping(e.target) || isOutsideApp(e.target)) return
	const s = getState()
	if (s.dialog) {
		if (e.key === 'Escape') setState({ dialog: null })
		return
	}
	if (e.key === ' ') {
		e.preventDefault()
		setSpaceHeld(true)
		return
	}
	if (e.key === 'Escape') {
		if (cancelInteraction()) return
		if (s.tool !== 'select') setTool('select')
		else selectNone()
		return
	}
	if (isInteracting()) return
	if (e.key === 'Enter' && s.selectedIds.length === 1) {
		const shape = s.doc.shapes[s.selectedIds[0]]
		if (shape && (shape.type === 'geo' || shape.type === 'note' || shape.type === 'text')) {
			e.preventDefault()
			startEditing(shape.id)
		}
		return
	}
	if (e.key.startsWith('Arrow') && !e.metaKey && !e.ctrlKey && s.selectedIds.length) {
		e.preventDefault()
		const step = e.shiftKey ? 10 : 1
		if (e.key === 'ArrowLeft') nudge(-step, 0)
		if (e.key === 'ArrowRight') nudge(step, 0)
		if (e.key === 'ArrowUp') nudge(0, -step)
		if (e.key === 'ArrowDown') nudge(0, step)
		return
	}
	const run = BINDINGS.get(combo(e))
	if (run) {
		e.preventDefault()
		run()
	}
}

export function handleKeyUp(e: KeyboardEvent) {
	if (e.key === ' ') setSpaceHeld(false)
}
