# AGENTS.md

This file provides guidance for AI coding agents when working with code in this
repository.

## Project Overview

This is a TypeScript library that provides a simple wrapper around local
tunneling services (localhost.run and serveo.net). The library is designed to
work across multiple JavaScript runtimes: Deno, Node.js, and Bun.

## Development Commands

### Deno Development

- **Format and type check**: `deno task check` - Runs formatter check and type
  checking
- **Install git hooks**: `deno task hooks:install` - Sets up pre-commit hooks
- **Pre-commit hook**: `deno task hooks:pre-commit` - Runs format and type
  checks

### Node.js/pnpm Development

**Important**: This project uses pnpm exclusively, not npm. Always use pnpm for
dependency management and script execution.

- **Build**: `pnpm run build` - Builds the project using tsdown
- **Prepack**: `pnpm run prepack` - Runs before packing
- **Prepublish**: `pnpm run prepublish` - Runs before publishing

## Architecture

### Core Components

1. **Service Layer** (`src/service.ts`):
   - Defines `Service` interface for tunnel service configurations
   - Maintains `SERVICES` registry with localhost.run and serveo.net
     configurations
   - Provides service selection logic with exclusion support

2. **Main API** (`src/index.ts`):
   - Exports `openTunnel()` function as the primary entry point
   - Handles SSH process spawning and management
   - Implements automatic retry mechanism with service exclusion
   - Uses LogTape for logging with category `["localtunnel"]`

### Key Design Patterns

- **SSH-based tunneling**: Uses system SSH client to establish tunnels (requires
  SSH installed)
- **Service abstraction**: Each tunneling service has a configuration with host,
  port, user, and URL pattern
- **Automatic fallback**: If one service fails, automatically retries with
  another service
- **Process management**: Spawns SSH process, captures output to extract tunnel
  URL, and provides clean shutdown

### Multi-runtime Support

The project uses different build configurations for different runtimes:

- **Deno**: Direct TypeScript execution from `src/index.ts`
- **Node.js/Bun**: Built with tsdown to generate CommonJS and ESM outputs in
  `dist/`

### Dependencies

- **@logtape/logtape**: Logging library used for debug and error messages
- **tsdown**: Build tool for generating Node.js/Bun compatible outputs
- **typescript**: Type checking and declarations
