# Graphite console UI / 0.3.0

The interface uses a graphite/amber audio-console design with muted cyan status details, recessed readouts, rendered physical controls, fewer navigation rows, and readable forms at the minimum desktop window size.

## Asset sources

- `src/assets/ui/v3/graphite-texture.png`: generated using the built-in imagegen tool. Original image copied unchanged from Codex generated-images storage into the repository. Used as a subdued repeating panel and transport texture.
- `src/assets/ui/v3/knob-cap.png` and `knob-bezel.png`: Blender render, moving cap and stationary calibrated surround.
- `jog-dial.png`: Blender platter render; interactive drag (nudge, or scratch in vinyl mode) and quarter-beat keyboard nudge.
- `button-idle.png`, `button-pressed.png`, `button-amber.png`: Blender physical key states and illuminated transport key.
- `fader-cap.png`: Blender metal slider handle.

All seven control sprites have transparent backgrounds and were rendered using Blender 5.2.0 LTS / Cycles. Editable scenes are saved in `design/blender/devolution-controls.blend`. Rebuild them using `blender --background --factory-startup --python design/blender/render_controls.py`. This creates a separate background process and does not edit an open interactive scene. No new 3D runtime or WebGL dependency is required.

## Imagegen prompt

Create one production UI texture asset, square 2048x2048 pixels: perfectly flat orthographic macro surface of premium very dark charcoal anodized aluminum, fine restrained horizontal brushed grain, subtle irregular tiny metallic pores. Uniform seamless tileable surface across all four edges. Base color around RGB 22,25,29 with gentle low contrast graphite variations. Sophisticated professional audio console industrial finish. Neutral lighting fully diffuse, no light source gradient, no edges, no objects, no knobs, no buttons, no labels, no text, no logo, no UI, no scratches or rust, no vignetting, no decorative pattern. This will be tiled subtly behind live readable software UI. Output the texture itself only.

## Interaction and accessibility

Knobs retain native range semantics, keyboard arrows/Home/End and numeric readouts. Drag vertically, hold Shift for fine movement, or double-click to reset where a default is defined. Jog dials preserve the existing native scratch and nudge commands, using drag-release or arrow keys. All physical controls have live text labels; text is rendered by the application, not baked into textures. Focus indicators and reduced-motion preferences are supported. The 15 control-rack modules are available through a labelled selector.

Custom project palettes are preserved. Projects using the original default palette receive the new graphite palette visually; newly created projects store the new default. The texture and all fonts are bundled for offline use.

Browser previews use explicit fixture data and real native DSP through the local verification adapter. They do not certify hardware playback or third-party plugin compatibility.


## v0.5 DEVOOO alien mothership

User-supplied brand reference is preserved in design/devooo-original-logo.jpg. The transparent UI wordmark is an ImageGen extraction derived from that supplied raster; it is not a vector master. The original is retained for precise brand reproduction.

ImageGen created src/assets/ui/v5/alien-mothership.png: midnight-violet cosmic atmosphere, pink/cyan/lime/gold accents, a relaxed headphones-wearing alien, smoke, a UFO and luminous mushrooms. The art is static and placed behind translucent decorative framing; meters, forms and charts retain dark solid surfaces. It adds no animation or GPU runtime.

Seven physical control sprites were re-rendered in Blender 5.2.0 LTS / Cycles with violet metal, cyan rim lights, lime indices and magenta status lamps. Editable scenes: design/blender/devolution-cosmic-controls.blend; generator: design/blender/render_cosmic_controls.py. This preserves the existing keyboard, drag, fine adjustment and reset behavior.

The default theme changes to midnight violet, neon cyan, pink, warm gold and pale acid green. Prior stock themes are mapped visually when opened; custom saved colors remain respected. No project schema change is needed.
