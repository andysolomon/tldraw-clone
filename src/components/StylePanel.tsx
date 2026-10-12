import type { CSSProperties, ReactNode } from 'react'
import { STYLE_SUPPORT, TOOL_SHAPE, setGeo, setStyle } from '../editor/actions'
import { fontWeight } from '../editor/measure'
import { useStore } from '../editor/store'
import { FONT_FAMILIES, OPACITY_STOPS, getPalette } from '../editor/theme'
import {
	ALIGNS,
	COLORS,
	DASHES,
	FONTS,
	GEO_TYPES,
	SIZES,
	type AlignStyle,
	type FillStyle,
	type ShapeType,
	type StyleKey,
	type Styles,
} from '../editor/types'
import { Icon } from './Icon'
import { GEO_LABELS } from './Toolbar'
import { Popover } from './ui'

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
const ALIGN_LABELS: Record<AlignStyle, string> = { start: 'Start', middle: 'Middle', end: 'End' }
const VALIGN_LABELS: Record<AlignStyle, string> = { start: 'Top', middle: 'Middle', end: 'Bottom' }

function StyleButton(props: {
	label: string
	testId: string
	selected: boolean
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			className="tlui-button tlui-button__style"
			role="radio"
			aria-checked={props.selected}
			aria-label={props.selected ? `${props.label} (selected)` : props.label}
			title={props.label}
			data-testid={props.testId}
			data-state={props.selected ? 'on' : 'off'}
			onClick={props.onClick}
		>
			{props.children}
		</button>
	)
}

export function StylePanel() {
	const tool = useStore((s) => s.tool)
	const selectedIds = useStore((s) => s.selectedIds)
	const doc = useStore((s) => s.doc)
	const styles = useStore((s) => s.styles)
	const geo = useStore((s) => s.geo)
	const dark = useStore((s) => s.dark)

	const shapes = selectedIds.flatMap((id) => (doc.shapes[id] ? [doc.shapes[id]] : []))
	const toolShape = TOOL_SHAPE[tool]
	const types: ShapeType[] = shapes.length ? [...new Set(shapes.map((s) => s.type))] : toolShape ? [toolShape] : []
	if (!types.length) return null

	const has = (key: StyleKey) => types.some((t) => STYLE_SUPPORT[key].includes(t))
	/** The shared value across the selection, or null when the selected shapes disagree. */
	function value<K extends StyleKey>(key: K): Styles[K] | null {
		if (!shapes.length) return styles[key]
		const values = new Set<Styles[K]>()
		for (const s of shapes) {
			if (STYLE_SUPPORT[key].includes(s.type)) values.add((s as unknown as Styles)[key])
		}
		return values.size === 1 ? [...values][0] : null
	}

	const palette = getPalette(dark)
	const fill = value('fill')
	const opacity = value('opacity')
	const opacityIndex = Math.max(0, opacity === null ? OPACITY_STOPS.length - 1 : OPACITY_STOPS.indexOf(opacity))
	const geoShapes = shapes.flatMap((s) => (s.type === 'geo' ? [s.geo] : []))
	const hasGeo = types.includes('geo')
	const geoValue = !shapes.length ? geo : new Set(geoShapes).size === 1 ? geoShapes[0] : null
	const extraFill: FillStyle = fill === 'fill' ? 'fill' : 'pattern'
	const verticalAlign = value('verticalAlign')

	return (
		<div className="tlui-style-panel__wrapper">
			<div className="tlui-style-panel" data-testid="style.panel">
				<div className="tlui-style-panel__section">
					{has('color') && (
						<div className="tlui-grid" role="radiogroup" aria-label="Color">
							{COLORS.map((c) => (
								<StyleButton key={c} label={`Color — ${title(c)}`} testId={`style.color.${c}`} selected={value('color') === c} onClick={() => setStyle('color', c)}>
									<span className="tlui-color-swatch" style={{ backgroundColor: palette.colors[c].solid }} />
								</StyleButton>
							))}
						</div>
					)}
					<div className="tlui-slider__container">
						<input
							type="range"
							className="tlui-slider"
							data-testid="style.opacity"
							aria-label={`Opacity — ${Math.round((opacity ?? 1) * 100)}%`}
							title={`Opacity — ${Math.round((opacity ?? 1) * 100)}%`}
							min={0}
							max={OPACITY_STOPS.length - 1}
							step={1}
							value={opacityIndex}
							style={{ '--tl-slider-fill': `${(opacityIndex / (OPACITY_STOPS.length - 1)) * 100}%` } as CSSProperties}
							onChange={(e) => setStyle('opacity', OPACITY_STOPS[Number(e.target.value)])}
						/>
					</div>
				</div>

				{(has('fill') || has('dash') || has('size')) && (
					<div className="tlui-style-panel__section">
						{has('fill') && (
							<div className="tlui-row" role="radiogroup" aria-label="Fill">
								{(['none', 'semi', 'solid'] as const).map((f) => (
									<StyleButton key={f} label={`Fill — ${title(f)}`} testId={`style.fill.${f}`} selected={fill === f} onClick={() => setStyle('fill', f)}>
										<Icon name={`fill-${f}`} />
									</StyleButton>
								))}
								<Popover
									placement="left"
									className="tlui-row"
									trigger={(_open, toggle) => (
										<StyleButton label="Fill" testId="style.fill-extra" selected={fill === 'pattern' || fill === 'fill'} onClick={toggle}>
											<Icon name={`fill-${extraFill}`} />
										</StyleButton>
									)}
								>
									{(close) =>
										(['pattern', 'fill'] as const).map((f) => (
											<StyleButton
												key={f}
												label={`Fill — ${title(f)}`}
												testId={`style.fill.${f}`}
												selected={fill === f}
												onClick={() => {
													setStyle('fill', f)
													close()
												}}
											>
												<Icon name={`fill-${f}`} />
											</StyleButton>
										))
									}
								</Popover>
							</div>
						)}
						{has('dash') && (
							<div className="tlui-row" role="radiogroup" aria-label="Dash">
								{DASHES.map((d) => (
									<StyleButton key={d} label={`Dash — ${title(d)}`} testId={`style.dash.${d}`} selected={value('dash') === d} onClick={() => setStyle('dash', d)}>
										<Icon name={`dash-${d}`} />
									</StyleButton>
								))}
							</div>
						)}
						{has('size') && (
							<div className="tlui-row" role="radiogroup" aria-label="Size">
								{SIZES.map((size) => (
									<StyleButton key={size} label={`Size — ${{ s: 'Small', m: 'Medium', l: 'Large', xl: 'Extra large' }[size]}`} testId={`style.size.${size}`} selected={value('size') === size} onClick={() => setStyle('size', size)}>
										<span className="tlui-size-label">{size.toUpperCase()}</span>
									</StyleButton>
								))}
							</div>
						)}
					</div>
				)}

				{(has('font') || has('align')) && (
					<div className="tlui-style-panel__section">
						{has('font') && (
							<div className="tlui-row" role="radiogroup" aria-label="Font">
								{FONTS.map((font) => (
									<StyleButton key={font} label={`Font — ${title(font)}`} testId={`style.font.${font}`} selected={value('font') === font} onClick={() => setStyle('font', font)}>
										<span className="tlui-font-label" style={{ fontFamily: FONT_FAMILIES[font], fontWeight: fontWeight(font) }}>
											Aa
										</span>
									</StyleButton>
								))}
							</div>
						)}
						{has('align') && (
							<div className="tlui-row" role="radiogroup" aria-label="Align">
								{ALIGNS.map((a) => (
									<StyleButton key={a} label={`Align — ${ALIGN_LABELS[a]}`} testId={`style.align.${a}`} selected={value('align') === a} onClick={() => setStyle('align', a)}>
										<Icon name={`align-${a}`} />
									</StyleButton>
								))}
								{has('verticalAlign') && (
									<Popover
										placement="left"
										className="tlui-row"
										trigger={(_open, toggle) => (
											<StyleButton label="Vertical align" testId="style.vertical-align" selected={false} onClick={toggle}>
												<Icon name={`valign-${verticalAlign ?? 'middle'}`} />
											</StyleButton>
										)}
									>
										{(close) =>
											ALIGNS.map((a) => (
												<StyleButton
													key={a}
													label={`Vertical align — ${VALIGN_LABELS[a]}`}
													testId={`style.vertical-align.${a}`}
													selected={verticalAlign === a}
													onClick={() => {
														setStyle('verticalAlign', a)
														close()
													}}
												>
													<Icon name={`valign-${a}`} />
												</StyleButton>
											))
										}
									</Popover>
								)}
							</div>
						)}
					</div>
				)}

				{hasGeo && (
					<div className="tlui-style-panel__section">
						<Popover
							placement="left"
							className="tlui-grid"
							trigger={(_open, toggle) => (
								<button type="button" className="tlui-button tlui-style-panel__picker" data-testid="style.geo" title="Shape" onClick={toggle}>
									<span>Shape</span>
									<Icon name={`geo-${geoValue ?? 'rectangle'}`} />
								</button>
							)}
						>
							{(close) =>
								GEO_TYPES.map((g) => (
									<StyleButton
										key={g}
										label={`Shape — ${GEO_LABELS[g]}`}
										testId={`style.geo.${g}`}
										selected={geoValue === g}
										onClick={() => {
											setGeo(g)
											close()
										}}
									>
										<Icon name={`geo-${g}`} />
									</StyleButton>
								))
							}
						</Popover>
					</div>
				)}
			</div>
		</div>
	)
}
