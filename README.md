# Winova Toolkit

A dark-first Windows utility suite built with Electron. Winova combines system information, clipboard history, text transformations, developer utilities, secure generators, network diagnostics, and useful Windows shortcuts.

> Early preview: Winova currently uses `0.x` semantic versions while features and APIs are still evolving.

## Development

```powershell
npm install
npm start
```

## Windows build

```powershell
npm run dist
```

The installer, portable executable, blockmap, and `latest.yml` update manifest are written to `release/`.

## Publishing an update

1. Increment the version in `package.json` using semantic versioning.
2. Commit and tag the release, for example `v0.1.18`.
3. Build with `npm run dist`.
4. Create a public GitHub Release for the tag.
5. Upload the `Winova-Toolkit-Setup` executable, its blockmap, and `latest.yml`.

Installed builds check the public GitHub Releases feed automatically and can also check from Preferences. Do not publish `latest.yml` before its referenced installer and blockmap are uploaded.

## Privacy and security

- Utility data is processed locally.
- Renderer isolation and sandboxing are enabled.
- Native functionality is exposed through a narrow preload bridge.
- External navigation and DNS input are validated.
