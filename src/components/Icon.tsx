import type { ReactNode } from 'react'
import { getGeoPaths } from '../editor/paths'
import { GEO_TYPES, type GeoType } from '../editor/types'

// Icons are drawn here from scratch on an 18×18 grid (tldraw's own icon sprite is not reused).
// A string is a stroked path; anything else is custom SVG content.

const dot = (cx: number, cy: number, r = 1.1) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />

const fillIcon = (inner: ReactNode) => (
	<>
		{inner}
		<rect x="3.5" y="3.5" width="11" height="11" rx="1.5" />
	</>
)

const dashIcon = (props: { strokeWidth?: number; strokeDasharray?: string }) => (
	<circle cx="9" cy="9" r="5.75" {...props} />
)

const ICONS: Record<string, ReactNode> = {
	// tools
	select: 'M4.5 2.5v12l3.1-2.9 2.1 4.6 1.9-.9-2.1-4.5h4.3z',
	hand: 'M6.2 9V4.4a1.05 1.05 0 0 1 2.1 0V8m0 0V3.4a1.05 1.05 0 0 1 2.1 0V8m0 0V4.4a1.05 1.05 0 0 1 2.1 0V9m0-1.6a1.05 1.05 0 0 1 2.1 0v3.9c0 2.6-1.8 4.4-4.4 4.4h-.9c-1.5 0-2.5-.6-3.4-1.9L3.6 10.9c-.6-.9.6-1.9 1.4-1.1l1.2 1.3',
	draw: 'M3 15l.9-3.5 8.3-8.3a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2l-8.3 8.3z M11.1 4.3l2.6 2.6',
	eraser: 'M7.4 15H5.2l-2.3-2.3a1.3 1.3 0 0 1 0-1.8l7-7a1.3 1.3 0 0 1 1.8 0l3.5 3.5a1.3 1.3 0 0 1 0 1.8L9.4 15z M6.2 7.6l4.4 4.4 M7.4 15H15',
	arrow: 'M4 14L14 4 M7.5 4H14v6.5',
	text: 'M4 5.2V3.5h10v1.7 M9 3.5v11 M7 14.5h4',
	note: 'M3.5 3.5h11v7l-4 4h-7z M14.5 10.5h-4v4',
	media: (
		<>
			<rect x="2.5" y="3.5" width="13" height="11" rx="1.5" />
			<path d="M2.5 12l3.6-3.2 3.1 2.6 2.1-1.6 4.2 3.4" />
			{dot(11.6, 7.2, 1)}
		</>
	),
	line: 'M3.5 14.5l11-11',
	highlight: 'M10.3 3.4l4.3 4.3-6.1 6.1H4.2V9.5z M8.4 5.3l4.3 4.3 M3 16h8',
	laser: 'M3.5 14.5l6.3-6.3 M12.5 2.8v2 M15.2 5.5h-2 M14.6 3.4l-1.3 1.3 M13 8.8l1.4 1.4 M7.8 3.6l1.4 1.4',
	frame: 'M3 6V3h3 M12 3h3v3 M15 12v3h-3 M6 15H3v-3',
	// chrome
	'chevron-up': 'M4.5 11.2L9 6.8l4.5 4.4',
	'chevron-down': 'M4.5 6.8L9 11.2l4.5-4.4',
	'chevron-right': 'M6.8 4.5L11.2 9l-4.4 4.5',
	'chevron-left': 'M11.2 4.5L6.8 9l4.4 4.5',
	undo: 'M3.5 7.5h7.2a3.5 3.5 0 0 1 0 7H8 M6.5 4.5l-3 3 3 3',
	redo: 'M14.5 7.5H7.3a3.5 3.5 0 0 0 0 7H10 M11.5 4.5l3 3-3 3',
	trash: 'M3.5 5h11 M7 5V3.5h4V5 M5 5l.7 9.5h6.6L13 5 M7.6 8v4 M10.4 8v4',
	duplicate: 'M6.5 6.5h8v8h-8z M3.5 11.5v-8h8',
	'dots-vertical': <>{[dot(9, 4), dot(9, 9), dot(9, 14)]}</>,
	plus: 'M9 4v10 M4 9h10',
	minus: 'M4 9h10',
	check: 'M4 9.5l3.3 3.3L14 5.6',
	cross: 'M5 5l8 8 M13 5l-8 8',
	// fill
	'fill-none': fillIcon(null),
	'fill-semi': fillIcon(<rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.12" stroke="none" />),
	'fill-solid': fillIcon(<rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.4" stroke="none" />),
	'fill-pattern': fillIcon(<path d="M4 9l5-5 M4 13l9-9 M6 14.5l8.5-8.5 M10 14.5l4.5-4.5" strokeWidth="1" />),
	'fill-fill': fillIcon(<rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />),
	// dash
	'dash-draw': dashIcon({ strokeWidth: 3 }),
	'dash-dashed': dashIcon({ strokeDasharray: '3 2.02' }),
	'dash-dotted': dashIcon({ strokeDasharray: '0.1 2.58' }),
	'dash-solid': dashIcon({}),
	// text alignment
	'align-start': 'M4 3.5v11 M13.5 9H7 M9.8 6.2L7 9l2.8 2.8',
	'align-middle': 'M9 3.5v11 M2.5 9h4 M4.7 7.2L6.5 9l-1.8 1.8 M15.5 9h-4 M13.3 7.2L11.5 9l1.8 1.8',
	'align-end': 'M14 3.5v11 M4.5 9H11 M8.2 6.2L11 9l-2.8 2.8',
	'valign-start': 'M3.5 4h11 M9 14.5v-7 M6.2 10.3L9 7.5l2.8 2.8',
	'valign-middle': 'M3.5 9h11 M9 2.5v4 M7.2 4.7L9 6.5l1.8-1.8 M9 15.5v-4 M7.2 13.3L9 11.5l1.8 1.8',
	'valign-end': 'M3.5 14h11 M9 3.5v7 M6.2 7.7L9 10.5l2.8-2.8',
	// arrange
	'arrange-left': 'M3.5 3v12 M6 5.5h8V8H6z M6 10h5v2.5H6z',
	'arrange-center-horizontal': 'M9 3v12 M4 5.5h10V8H4z M6 10h6v2.5H6z',
	'arrange-right': 'M14.5 3v12 M4 5.5h8V8H4z M7 10h5v2.5H7z',
	'arrange-top': 'M3 3.5h12 M5.5 6v8H8V6z M10 6v5h2.5V6z',
	'arrange-center-vertical': 'M3 9h12 M5.5 4v10H8V4z M10 6v6h2.5V6z',
	'arrange-bottom': 'M3 14.5h12 M5.5 4v8H8V4z M10 7v5h2.5V7z',
	'distribute-horizontal': 'M3.5 3v12 M14.5 3v12 M7.5 5.5h3v7h-3z',
	'distribute-vertical': 'M3 3.5h12 M3 14.5h12 M5.5 7.5h7v3h-7z',
	'order-back': 'M9 3v8.5 M5.5 8L9 11.5 12.5 8 M4 15h10',
	'order-backward': 'M9 4v9 M5.5 9.5L9 13l3.5-3.5',
	'order-forward': 'M9 14V5 M5.5 8.5L9 5l3.5 3.5',
	'order-front': 'M9 15V6.5 M5.5 10L9 6.5l3.5 3.5 M4 3h10',
	'rotate-ccw': 'M4 9.5a5 5 0 1 0 1.6-4 M3.6 2.8v3.2h3.2',
	'rotate-cw': 'M14 9.5a5 5 0 1 1-1.6-4 M14.4 2.8v3.2h-3.2',
	group: 'M3 5.5V3h2.5 M12.5 3H15v2.5 M15 12.5V15h-2.5 M5.5 15H3v-2.5 M6.5 6.5h5v5h-5z',
	ungroup: 'M3 3h6v6H3z M9 9h6v6H9z',
}

function geoIcon(geo: GeoType): ReactNode {
	const paths = getGeoPaths(geo, 13, 13, 1.5, 'solid', geo)
	return (
		<g transform="translate(2.5 2.5)">
			{paths.strokes.map((s, i) => (
				<path key={i} d={s.d} />
			))}
		</g>
	)
}

for (const geo of GEO_TYPES) ICONS[`geo-${geo}`] = geoIcon(geo)

export function Icon({ name, small }: { name: string; small?: boolean }) {
	const icon = ICONS[name]
	const size = small ? 15 : 18
	return (
		<svg
			className="tlui-icon"
			width={size}
			height={size}
			viewBox="0 0 18 18"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{typeof icon === 'string' ? <path d={icon} /> : icon}
		</svg>
	)
}
