# Khipu Studio - Application

The main Electron + React application for Khipu Studio.

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Electron 38** - Desktop app framework
- **Zustand** - State management
- **React Router** - Navigation
- **i18next** - Internationalization

## Development

### Start Development Server

```bash
npm run dev
```

This starts both Vite dev server and Electron in watch mode.

### Build for Production

```bash
# Build UI only
npm run build:ui

# Build complete app for current platform
npm run build

# Build for specific platforms
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
npm run build:all     # All platforms
```

### Code Quality

```bash
# Run linter
npm run lint

# Preview production build
npm run preview
```

## Project Structure

```
app/
├── src/
│   ├── components/      # Reusable UI components
│   ├── features/        # Feature-specific modules
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Core services & utilities
│   ├── locales/         # i18n translation files
│   ├── pages/           # Main application pages
│   ├── schemas/         # Zod validation schemas
│   ├── store/           # Zustand state stores
│   └── types/           # TypeScript type definitions
├── electron/            # Electron main process
├── public/              # Static assets
└── dist/                # Build output
```

## Main Pages

- **Home** - Project selection and creation
- **Manuscript** - Manuscript import and processing
- **Characters** - Character detection and management
- **Planning** - SSML orchestration and segment assignment
- **Voice** - Audio production and synthesis
- **Packaging** - Multi-platform export

## Key Features

### Internationalization

App supports multiple languages via i18next:
- English (en-US)
- Spanish (es-PE)
- Portuguese (pt-BR)

Translation files in `src/locales/{lang}/common.json`

### State Management

Uses Zustand for lightweight, performant state:
- `store/project.ts` - Project state
- `store/audio-cache.ts` - Audio cache management

### Audio Processing

Two audio processors available:
- **SoX** - Professional audio processing (preferred)
- **FFmpeg** - Fallback audio processing

### IPC Communication

Electron main process handlers in `electron/main.cjs`:
- File system operations
- Python script execution
- Audio processing
- Project management

## Development Tips

### Hot Module Replacement (HMR)

Vite provides instant HMR for React components. Changes appear immediately without full reload.

### Type Checking

TypeScript strict mode enabled. Run type check:
```bash
npx tsc --noEmit
```

### Debugging

Open DevTools in Electron:
- **Windows/Linux:** Ctrl+Shift+I
- **macOS:** Cmd+Option+I

Main process logs appear in terminal.

## Configuration Files

- `vite.config.ts` - Vite configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint rules
- `package.json` - Dependencies and scripts

## Environment Variables

Create `.env` in root directory (not in app/):

```env
AZURE_TTS_KEY=your_key
AZURE_TTS_REGION=eastus
OPENAI_API_KEY=your_key
```

Access in main process via `process.env`, not in renderer.

## Troubleshooting

### Build Fails

```bash
# Clear cache and reinstall
rm -rf node_modules dist
npm install
```

### Electron Won't Start

1. Check Python virtual environment is activated
2. Verify FFmpeg/SoX are installed
3. Check for port conflicts (5173)

### Type Errors

```bash
# Update TypeScript and check types
npm install -D typescript@latest
npx tsc --noEmit
```

## Contributing

1. Follow existing code style
2. Run linter before committing
3. Add types for new features
4. Update i18n for UI changes
5. Test on multiple platforms

## Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Electron Documentation](https://www.electronjs.org/)
- [Zustand Documentation](https://zustand.docs.pmnd.rs/)

---

For complete setup instructions, see [../INSTALL.md](../INSTALL.md)
