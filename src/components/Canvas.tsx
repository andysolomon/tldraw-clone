import { type MouseEvent, type PointerEvent, useEffect, useRef } from 'react'
import { endEditing, panBy, zoomTo } from '../editor/actions'
import { vec } from '../editor/geometry'
import { getState, screenToPage, setState, useStore } from '../editor/store'
import { type PointerInfo, doubleClick, pointerDown, pointerMove, pointerUp } from '../editor/tools'
import { Overlays } from './Overlays'
import { ShapeView } from './ShapeView'

export function Canvas() {
	const ref = useRef<HTMLDivElement>(null)
	const order = useStore((s) => s.doc.order)
	const camera = useStore((s) => s.camera)
	const cursor = useStore((s) => s.cursor)
	const grid = useStore((s) => s.grid)

	const info = (e: PointerEvent | MouseEvent): PointerInfo => {
		const rect = ref.current!.getBoundingClientRect()
		const screen = vec(e.clientX - rect.left, e.clientY - rect.top)
		const target = e.target as Element
		const isPen = 'pointerType' in e && e.pointerType === 'pen'
		return {
			screen,
			page: screenToPage(screen),
			shift: e.shiftKey,
			alt: e.altKey,
			button: e.button,
			pressure: isPen ? (e as PointerEvent).pressure : 0.5,
			handle: target.closest?.('[data-handle]')?.getAttribute('data-handle') ?? null,
		}
	}

	const inTextEditor = (e: PointerEvent | MouseEvent) => !!(e.target as Element).closest?.('.tl-text-input')

	useEffect(() => {
		const el = ref.current!
		// React registers wheel listeners as passive, and panning has to cancel the page scroll.
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const rect = el.getBoundingClientRect()
			if (e.ctrlKey || e.metaKey) {
				const z = getState().camera.z
				zoomTo(z * Math.exp(-e.deltaY * 0.01), vec(e.clientX - rect.left, e.clientY - rect.top))
			} else if (e.shiftKey && e.deltaX === 0) {
				panBy(-e.deltaY, 0)
			} else {
				panBy(-e.deltaX, -e.deltaY)
			}
		}
		el.addEventListener('wheel', onWheel, { passive: false })
		const observer = new ResizeObserver(() => setState({ viewport: { w: el.clientWidth, h: el.clientHeight } }))
		observer.observe(el)
		return () => {
			el.removeEventListener('wheel', onWheel)
			observer.disconnect()
		}
	}, [])

	const gridSize = (camera.z >= 0.5 ? 16 : 64) * camera.z

	return (
		<div
			ref={ref}
			className="tl-canvas"
			data-testid="canvas"
			style={{ cursor }}
			onPointerDown={(e) => {
				if (inTextEditor(e)) return
				if (getState().editingId) endEditing()
				// take focus off whatever panel button was used last, so Enter and Space don't re-trigger it
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
				e.currentTarget.setPointerCapture(e.pointerId)
				pointerDown(info(e))
			}}
			onMouseDown={(e) => {
				// A text editor opened by this press must keep the focus it just took;
				// the default mousedown action would move focus back to the page.
				if (!inTextEditor(e)) e.preventDefault()
			}}
			onPointerMove={(e) => pointerMove(info(e))}
			onPointerUp={(e) => {
				if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
				pointerUp()
			}}
			onPointerCancel={() => pointerUp()}
			onDoubleClick={(e) => {
				if (!inTextEditor(e)) doubleClick(info(e))
			}}
			onContextMenu={(e) => e.preventDefault()}
		>
			{grid && (
				<div
					className="tl-grid"
					style={{
						backgroundSize: `${gridSize}px ${gridSize}px`,
						backgroundPosition: `${camera.x * camera.z}px ${camera.y * camera.z}px`,
					}}
				/>
			)}
			<div className="tl-shapes" style={{ transform: `scale(${camera.z}) translate(${camera.x}px, ${camera.y}px)` }}>
				{order.map((id) => (
					<ShapeView key={id} id={id} />
				))}
			</div>
			<Overlays />
		</div>
	)
}
