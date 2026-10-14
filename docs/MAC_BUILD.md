# Devolution Deck on macOS

Mac builds use the same v0.8 source as Windows: the alien mothership and DEVOOO artwork, larger touch layout, live forward/reverse platter scratching, beat cues and persistent deck filters. Each architecture must pass the native and frontend tests, production asset checks and checks for all nine v5 PNGs plus touch styles inside the packaged Mach-O executable.

The Mac workflow builds Apple Silicon and Intel packages on native GitHub runners. These builds target macOS 13 or later and use an ad-hoc signature. They are not Apple Developer ID signed or notarized; Gatekeeper acceptance and distribution signing remain to be completed. They are test builds, and physical audio, microphone permissions, external touchscreen drivers and plugin/device behavior still need validation on the intended Mac.

Open the DMG and copy DEVOLUTION DECK.app to Applications, or extract the app ZIP. Choose Decks, load a track, enable Vinyl and press Play. Hold and rotate the platter to scratch; release to resume. Touch controls require a pointer-capable display/driver; mouse and keyboard controls are also supported. Allow microphone access when recording. Audio output settings live in ~/Library/Application Support/devolution-deck.

To build locally on a Mac, install Tauri's macOS prerequisites, Node.js 24, Rust, CMake and the VST3 SDK. Set VST3_SDK_PATH to the SDK root, then run npm ci, npm test, node scripts/cargo.mjs test --locked, and node scripts/tauri.mjs build --bundles app,dmg -- --locked. The platform configuration supplies the microphone usage description and audio-input entitlement. Never embed signing credentials in the repository.

References: https://v2.tauri.app/start/prerequisites/ and https://v2.tauri.app/distribute/macos-application-bundle/.
