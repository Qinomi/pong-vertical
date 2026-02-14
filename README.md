# Pong Vertical

Mobile game project built with Expo/React Native.
Core gameplay is vertical Pong with multiple modes, local history, and online sync-ready data flow.

## Features

- Play modes: `FIRST_TO_5`, `FIRST_TO_X`, `TIME_ATTACK`
- Online lobby/game flow (`online-lobby`, `online-game`)
- Match history and leaderboard screens
- Local-first persistence (SQLite) with remote sync (Firebase/Firestore)
- Expo Router based navigation

## Tech Stack

- Framework: Expo + React Native + TypeScript
- Navigation: Expo Router
- UI: React Native components + `expo-linear-gradient` + `@expo/vector-icons`
- Local storage: `expo-sqlite`, `@react-native-async-storage/async-storage`
- Backend/Sync: Firebase Firestore (REST + Firebase SDK packages)
- Network awareness: `@react-native-community/netinfo`
- Tooling: ESLint (Expo config)

## Project Structure

```text
pong-vertical/
|-- app/                  # Routes/screens (Expo Router)
|-- components/           # Reusable UI and game components
|-- lib/                  # Data layer (db, sqlite, sync, firebase, network)
|-- hooks/                # React hooks
|-- constants/            # Shared constants
|-- styles/               # Shared styling
|-- assets/               # Images/icons
|-- docs/                 # Project documentation
|-- archive/              # Old/experimental file variants (not used at runtime)
|-- scripts/              # Utility scripts
`-- README.md
```

## Quick Start

```bash
npm install
npm run start
```

Useful scripts:

- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run lint`

## Environment and Git Hygiene

- Do not commit secrets in `.env` files.
- Keep local config in `.env` (ignored by git).
- If needed, share template values in `.env.example` only.
- `node_modules/` and build/cache artifacts are ignored by `.gitignore`.
