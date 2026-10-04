# Source notes

- `mock-data/photos.json` is the authoritative content model.
- Photo files under `mock-data/photos/` are runtime assets referenced by their paths.
- Font files under `assets/fonts/` are local runtime assets.
- Do not open or parse image binaries in this workspace; reference their paths directly from the application.
