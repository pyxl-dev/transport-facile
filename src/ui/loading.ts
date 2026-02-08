export function createLoadingIndicator(container: HTMLElement): {
  show(): void
  hide(): void
} {
  const bar = document.createElement('div')
  bar.className = 'loading-bar'
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-label', 'Chargement en cours')

  container.appendChild(bar)

  return {
    show() {
      bar.classList.add('active')
    },

    hide() {
      bar.classList.remove('active')
    },
  }
}
