import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { baseOrigin, buildOccupancy, eligiblePawns, getCellRenderPosition, getPawnCell, stackLayout } from '../lib/boardGeometry';
import { TokenView } from './TokenView';
import { BASE_SLOTS, GRID, LANE, MAX_STEPS, RING, SAFE_RING, START_INDEX } from '../lib/ludo';
import { RING_ORDER, alpha } from '../lib/theme';
import type { GameTheme, TokenStyleId } from '../lib/theme';
import type { MoveJob, PlayerColor, Token } from '../lib/types';

interface Props {
  size: number;
  theme: GameTheme;
  tokenStyle: TokenStyleId;
  tokens: Token[];
  activeColor: PlayerColor | null;
  selectable: string[];
  moving: MoveJob | null;
  hints: boolean;
  onTokenPress?: (tokenId: string) => void;
  compact?: boolean;
  animate?: boolean;
}

interface Cell {
  r: number;
  c: number;
  kind: 'track' | 'safe' | 'start' | 'lane';
  color?: PlayerColor;
}

const BASE_SIZE = 6;

export function Board({ size, theme, tokenStyle, tokens, activeColor, selectable, moving, hints, onTokenPress, compact, animate = true }: Props) {
  const cell = size / GRID;
  const occupancy = useMemo(() => buildOccupancy(tokens), [tokens]);
  const [selection, setSelection] = useState<string | null>(null);
  const choices = selection ? eligiblePawns(occupancy.get(selection) || [], activeColor, moving ? [] : selectable) : [];
  useEffect(() => { setSelection(null); }, [tokens, activeColor, moving, selectable.join(',')]);
  const chooseCell = (id: string) => {
    if (moving || !onTokenPress) return;
    const eligible = eligiblePawns(occupancy.get(id) || [], activeColor, selectable);
    if (eligible.length === 1) onTokenPress(eligible[0].id);
    else if (eligible.length > 1) setSelection(id);
  };
  const board = theme.board;

  const cells = useMemo<Cell[]>(() => {
    const list: Cell[] = [];
    RING.forEach(([r, c], i) => {
      const startColor = RING_ORDER.find((col) => START_INDEX[col] === i);
      const isSafe = SAFE_RING.includes(i);
      list.push({ r, c, kind: startColor ? 'start' : isSafe ? 'safe' : 'track', color: startColor });
    });
    (Object.keys(LANE) as PlayerColor[]).forEach((color) => {
      LANE[color].forEach(([r, c]) => list.push({ r, c, kind: 'lane', color }));
    });
    return list;
  }, []);

  return (
    <View testID="game-board" style={[styles.board, { width: size, height: size, borderRadius: size * 0.055, backgroundColor: board.bg, borderColor: board.trackBorder, shadowColor: board.shadow }]}>
      {RING_ORDER.map((color) => (
        <Base key={color} color={color} theme={theme} cell={cell} active={activeColor === color} />
      ))}

      {cells.map((def) => {
        const key = `${def.r}-${def.c}`;
        const isStart = def.kind === 'start';
        const isSafe = def.kind === 'safe';
        const isLane = def.kind === 'lane';
        const spec = def.color ? theme.players[def.color] : null;
        const bg = isStart ? spec!.main : isLane ? alpha(spec!.main, theme.dark ? 0.9 : 0.82) : isSafe ? board.safe : board.track;
        const border = isStart ? spec!.dark : isLane ? spec!.dark : board.trackBorder;
        return (
          <View
            key={key}
            style={{
              position: 'absolute',
              left: def.c * cell,
              top: def.r * cell,
              width: cell,
              height: cell,
              backgroundColor: bg,
              borderRadius: cell * 0.2,
              borderWidth: 1,
              borderColor: border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isSafe && !isStart ? <Ionicons name="star" size={cell * 0.5} color={board.star} /> : null}
            {isStart ? <Ionicons name="play" size={cell * 0.42} color={spec!.text} style={{ marginLeft: cell * 0.05 }} /> : null}
          </View>
        );
      })}

      <View style={{ position: 'absolute', left: 6 * cell, top: 6 * cell, width: 3 * cell, height: 3 * cell }}>
        <Triangle size={cell * 1.5} side="top" color={theme.players.green.main} />
        <Triangle size={cell * 1.5} side="bottom" color={theme.players.blue.main} />
        <Triangle size={cell * 1.5} side="left" color={theme.players.red.main} />
        <Triangle size={cell * 1.5} side="right" color={theme.players.yellow.main} />
        <View
          style={{
            position: 'absolute',
            left: cell * 1.08,
            top: cell * 1.08,
            width: cell * 0.84,
            height: cell * 0.84,
            borderRadius: cell,
            backgroundColor: board.center,
            borderWidth: 1,
            borderColor: board.trackBorder,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.85,
          }}
        >
          {!compact ? <Ionicons name="trophy" size={cell * 0.46} color={board.star} /> : null}
        </View>
      </View>

      {tokens.map((t) => {
        const canonical = getPawnCell(t);
        const group = occupancy.get(canonical.id)!;
        const layout = stackLayout(group.length, group.findIndex(p => p.id === t.id));
        const pos = { x: canonical.center.x + layout.offset.x, y: canonical.center.y + layout.offset.y };
        const spec = theme.players[t.color];
        const isHome = t.steps === MAX_STEPS;
        const isMoving = !!moving && moving.tokenId === t.id;
        return (
          <TokenView
            key={t.id}
            tokenId={t.id}
            spec={spec}
            styleId={tokenStyle}
            cell={cell}
            animate={animate}
            pos={pos}
            sizeFactor={isHome ? 0.55 : t.steps < 0 ? 0.78 : layout.scale}
            selectable={hints && selectable.includes(t.id)}
            dim={selectable.length > 0 && !selectable.includes(t.id)}
            moving={isMoving ? moving : null}
            zIndex={2 + Math.round(pos.y * 2) + (isMoving ? 60 : 0)}
            onPress={undefined}
          />
        );
      })}
      {Array.from(occupancy.entries()).filter(([, group]) => group.length > 4).map(([id, group]) => {
        const { center } = getPawnCell(group[0]);
        return <View key={'count:' + id} pointerEvents="none" style={{ position: 'absolute',
          left: center.x * cell, top: (center.y - 0.5) * cell, zIndex: 95, minWidth: cell * 0.5,
          borderRadius: cell * 0.2, backgroundColor: theme.light.text, alignItems: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: Math.max(8, cell * 0.3), fontWeight: '800' }}>{group.length}</Text>
        </View>;
      })}
      {onTokenPress ? Array.from(occupancy.entries()).map(([id, group]) => {
        const eligible = eligiblePawns(group, activeColor, moving ? [] : selectable);
        if (!eligible.length) return null;
        const position = getCellRenderPosition(getPawnCell(group[0]), size);
        return <Pressable key={'hit:' + id} accessibilityRole="button"
          accessibilityLabel={group.map(t => t.color + ' pawn ' + (t.index + 1)).join(', ') + '. ' + eligible.length + ' legal moves'}
          onPress={() => chooseCell(id)}
          style={{ position: 'absolute', left: position.x - cell / 2, top: position.y - cell / 2,
            width: cell, height: cell, zIndex: 100, borderRadius: cell * 0.18,
            borderWidth: hints ? 2 : 0, borderColor: alpha(theme.players[activeColor!].dark, 0.65) }} />;
      }) : null}
      <Modal visible={!!selection && choices.length > 1} transparent animationType="fade" onRequestClose={() => setSelection(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.light.overlay, padding: 20 }}>
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 360, maxHeight: '85%', padding: 20, borderRadius: 24, backgroundColor: theme.light.surface }}>
            <Text style={{ color: theme.light.text, fontSize: 20, fontWeight: '800' }}>Choose your pawn</Text>
            <Text style={{ color: theme.light.textDim, marginVertical: 10 }}>These pawns share a tile. Which one should move?</Text>
            <ScrollView>
              {choices.map(t => <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={'Move ' + t.color + ' pawn ' + (t.index + 1)}
                onPress={() => { setSelection(null); onTokenPress?.(t.id); }}
                style={{ minHeight: 48, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: theme.players[t.color].tint }}>
                <Text style={{ color: theme.players[t.color].dark, fontWeight: '800' }}>{t.color.toUpperCase()} · PAWN {t.index + 1}</Text>
              </Pressable>)}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setSelection(null)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: theme.light.primary, textAlign: 'center', fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Triangle({ size, side, color }: { size: number; side: 'top' | 'bottom' | 'left' | 'right'; color: string }) {
  const common = { width: 0, height: 0, position: 'absolute' as const, borderStyle: 'solid' as const, borderColor: 'transparent' };
  switch (side) {
    case 'top':
      return <View style={[common, { left: 0, top: 0, borderLeftWidth: size, borderRightWidth: size, borderTopWidth: size, borderTopColor: color }]} />;
    case 'bottom':
      return <View style={[common, { left: 0, bottom: 0, borderLeftWidth: size, borderRightWidth: size, borderBottomWidth: size, borderBottomColor: color }]} />;
    case 'left':
      return <View style={[common, { left: 0, top: 0, borderTopWidth: size, borderBottomWidth: size, borderLeftWidth: size, borderLeftColor: color }]} />;
    default:
      return <View style={[common, { right: 0, top: 0, borderTopWidth: size, borderBottomWidth: size, borderRightWidth: size, borderRightColor: color }]} />;
  }
}

function Base({ color, theme, cell, active }: { color: PlayerColor; theme: GameTheme; cell: number; active: boolean }) {
  const spec = theme.players[color];
  const origin = baseOrigin(color);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (active) {
      pulse.value = withTiming(0.65, { duration: 200 });
    } else {
      pulse.value = withTiming(0, { duration: 250 });
    }
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.6,
    shadowOpacity: 0.4 + pulse.value * 0.4,
  }));

  const size = BASE_SIZE * cell;
  const inset = cell * 0.65;

  return (
    <View style={{ position: 'absolute', left: origin.left * cell, top: origin.top * cell, width: size, height: size }}>
      <View style={{ flex: 1, backgroundColor: spec.tint, borderRadius: cell * 0.7, borderWidth: 1.5, borderColor: alpha(spec.main, 0.35), padding: inset }}>
        <View style={{ flex: 1, backgroundColor: theme.board.baseInner, borderRadius: cell * 0.5, borderWidth: 1, borderColor: alpha(spec.main, 0.22), alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: cell * 2.1, height: cell * 2.1, borderRadius: cell, borderWidth: 2, borderColor: alpha(spec.main, 0.22) }} />
        </View>
      </View>

      {[0, 1, 2, 3].map((i) => {
        const [row, col] = BASE_SLOTS[color][i];
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (col - origin.left) * cell - cell * 0.44,
              top: (row - origin.top) * cell - cell * 0.44,
              width: cell * 0.88,
              height: cell * 0.88,
              borderRadius: cell,
              backgroundColor: theme.board.baseSlot,
              borderWidth: 1,
              borderColor: alpha(spec.main, 0.3),
            }}
          />
        );
      })}

      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: cell * 0.7,
              borderWidth: 3,
              borderColor: spec.main,
              shadowColor: spec.main,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 0 },
            },
            glowStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderWidth: 0,
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
});
