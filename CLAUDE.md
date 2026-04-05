# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Single-file static portfolio website for Uma Maheshwar Reddy Manda (DevOps Engineer). The entire site lives in `index.html` — all CSS, HTML markup, and JavaScript are inline in that one file. `profile.jpg` is the only other asset.

## Development

No build step, package manager, or framework. Open `index.html` directly in a browser or use any static file server:

```bash
# Python
python -m http.server 8080

# Node (if npx available)
npx serve .
```

## File structure

`index.html` is organized in this order:
1. `<head>` — CDN font link (`geist@1.3.0`), all CSS styles, Three.js importmap
2. `<body>` — HTML sections (nav, hero, about, values, skills/services, experience, education, projects, certifications, FAQs, CTA, footer)
3. Inline `<script>` — intro vaporize overlay animation (vanilla canvas/particles)
4. `<script type="module">` — Three.js interactive network globe in the hero section

## Key dependencies (CDN only)

- **Three.js 0.157.0** (`unpkg.com`) — 3D globe in hero; loaded as ES module via importmap
- **OrbitControls** — from `three/addons/`, enables drag-to-rotate on the globe
- **Geist Sans font** (`cdn.jsdelivr.net/npm/geist@1.3.0`)

## Page sections and their IDs

| Section | `id` attribute |
|---|---|
| Hero | `#home` |
| About | `#about` |
| Values | `#values` |
| Skills | `#skills` |
| Experience | `#experience` |
| Education | `#education` |
| Projects | `#projects` |
| Certifications | `#certifications` |
| FAQs | `#faqs` |

## Design system

- **Dark background**: `#0d0d12` (hero, skills, education, footer)
- **Light background**: `#ffffff` (about, values, experience, projects, certs, FAQs)
- **Accent color**: `#c9aaff` (purple) — used for highlights, scrollbar, badge dot
- **Hero gradient text**: `linear-gradient(90deg, #c9aaff, #feffbc 25%, #ffcdfd 50%, #b3e2ff 75%, #839aff)`
- Scroll-triggered `fade-up` class on elements — triggered by an IntersectionObserver in the inline script
- Mobile breakpoints at 900px and 600px

## Intro animation

On page load a full-screen canvas overlay (`#intro-overlay`) renders a particle vaporize animation cycling through three text phrases before dissolving. Clicking anywhere skips it. Logic is in the first `<script>` block (~line 1647).

## Globe (Three.js)

The hero globe (`#globeCanvas`) is a `SphereGeometry` with a wireframe overlay, atmosphere rim shader (custom `ShaderMaterial`), animated network nodes/edges drawn as `LineSegments`, and glowing dots. OrbitControls allow drag interaction; auto-rotation resumes 2.5s after the user releases. All globe code is in the `<script type="module">` block (~line 2033).
