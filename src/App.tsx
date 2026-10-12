import { type DragEvent, useEffect } from 'react'
import { clipboardText, copy, cut, insertImage, pasteFromClipboardData, remeasureText } from './editor/actions'
import { handleKeyDown, handleKeyUp } from './editor/shortcuts'
import { getState, useStore } from './editor/store'
import { setSpaceHeld } from './editor/tools'
import { Canvas } from './components/Canvas'
import { NavigationPanel, ShortcutsDialog, TopLeft } from './components/Panels'
import { StylePanel } from './components/StylePanel'
import { Toolbar } from './components/Toolbar'

const isTyping = (target: EventTarget | null) => {
	const el = target as HTMLElement | null
	return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

export function App() {
	const dark = useStore((s) => s.dark)
	const dialog = useStore((s) => s.dialog)

	useEffect(() => {
		const onCopy = (e: ClipboardEvent) => {
			if (isTyping(e.target) || getState().editingId || !copy()) return
			e.clipboardData?.setData('text/plain', clipboardText())
			e.preventDefault()
		}
		const onCut = (e: ClipboardEvent) => {
			if (isTyping(e.target) || getState().editingId || !cut()) return
			e.clipboardData?.setData('text/plain', clipboardText())
			e.preventDefault()
		}
		const onPaste = (e: ClipboardEvent) => {
			if (isTyping(e.target) || getState().editingId || !e.clipboardData) return
			pasteFromClipboardData(e.clipboardData)
			e.preventDefault()
		}
		const onBlur = () => setSpaceHeld(false)

		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)
		window.addEventListener('blur', onBlur)
		document.addEventListener('copy', onCopy)
		document.addEventListener('cut', onCut)
		document.addEventListener('paste', onPaste)
		// text measured before the web fonts arrive is slightly off; measure again once they are in
		void document.fonts.ready.then(remeasureText)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
			window.removeEventListener('blur', onBlur)
			document.removeEventListener('copy', onCopy)
			document.removeEventListener('cut', onCut)
			document.removeEventListener('paste', onPaste)
		}
	}, [])

	const onDrop = (e: DragEvent) => {
		e.preventDefault()
		const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
		if (file) void insertImage(file)
	}

	return (
		<div className={`tl-container ${dark ? 'tl-theme__dark' : 'tl-theme__light'}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
			<Canvas />
			<div className="tlui-layout">
				<div className="tlui-layout__top">
					<TopLeft />
					<StylePanel />
				</div>
				<div className="tlui-layout__bottom">
					<NavigationPanel />
					<Toolbar />
				</div>
			</div>
			{dialog === 'shortcuts' && <ShortcutsDialog />}
		</div>
	)
}
