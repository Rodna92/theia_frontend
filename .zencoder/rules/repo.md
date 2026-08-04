---
description: Repository Information Overview
alwaysApply: true
---

# Theia Frontend Core Information

## Summary
Theia is a modern Next.js-based frontend application for automated process management and monitoring. Built with React 19, TypeScript, and Tailwind CSS, it features internationalization support for multiple languages and a component-driven architecture with client-side services integration.

## Project Structure
- **app/**: Next.js App Router with layout and locale-based routing using `[locale]` dynamic segments
- **components/**: Reusable UI components (ProcessSelector, leakDetectionWizard, etc.)
- **ui/**: Core UI component library
- **client/**: Client-side services and TypeScript type definitions
- **locales/**: Internationalization JSON files (en, de, es, fr, it)
- **.next/**: Build output and cache (generated)

## Language & Runtime
**Language**: TypeScript 5.0.0  
**Runtime**: Node.js (ES2020 target)  
**Framework**: Next.js 15.0.0  
**Frontend Library**: React 19.0.0  
**Package Manager**: npm (lockfile: package-lock.json)  
**Build System**: Next.js (SWC minification enabled)

## Dependencies
**Main Dependencies**:
- next (^15.0.0) - Full-stack React framework
- react (^19.0.0) - UI library
- react-dom (^19.0.0) - React DOM bindings
- next-intl (^3.0.0) - Internationalization
- @tabler/icons-react (^3.0.0) - Icon library

**Development Dependencies**:
- typescript (^5.0.0) - Type checker
- @types/react (^19.0.0) - React type definitions
- @types/react-dom (^19.0.0) - React DOM types
- @types/node (^20.0.0) - Node.js types
- tailwindcss (^3.4.0) - CSS framework
- postcss (^8.4.0) - CSS transformer
- autoprefixer (^10.4.0) - Browser prefix support

## Configuration Files
- **next.config.js**: Next.js configuration with next-intl plugin integration
- **tsconfig.json**: TypeScript configuration with strict mode enabled, path aliases (@/), and Next.js plugin support
- **tailwind.config.ts**: Tailwind CSS theme with custom slate and cyan colors, and custom animations
- **postcss.config.js**: PostCSS plugins for Tailwind and autoprefixing
- **i18n.ts**: next-intl server configuration for locale-specific message loading
- **.eslintrc.json**: ESLint configuration extending Next.js core-web-vitals
- **.env.example**: Environment template with NEXT_PUBLIC_API_URL placeholder

## Build & Installation

**Install dependencies**:
```bash
npm install
```

**Development server**:
```bash
npm run dev
```

**Production build**:
```bash
npm run build
```

**Start production server**:
```bash
npm start
```

**Type checking**:
```bash
npm run typecheck
```

**Linting**:
```bash
npm run lint
```

## Styling & Theme
Tailwind CSS with custom theme configuration including extended color palette (slate 50-950, cyan 300-500) and custom animations (spin-slow). Styling scopes include app/, components/, and ui/ directories.

## Internationalization
Supports 5 languages via next-intl with locale-based routing:
- English (en)
- German (de)
- Spanish (es)
- French (fr)
- Italian (it)

Messages loaded from `locales/{locale}.json` files at server runtime.
