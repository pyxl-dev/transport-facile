const STAR_OUTLINE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
const STAR_FILLED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`

export function createFavoriteButton(
  isFavorite: boolean,
  onToggle: () => void
): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = `favorite-star${isFavorite ? ' favorite-star--active' : ''}`
  button.innerHTML = isFavorite ? STAR_FILLED : STAR_OUTLINE
  button.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris')
  button.setAttribute('aria-pressed', String(isFavorite))

  button.addEventListener('click', (e) => {
    e.stopPropagation()
    onToggle()
  })

  return button
}
