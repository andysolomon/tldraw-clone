import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform)

const KEY_LABELS: Record<string, string> = {
	cmd: IS_MAC ? '⌘' : 'Ctrl',
	alt: IS_MAC ? '⌥' : 'Alt',
	shift: '⇧',
	backspace: '⌫',
}

/** "cmd+shift+z" → "⌘ ⇧ Z", the way tldraw prints shortcuts. */
export const formatKbd = (kbd: string) =>
	kbd
		.split('+')
		.map((key) => KEY_LABELS[key] ?? key.toUpperCase())
		.join(' ')

export const tip = (label: string, kbd?: string) => (kbd ? `${label} — ${formatKbd(kbd)}` : label)

/** Close on a press outside the element, or on Escape. */
export function useDismiss(open: boolean, onClose: () => void): RefObject<HTMLDivElement | null> {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!open) return
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) onClose()
		}
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			// keep Escape from also reaching the editor's own shortcut handler
			e.stopPropagation()
			onClose()
		}
		document.addEventListener('pointerdown', onPointerDown, true)
		document.addEventListener('keydown', onKeyDown, true)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true)
			document.removeEventListener('keydown', onKeyDown, true)
		}
	}, [open, onClose])
	return ref
}

export type Placement = 'top' | 'top-start' | 'bottom-start' | 'left'

export function Popover(props: {
	placement: Placement
	className?: string
	trigger: (open: boolean, toggle: () => void) => ReactNode
	children: (close: () => void) => ReactNode
}) {
	const [open, setOpen] = useState(false)
	const close = useRef(() => setOpen(false)).current
	const ref = useDismiss(open, close)
	return (
		<div className="tlui-popover" ref={ref}>
			{props.trigger(open, () => setOpen((o) => !o))}
			{open && (
				<div className={`tlui-popover__content tlui-popover__${props.placement} ${props.className ?? ''}`}>
					{props.children(close)}
				</div>
			)}
		</div>
	)
}

export interface MenuItem {
	label: string
	kbd?: string
	onSelect?: () => void
	disabled?: boolean
	/** Present on toggle items; draws a check mark when true. */
	checked?: boolean
	children?: MenuItem[][]
}

export function Menu({ groups, close }: { groups: MenuItem[][]; close: () => void }) {
	const [submenu, setSubmenu] = useState<string | null>(null)
	return (
		<div className="tlui-menu" role="menu">
			{groups.map((group, i) => (
				<div className="tlui-menu__group" key={i}>
					{group.map((item) => (
						<div key={item.label} className="tlui-menu__item" onPointerEnter={() => setSubmenu(item.children ? item.label : null)}>
							<button
								type="button"
								role="menuitem"
								className="tlui-button tlui-button__menu"
								disabled={item.disabled}
								onClick={() => {
									if (item.children) return setSubmenu(item.label)
									item.onSelect?.()
									close()
								}}
							>
								<span className="tlui-button__label">{item.label}</span>
								{item.kbd && <kbd className="tlui-kbd">{formatKbd(item.kbd)}</kbd>}
								{item.checked !== undefined && (
									<span className="tlui-menu__check" data-checked={item.checked}>
										<Icon name="check" small />
									</span>
								)}
								{item.children && <Icon name="chevron-right" small />}
							</button>
							{item.children && submenu === item.label && (
								<div className="tlui-menu__submenu">
									<Menu groups={item.children} close={close} />
								</div>
							)}
						</div>
					))}
				</div>
			))}
		</div>
	)
}

export function IconButton(props: {
	icon: string
	label: string
	kbd?: string
	onClick?: () => void
	disabled?: boolean
	active?: boolean
	/** For buttons that open a popover. */
	expanded?: boolean
	className?: string
	testId?: string
	small?: boolean
}) {
	return (
		<button
			type="button"
			className={`tlui-button ${props.className ?? 'tlui-button__icon'}`}
			title={tip(props.label, props.kbd)}
			aria-label={tip(props.label, props.kbd)}
			aria-pressed={props.active}
			aria-expanded={props.expanded}
			data-state={props.expanded ? 'on' : undefined}
			data-testid={props.testId}
			disabled={props.disabled}
			onClick={props.onClick}
		>
			<Icon name={props.icon} small={props.small} />
		</button>
	)
}
