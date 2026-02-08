import type { Store } from '../state'
import { toggleLineFilter, clearLineFilter } from '../state'
import type { LineInfo } from '../types'

const FILTER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`

function groupLinesByType(
  lines: readonly LineInfo[]
): { trams: readonly LineInfo[]; buses: readonly LineInfo[] } {
  const trams: LineInfo[] = []
  const buses: LineInfo[] = []

  for (const line of lines) {
    if (line.type === 'tram') {
      trams.push(line)
    } else {
      buses.push(line)
    }
  }

  return { trams, buses }
}

function createChipElement(
  line: LineInfo,
  isSelected: boolean,
  onToggle: () => void
): HTMLButtonElement {
  const chip = document.createElement('button')
  chip.className = `filter-chip${isSelected ? ' filter-chip--active' : ''}`
  chip.textContent = line.name
  chip.setAttribute('aria-pressed', String(isSelected))
  chip.setAttribute('data-line-id', line.id)

  if (isSelected) {
    chip.style.backgroundColor = line.color
    chip.style.borderColor = line.color
    chip.style.color = '#ffffff'
  } else {
    chip.style.backgroundColor = 'transparent'
    chip.style.borderColor = line.color
    chip.style.color = line.color
  }

  chip.addEventListener('click', onToggle)

  return chip
}

function createChipsContainer(
  lines: readonly LineInfo[],
  selectedLines: ReadonlySet<string>,
  store: Store
): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'filter-chips'

  for (const line of lines) {
    const isSelected = selectedLines.has(line.id)
    const chip = createChipElement(line, isSelected, () => {
      store.setState(toggleLineFilter(line.id))
    })
    container.appendChild(chip)
  }

  return container
}

function createGroupElement(
  title: string,
  lines: readonly LineInfo[],
  selectedLines: ReadonlySet<string>,
  store: Store
): HTMLDivElement {
  const group = document.createElement('div')
  group.className = 'filter-group'

  const heading = document.createElement('h4')
  heading.textContent = title
  group.appendChild(heading)

  const chips = createChipsContainer(lines, selectedLines, store)
  group.appendChild(chips)

  return group
}

function renderPanelContent(
  linesContainer: HTMLDivElement,
  lines: readonly LineInfo[],
  selectedLines: ReadonlySet<string>,
  store: Store
): void {
  linesContainer.innerHTML = ''

  const { trams, buses } = groupLinesByType(lines)

  if (trams.length > 0) {
    const tramGroup = createGroupElement('Tramway', trams, selectedLines, store)
    linesContainer.appendChild(tramGroup)
  }

  if (buses.length > 0) {
    const busGroup = createGroupElement('Bus', buses, selectedLines, store)
    linesContainer.appendChild(busGroup)
  }
}

function updateBadge(
  badge: HTMLSpanElement,
  count: number
): void {
  if (count > 0) {
    badge.textContent = String(count)
    badge.hidden = false
  } else {
    badge.hidden = true
  }
}

export function createFilterPanel(
  container: HTMLElement,
  store: Store
): void {
  const toggleButton = document.createElement('button')
  toggleButton.className = 'filter-toggle'
  toggleButton.id = 'filter-toggle'
  toggleButton.innerHTML = FILTER_ICON_SVG
  toggleButton.setAttribute('aria-label', 'Filtrer les lignes')

  const badge = document.createElement('span')
  badge.className = 'filter-badge'
  badge.hidden = true
  toggleButton.appendChild(badge)

  const overlay = document.createElement('div')
  overlay.className = 'filter-overlay'

  const panel = document.createElement('div')
  panel.className = 'filter-panel'
  panel.id = 'filter-panel'

  const handle = document.createElement('div')
  handle.className = 'filter-handle'
  panel.appendChild(handle)

  const header = document.createElement('div')
  header.className = 'filter-header'

  const title = document.createElement('h3')
  title.textContent = 'Lignes'
  header.appendChild(title)

  const resetButton = document.createElement('button')
  resetButton.className = 'filter-reset'
  resetButton.textContent = 'Tout afficher'
  resetButton.addEventListener('click', () => {
    store.setState(clearLineFilter())
  })
  header.appendChild(resetButton)

  panel.appendChild(header)

  const linesContainer = document.createElement('div')
  linesContainer.className = 'filter-lines'
  panel.appendChild(linesContainer)

  function togglePanel(): void {
    const isOpen = panel.classList.contains('open')
    panel.classList.toggle('open', !isOpen)
    overlay.classList.toggle('active', !isOpen)
  }

  toggleButton.addEventListener('click', togglePanel)
  overlay.addEventListener('click', togglePanel)

  container.appendChild(toggleButton)
  container.appendChild(overlay)
  container.appendChild(panel)

  store.subscribe((state) => {
    renderPanelContent(
      linesContainer,
      state.lines,
      state.selectedLines,
      store
    )
    updateBadge(badge, state.selectedLines.size)
  })

  const currentState = store.getState()
  renderPanelContent(
    linesContainer,
    currentState.lines,
    currentState.selectedLines,
    store
  )
  updateBadge(badge, currentState.selectedLines.size)
}
