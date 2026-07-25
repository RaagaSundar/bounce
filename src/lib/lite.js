// Lite mode: `?lite` in the URL swaps WebGL scenes for CSS-only backdrops.
// For underpowered event hardware (that one projector laptop) and headless QA.
export const LITE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')
