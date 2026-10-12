import { useEffect, useState } from 'react'
import {
	align,
	deleteSelected,
	distribute,
	duplicateSelected,
	groupSelected,
	pickImage,
	reorder,
	rotateSelected,
	setTool,
	ungroupSelected,
} from '../editor/actions'
import { kbdFor } from '../editor/shortcuts'
import { redo, undo, useStore } from '../editor/store'
import { GEO_TYPES, type GeoType, type ToolId } from '../editor/types'
import { IconButton, Popover } from './ui'

export const GEO_LABELS: Record<GeoType, string> = {
	rectangle: 'Rectangle',
	ellipse: 'Ellipse',
	triangle: 'Triangle',
	diamond: 'Diamond',
	hexagon: 'Hexagon',
	oval: 'Oval',
	rhombus: 'Rhombus',
	star: 'Star',
	cloud: 'Cloud',
	heart: 'Heart',
	'x-box': 'X box',
	'check-box': 'Check box',
	'arrow-left': 'Arrow left',
	'arrow-up': 'Arrow up',
	'arrow-down': 'Arrow down',
	'arrow-right': 'Arrow right',
}

const MAIN_TOOLS: { id: ToolId; label: string }[] = [
	{ id: 'select', label: 'Select' },
	{ id: 'hand', label: 'Hand' },
	{ id: 'draw', label: 'Draw' },
	{ id: 'eraser', label: 'Eraser' },
	{ id: 'arrow', label: 'Arrow' },
	{ id: 'text', label: 'Text' },
	{ id: 'note', label: 'Note' },
]

const EXTRA_TOOLS: { id: ToolId; label: string }[] = [
	{ id: 'line', label: 'Line' },
	{ id: 'highlight', label: 'Highlight' },
	{ id: 'laser', label: 'Laser' },
	{ id: 'frame', label: 'Frame' },
]

/** A tool that lives in the overflow grid: a geo type, or one of the extra tools. */
type Overflow = { tool: ToolId; geo?: GeoType; icon: string; label: string }

const geoEntry = (geo: GeoType): Overflow => ({ tool: 'geo', geo, icon: `geo-${geo}`, label: GEO_LABELS[geo] })
const OVERFLOW: Overflow[] = [
	...GEO_TYPES.map(geoEntry),
	...EXTRA_TOOLS.map((t) => ({ tool: t.id, icon: t.id, label: t.label })),
]

function ToolButton(props: { entry: Overflow; active: boolean; onClick: () => void }) {
	const { entry } = props
	return (
		<IconButton
			className="tlui-button__tool"
			icon={entry.icon}
			label={entry.label}
			kbd={kbdFor(entry.label)}
			active={props.active}
			testId={`tools.${entry.geo ?? entry.tool}`}
			onClick={props.onClick}
		/>
	)
}

function QuickActions() {
	const canUndo = useStore((s) => s.canUndo)
	const canRedo = useStore((s) => s.canRedo)
	const count = useStore((s) => s.selectedIds.length)
	const none = count === 0
	const action = (icon: string, label: string, run: () => void, disabled: boolean, close: () => void) => (
		<IconButton
			key={label}
			icon={icon}
			label={label}
			kbd={kbdFor(label)}
			disabled={disabled}
			onClick={() => {
				run()
				close()
			}}
		/>
	)
	return (
		<div className="tlui-main-toolbar__extras">
			<IconButton icon="undo" label="Undo" kbd="cmd+z" disabled={!canUndo} onClick={undo} testId="quick-actions.undo" />
			<IconButton icon="redo" label="Redo" kbd="cmd+shift+z" disabled={!canRedo} onClick={redo} testId="quick-actions.redo" />
			<IconButton icon="trash" label="Delete" kbd="backspace" disabled={none} onClick={deleteSelected} testId="quick-actions.delete" />
			<IconButton icon="duplicate" label="Duplicate" kbd="cmd+d" disabled={none} onClick={duplicateSelected} testId="quick-actions.duplicate" />
			<Popover
				placement="top"
				className="tlui-grid tlui-actions-menu"
				trigger={(open, toggle) => <IconButton icon="dots-vertical" label="Actions" expanded={open} onClick={toggle} testId="actions-menu.button" />}
			>
				{(close) => (
					<>
						{action('arrange-left', 'Align left', () => align('left'), count < 2, close)}
						{action('arrange-center-horizontal', 'Align horizontally', () => align('center-horizontal'), count < 2, close)}
						{action('arrange-right', 'Align right', () => align('right'), count < 2, close)}
						{action('distribute-horizontal', 'Distribute horizontally', () => distribute('horizontal'), count < 3, close)}
						{action('arrange-top', 'Align top', () => align('top'), count < 2, close)}
						{action('arrange-center-vertical', 'Align vertically', () => align('center-vertical'), count < 2, close)}
						{action('arrange-bottom', 'Align bottom', () => align('bottom'), count < 2, close)}
						{action('distribute-vertical', 'Distribute vertically', () => distribute('vertical'), count < 3, close)}
						{action('order-back', 'Send to back', () => reorder('back'), none, close)}
						{action('order-backward', 'Send backward', () => reorder('backward'), none, close)}
						{action('order-forward', 'Bring forward', () => reorder('forward'), none, close)}
						{action('order-front', 'Bring to front', () => reorder('front'), none, close)}
						{action('rotate-ccw', 'Rotate counterclockwise', () => rotateSelected(-Math.PI / 2), none, close)}
						{action('rotate-cw', 'Rotate clockwise', () => rotateSelected(Math.PI / 2), none, close)}
						{action('group', 'Group', groupSelected, count < 2, close)}
						{action('ungroup', 'Ungroup', ungroupSelected, none, close)}
					</>
				)}
			</Popover>
		</div>
	)
}

export function Toolbar() {
	const tool = useStore((s) => s.tool)
	const geo = useStore((s) => s.geo)
	const isOverflowActive = (entry: Overflow) => tool === entry.tool && (entry.tool !== 'geo' || entry.geo === geo)

	// The last slot shows whichever overflow tool was used most recently, as tldraw's toolbar does.
	const [slot, setSlot] = useState<Overflow>(() => geoEntry(geo))
	useEffect(() => {
		const active = OVERFLOW.find((entry) => tool === entry.tool && (entry.tool !== 'geo' || entry.geo === geo))
		if (active) setSlot(active)
	}, [tool, geo])

	return (
		<div className="tlui-main-toolbar">
			<div className="tlui-main-toolbar__inner">
				<QuickActions />
				<div className="tlui-main-toolbar__tools" role="toolbar" aria-label="Tools">
					{MAIN_TOOLS.map((t) => (
						<ToolButton key={t.id} entry={{ tool: t.id, icon: t.id, label: t.label }} active={tool === t.id} onClick={() => setTool(t.id)} />
					))}
					<IconButton className="tlui-button__tool" icon="media" label="Media" kbd="cmd+u" testId="tools.asset" onClick={pickImage} />
					<ToolButton entry={slot} active={isOverflowActive(slot)} onClick={() => setTool(slot.tool, slot.geo)} />
					<Popover
						placement="top"
						className="tlui-grid"
						trigger={(open, toggle) => (
							<IconButton className="tlui-button__tool tlui-main-toolbar__overflow" icon="chevron-up" label="More" expanded={open} onClick={toggle} testId="tools.more-button" />
						)}
					>
						{(close) =>
							OVERFLOW.map((entry) => (
								<ToolButton
									key={entry.label}
									entry={entry}
									active={isOverflowActive(entry)}
									onClick={() => {
										setTool(entry.tool, entry.geo)
										close()
									}}
								/>
							))
						}
					</Popover>
				</div>
			</div>
		</div>
	)
}
