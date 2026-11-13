import { BASE_SLOTS, GRID, MAX_STEPS, cellOfToken, posOfToken } from './ludo';
import type { Token, Pt } from './types';

export interface PawnCell { id: string; center: Pt }
export function getPawnCell(token: Token): PawnCell {
  const [row, col] = cellOfToken(token);
  const center = posOfToken(token);
  if (token.steps < 0) return { id: 'base:' + token.id, center };
  if (token.steps === MAX_STEPS) return { id: 'finish:' + token.id, center };
  return { id: 'cell:' + row + ':' + col, center };
}
export function getCellRenderPosition(cell: PawnCell, boardSize: number): Pt {
  return { x: cell.center.x * boardSize / GRID, y: cell.center.y * boardSize / GRID };
}
export function buildOccupancy(tokens: Token[]): Map<string, Token[]> {
  const index = new Map<string, Token[]>();
  for (const token of tokens) {
    const id = getPawnCell(token).id;
    index.set(id, [...(index.get(id) || []), token]);
  }
  for (const group of index.values()) group.sort((a, b) => a.id.localeCompare(b.id));
  return index;
}
export function stackLayout(count: number, index: number): { offset: Pt; scale: number } {
  if (count <= 1) return { offset: { x: 0, y: 0 }, scale: 0.82 };
  const layouts = [[], [], [[-0.23, 0], [0.23, 0]],
    [[0, -0.23], [-0.23, 0.22], [0.23, 0.22]],
    [[-0.23, -0.23], [0.23, -0.23], [-0.23, 0.23], [0.23, 0.23]]];
  if (count <= 4) {
    const [x, y] = layouts[count][index];
    return { offset: { x, y }, scale: 0.44 };
  }
  const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns);
  return { offset: { x: ((index % columns) - (columns - 1) / 2) * 0.82 / columns,
    y: (Math.floor(index / columns) - (rows - 1) / 2) * 0.82 / rows }, scale: 0.78 / columns };
}
export function eligiblePawns(group: Token[], activeColor: Token['color'] | null, selectable: string[]) {
  return group.filter(t => t.color === activeColor && selectable.includes(t.id));
}
export function getBoardSize(width: number, height: number, inset = 0, playerCount = 2) {
  const available = Math.max(1, width - 32);
  return Math.min(available, 620, Math.max(Math.min(available, 280), height - inset - (playerCount > 2 ? 330 : 266)));
}
export function baseOrigin(color: Token['color']) {
  const [row, col] = BASE_SLOTS[color][0];
  return { left: Math.floor(col / 9) * 9, top: Math.floor(row / 9) * 9 };
}
