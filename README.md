# nine

Minimal multi-account switcher for Discord
One window, a thin sidebar of nine dots, one account per dot

## features

- Nine slots, each with its own saved Discord login
- Drag a dot onto another to rearrange, the account moves with its dot
- Logins stay saved: the account-to-slot mapping and the order survive restarts
- Switch with the sidebar or Cmd+1 to Cmd+9 (follows the dot order)
- Only the 2 most recently used accounts stay loaded in RAM, an unloaded account reopens already logged in
- The app reopens on the account you used last

## run

```
npm install
npm start
```

## build (apple silicon)

```
npm run build
cp -R dist/mac-arm64/Nine.app /Applications/
```

Requires node 22 LTS.
The app is unsigned, so on first launch right-click it and choose Open.

## notes

- Logins live in the app's local data folder (Application Support / Nine), never in this repo
- Each slot is a separate browser profile, so the nine accounts never share cookies or sessions
- Not affiliated with Discord
