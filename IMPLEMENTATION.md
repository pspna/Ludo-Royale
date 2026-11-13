# Ludo Royale implementation notes

## Audit and scope

The existing application uses Expo 57, React 19, React Native 0.86, React Navigation native stacks, React Native StyleSheet, Reanimated, and Expo gradients. There is no CSS framework or Redux store.

The source tree was indexed before implementation. Core gameplay, rendering, navigation, storage, feedback, and multiplayer paths were traced. The versioned Expo 57 documentation was read before edits:
- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/versions/v57.0.0/sdk/audio/

GameScreen owns the local MatchState and synchronous authoritative ref. ludo.ts provides legal moves, captures, safe squares, home entry, finishing, and route waypoints. ai.ts chooses CPU moves. Board renders the 15 × 15 grid; TokenView animates pieces. store.tsx persists profile, achievements, settings, statistics, and owned customization through storage.ts.

Online rooms use multiplayer.ts and server/server.js over HTTP/WebSocket. The server validates player identity, turn, phase, and selectable pawn before committing a move. Its rules and wire protocol were preserved. Client animation resolves the server-reported move through the local canonical route rather than trusting legacy pixel or corner coordinates.

Existing routes and features remain: classic, quick, practice, room creation/joining/lobbies, CPU difficulty, pass-and-play, profile, statistics, achievements, customization, settings, help, sounds, haptics, pause/restart, and match results.

Implementation sequence: fix geometry and occupancy; preserve validated move flow; introduce design tokens; update Home/Game; add adaptive layouts; verify engine, multiplayer and rendered interactions. Main regression risks were route orientation, safe-cell coexistence, capture rules, animation timing, screen resizing, and retained inactive navigation screens.

## Root causes

1. Track tiles use integer row/column origins. Pawn transforms interpreted those same integers as centers, putting pieces half a tile up and left.
2. Base origins placed green at lower left and blue at upper right, inconsistent with their slot coordinates, start squares and home lanes.
3. Base slots were asymmetric around the six-cell home-zone center.
4. Every pawn on a shared cell used the same center and an independent hit target. DOM order and stacking determined which piece received input.
5. Local applyMove accepted invalid dice and clamped overshooting moves instead of rejecting them.
6. Game used a fixed dark gradient and an uncapped board-size formula. Short screens lacked a safe scrolling fallback.
7. Shared Press applied row layout to its animation wrapper, leaving its actual Pressable children in a column.
8. Chrome exposed an existing pre-interaction audio autoplay rejection; the Expo web player discards the underlying media play promise.

## Coordinate and selection architecture

Authoritative Token.steps remains unchanged: -1 means base; 0–50 traverses the existing ring; 51–55 enters the existing lane; 56 finishes.

posOfToken is the canonical center resolver in grid units. It adds 0.5 to track/lane origins; base and finish slots already contain center coordinates. No route cells or gameplay rules were rearranged.

boardGeometry.getPawnCell assigns stable cell identities:
- cell:row:column for shared playable tiles;
- base:tokenId and finish:tokenId for individual resting slots.

getCellRenderPosition converts the canonical center using boardSize / 15. Tiles, hit targets and pawns share that scale. Animation shared values stay in grid units, so resizing changes the rendering scale without replaying movement.

buildOccupancy derives Map<CellId, Token[]> from authoritative positions, sorted by persistent token ID. Stack offsets are normalized tile fractions: centered, side-by-side, triangular, or 2 × 2. Larger groups use a compact grid, a count badge, and the same expandable selection interface.

Pawns are visual-only on the board. One hit target per eligible occupied cell filters by active color and validated selectable IDs. A single eligible pawn moves directly. Multiple eligible pawns open a modal with numbered identities and 48-point controls. Cancel leaves state untouched. Opponent pieces cannot intercept the active player's selection.

GameScreen revalidates the selected ID against legalMoves. Offline phase changes synchronously before animation. Online submissions lock the local phase while awaiting the authoritative response, and errors/reconnects request a fresh snapshot. The server remains authoritative.

Movement follows the existing consecutive waypoints. The moving pawn and final authoritative position are settled together locally. Memoized pawn views and stable token-array references avoid rerendering unchanged pawn bodies during unrelated banners and turn updates.

## Visual and responsive changes

design.ts defines shared colors, spacing, typography, radii, motion, surface tints and layout limits. The default Classic theme now uses ivory/lavender surfaces, purple actions, and vivid red/green/yellow/blue pieces. Other purchased themes and the dark appearance setting remain available.

Home has a gradient avatar, real coin balance, red/violet/blue hero with dice and pawn decoration, golden Play Now action, pastel mode cards, Kingdom tiles and floating navigation using existing routes. Mode columns adapt at 640 and 1000 CSS pixels. Kingdom cards adapt from one to three columns.

Game has a theme-aware ambient background, compact header, wrapping player cards with initials and progress, a square board, colored bases and finish triangles, glossy pawn silhouettes, and a rounded dice/status dock. Legal tiles have optional outlines. Pawn selection and turn highlights are restrained. Reduced-motion and animation settings suppress gameplay motion.

The board size is capped at 620 CSS pixels. Available width and height, player count and safe-area insets determine its size. Short or landscape screens scroll vertically instead of distorting the board. Main screens include horizontal notch insets; content widths are capped on desktop. Decorative blobs are clipped inside their own background layer.

Shared buttons now expose button roles, disabled states and named Back/Pause/Dice controls. The stack selector offers labels independent of color.

## Files changed

| File | Purpose |
| --- | --- |
| src/lib/boardGeometry.ts | Canonical cell identities, occupancy, stack layouts, eligibility and board sizing |
| src/lib/design.ts | Shared visual tokens |
| src/lib/ludo.ts | Center coordinates, symmetric base slots, invalid-move validation |
| src/lib/theme.ts | Default product palette while retaining other themes |
| src/lib/sound.ts | Avoid web audio before browser user activation |
| src/components/Board.tsx | Correct quadrants, center triangles, tile-level selection, stack modal and count badges |
| src/components/TokenView.tsx | Glossy pawn body, normalized animation coordinates, reduced motion, cleanup and memoization |
| src/components/Dice.tsx | Motion setting, reduced-motion support and accessible roll label |
| src/components/ui.tsx | Pressable layout, accessibility and golden button palette |
| src/screens/HomeScreen.tsx | Responsive Home redesign and existing-route navigation |
| src/screens/GameScreen.tsx | Responsive game layout, legal selection, online submission guard, safe areas and feedback |
| scripts/test-gameplay.js | Pure engine and geometry regressions compiled in memory |
| scripts/test-ui.js | Dependency-free Chrome pointer/viewport verification |
| package.json | test:gameplay and test:ui commands |
| IMPLEMENTATION.md | Audit, rationale, verification and limitations |

No new application dependencies, fake routes, mock game modes, or server rule changes were introduced.

## Verification

Run:
- npx tsc --noEmit
- npm run test:gameplay
- npm run test:multiplayer
- node scripts/test-multiplayer-resilience.js
- npm run build
- npm run test:ui

The eight gameplay tests cover all ring/lane coordinates and resizing, symmetric base placement, deterministic stacks from 1 to 16, shared safe cells, legal/illegal eligibility, entering/leaving shared tiles, captures, exact finish, invalid dice, input immutability, actual route adjacency, and 40 deterministic complete games across 1–4 seats and CPU difficulties.

The existing multiplayer suite passes 10 checks. The resilience/configuration suite passes 14 checks. TypeScript and production web export pass.

The Chrome harness uses the real exported app, real pointer hit testing, and deterministic dice only during the gameplay interaction scenario. It enters practice, rolls onto a shared cell, opens/cancels/reopens the selector, and moves pawn 2. It exercises Profile, Statistics, Achievements, Customize, Settings, Help, Create Room, Join Room, and two-/four-player classic layouts.

Its matrix contains 18 viewport configurations per screen, covering 320–2560 CSS pixels, tablet/laptop/desktop sizes, landscape and DPR 2–3. Game checks require a visible square board inside the viewport. Measurements and screenshots are saved to ignored .expo/ui-verification; results.json records the completed run and uncaught exceptions.

## Limits and deployment considerations

- Only the written brief was attached. No Home/Game reference images were available, so exact visual matching cannot be certified.
- Chrome desktop emulation was used. Physical iOS/Android devices, Safari, native audio and screen readers still need device validation.
- Browser tests cover real local interactions and room-screen navigation; online game validation uses the existing backend suites rather than a two-browser live match.
- EXPO_PUBLIC_SERVER_URL is unset. Online deployment needs an existing backend endpoint configured through the environment or Server Settings. The web export succeeds without it.
- Boards with many occupants intentionally use smaller grouped visuals and an expandable selector. A mobile tile is smaller than a general 44-point control; the full-size selector provides the larger individual pawn targets.
- Existing result/confetti and secondary-screen decorative animations were retained. Physical-device performance and all accessibility preferences across every secondary screen have not been exhaustively profiled.
