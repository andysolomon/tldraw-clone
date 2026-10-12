import { type PointerEvent, useEffect, useRef } from 'react'
import {
	clearDocument,
	copy,
	cut,
	deleteSelected,
	duplicateSelected,
	hasClipboard,
	paste,
	pickImage,
	resetZoom,
	selectAll,
	toggleDark,
	toggleGrid,
	toggleMinimap,
	toggleToolLock,
	zoomIn,
	zoomOut,
	zoomToFit,
	zoomToSelection,
} from '../editor/actions'
import { boxUnion, getPageBounds, resolveShape } from '../editor/geometry'
import { SHORTCUTS } from '../editor/shortcuts'
import { getState, redo, setState, undo, useStore, viewportPageBounds } from '../editor/store'
import { IconButton, Menu, type MenuItem, Popover, formatKbd } from './ui'

// The export code pulls in react-dom/server, so it is only fetched when a file action is used.
const files = () => import('../editor/export')

export function TopLeft() {
	const canUndo = useStore((s) => s.canUndo)
	const canRedo = useStore((s) => s.canRedo)
	const hasSelection = useStore((s) => s.selectedIds.length > 0)
	const hasShapes = useStore((s) => s.doc.order.length > 0)
	const dark = useStore((s) => s.dark)
	const grid = useStore((s) => s.grid)
	const minimap = useStore((s) => s.minimap)
	const toolLock = useStore((s) => s.toolLock)

	const groups: MenuItem[][] = [
		[
			{
				label: 'Edit',
				children: [
					[
						{ label: 'Undo', kbd: 'cmd+z', onSelect: undo, disabled: !canUndo },
						{ label: 'Redo', kbd: 'cmd+shift+z', onSelect: redo, disabled: !canRedo },
					],
					[
						{ label: 'Cut', kbd: 'cmd+x', onSelect: cut, disabled: !hasSelection },
						{ label: 'Copy', kbd: 'cmd+c', onSelect: copy, disabled: !hasSelection },
						{ label: 'Paste', kbd: 'cmd+v', onSelect: paste, disabled: !hasClipboard() },
						{ label: 'Duplicate', kbd: 'cmd+d', onSelect: duplicateSelected, disabled: !hasSelection },
						{ label: 'Delete', kbd: 'backspace', onSelect: deleteSelected, disabled: !hasSelection },
					],
					[{ label: 'Select all', kbd: 'cmd+a', onSelect: selectAll, disabled: !hasShapes }],
				],
			},
			{
				label: 'View',
				children: [
					[
						{ label: 'Zoom in', kbd: 'cmd+=', onSelect: zoomIn },
						{ label: 'Zoom out', kbd: 'cmd+-', onSelect: zoomOut },
						{ label: 'Zoom to 100%', kbd: 'shift+0', onSelect: resetZoom },
						{ label: 'Zoom to fit', kbd: 'shift+1', onSelect: zoomToFit, disabled: !hasShapes },
						{ label: 'Zoom to selection', kbd: 'shift+2', onSelect: zoomToSelection, disabled: !hasSelection },
					],
				],
			},
			{
				label: 'Export',
				children: [
					[
						{ label: 'SVG', onSelect: () => void files().then((m) => m.exportSvg()), disabled: !hasShapes },
						{ label: 'PNG', onSelect: () => void files().then((m) => m.exportPng()), disabled: !hasShapes },
					],
				],
			},
		],
		[
			{ label: 'Upload media…', kbd: 'cmd+u', onSelect: pickImage },
			{ label: 'Open file…', onSelect: () => void files().then((m) => m.openJson()) },
			{ label: 'Download', onSelect: () => void files().then((m) => m.saveJson()), disabled: !hasShapes },
		],
		[
			{
				label: 'Preferences',
				children: [
					[
						{ label: 'Dark mode', kbd: 'cmd+/', onSelect: toggleDark, checked: dark },
						{ label: 'Show grid', kbd: "cmd+'", onSelect: toggleGrid, checked: grid },
						{ label: 'Tool lock', kbd: 'q', onSelect: toggleToolLock, checked: toolLock },
						{ label: 'Show minimap', onSelect: toggleMinimap, checked: minimap },
					],
				],
			},
			{ label: 'Keyboard shortcuts', onSelect: () => setState({ dialog: 'shortcuts' }) },
		],
		[{ label: 'Clear canvas', onSelect: clearDocument, disabled: !hasShapes }],
	]

	return (
		<div className="tlui-top-left">
			<span className="tlui-wordmark">tldraw clone</span>
			<Popover
				placement="bottom-start"
				trigger={(open, toggle) => <IconButton icon="dots-vertical" label="Page menu" expanded={open} onClick={toggle} testId="main-menu.button" />}
			>
				{(close) => <Menu groups={groups} close={close} />}
			</Popover>
		</div>
	)
}

const MINIMAP_W = 152
const MINIMAP_H = 88

function Minimap() {
	const ref = useRef<HTMLCanvasElement>(null)
	const doc = useStore((s) => s.doc)
	const camera = useStore((s) => s.camera)
	const viewport = useStore((s) => s.viewport)
	const selectedIds = useStore((s) => s.selectedIds)
	const dark = useStore((s) => s.dark)
	// page-to-minimap transform of the last paint, so pointer events can be mapped back
	const view = useRef({ scale: 1, x: 0, y: 0 })

	useEffect(() => {
		const canvas = ref.current!
		const dpr = window.devicePixelRatio || 1
		canvas.width = MINIMAP_W * dpr
		canvas.height = MINIMAP_H * dpr
		const ctx = canvas.getContext('2d')!
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)

		const visible = viewportPageBounds()
		const boxes = doc.order.map((id) => ({ id, box: getPageBounds(resolveShape(doc.shapes[id], doc)) }))
		const all = boxUnion([visible, ...boxes.map((b) => b.box)])
		const scale = Math.min(MINIMAP_W / all.w, MINIMAP_H / all.h) * 0.9
		const ox = (MINIMAP_W - all.w * scale) / 2 - all.x * scale
		const oy = (MINIMAP_H - all.h * scale) / 2 - all.y * scale
		view.current = { scale, x: ox, y: oy }

		const styles = getComputedStyle(canvas)
		ctx.fillStyle = styles.getPropertyValue('--tl-color-muted-1')
		ctx.fillRect(visible.x * scale + ox, visible.y * scale + oy, visible.w * scale, visible.h * scale)
		const selected = new Set(selectedIds)
		for (const { id, box } of boxes) {
			ctx.fillStyle = selected.has(id) ? styles.getPropertyValue('--tl-color-selected') : styles.getPropertyValue('--tl-color-text-3')
			ctx.fillRect(box.x * scale + ox, box.y * scale + oy, Math.max(box.w * scale, 1.5), Math.max(box.h * scale, 1.5))
		}
	}, [doc, camera, viewport, selectedIds, dark])

	const moveTo = (e: PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		const { scale, x, y } = view.current
		const page = { x: (e.clientX - rect.left - x) / scale, y: (e.clientY - rect.top - y) / scale }
		const s = getState()
		setState({ camera: { ...s.camera, x: s.viewport.w / 2 / s.camera.z - page.x, y: s.viewport.h / 2 / s.camera.z - page.y } })
	}

	return (
		<div className="tlui-minimap">
			<canvas
				ref={ref}
				className="tlui-minimap__canvas"
				style={{ width: MINIMAP_W, height: MINIMAP_H }}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId)
					moveTo(e)
				}}
				onPointerMove={(e) => {
					if (e.buttons === 1) moveTo(e)
				}}
			/>
		</div>
	)
}

export function NavigationPanel() {
	const zoom = useStore((s) => s.camera.z)
	const minimap = useStore((s) => s.minimap)
	const hasSelection = useStore((s) => s.selectedIds.length > 0)
	const hasShapes = useStore((s) => s.doc.order.length > 0)
	const percent = `${Math.round(zoom * 100)}%`

	const zoomMenu: MenuItem[][] = [
		[
			{ label: 'Zoom in', kbd: 'cmd+=', onSelect: zoomIn },
			{ label: 'Zoom out', kbd: 'cmd+-', onSelect: zoomOut },
			{ label: 'Zoom to 100%', kbd: 'shift+0', onSelect: resetZoom, disabled: zoom === 1 },
			{ label: 'Zoom to fit', kbd: 'shift+1', onSelect: zoomToFit, disabled: !hasShapes },
			{ label: 'Zoom to selection', kbd: 'shift+2', onSelect: zoomToSelection, disabled: !hasSelection },
		],
	]

	return (
		<div className="tlui-navigation-panel">
			<div className="tlui-row" role="toolbar" aria-label="Navigation">
				{minimap && <IconButton icon="minus" label="Zoom out" kbd="cmd+-" onClick={zoomOut} testId="minimap.zoom-out" />}
				<Popover
					placement="top-start"
					trigger={(_open, toggle) => (
						<button type="button" className="tlui-button tlui-zoom-menu__button" title={`Zoom — ${percent}`} aria-label={`Zoom — ${percent}`} data-testid="minimap.zoom-menu-button" onClick={toggle}>
							{percent}
						</button>
					)}
				>
					{(close) => <Menu groups={zoomMenu} close={close} />}
				</Popover>
				{minimap && <IconButton icon="plus" label="Zoom in" kbd="cmd+=" onClick={zoomIn} testId="minimap.zoom-in" />}
				<IconButton icon={minimap ? 'chevron-left' : 'chevron-right'} label="Toggle minimap" onClick={toggleMinimap} testId="minimap.toggle-button" small />
			</div>
			{minimap && <Minimap />}
		</div>
	)
}

const GROUPS = ['Tools', 'Edit', 'Arrange', 'View', 'Preferences'] as const

export function ShortcutsDialog() {
	const close = () => setState({ dialog: null })
	return (
		<div className="tlui-dialog__overlay" onPointerDown={close}>
			<div className="tlui-dialog" role="dialog" aria-label="Keyboard shortcuts" onPointerDown={(e) => e.stopPropagation()}>
				<div className="tlui-dialog__header">
					<span>Keyboard shortcuts</span>
					<IconButton icon="cross" label="Close" onClick={close} />
				</div>
				<div className="tlui-dialog__body">
					{GROUPS.map((group) => (
						<section key={group}>
							<h2>{group}</h2>
							{SHORTCUTS.filter((s) => s.group === group).map((s) => (
								<div className="tlui-shortcut" key={s.label}>
									<span>{s.label}</span>
									<kbd className="tlui-kbd">{formatKbd(s.kbd)}</kbd>
								</div>
							))}
						</section>
					))}
				</div>
			</div>
		</div>
	)
}
