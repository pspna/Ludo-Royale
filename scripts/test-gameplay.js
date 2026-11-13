const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile pure engine modules in memory; no test dependency or generated source.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, filename);
const L = require('../src/lib/ludo.ts');
const G = require('../src/lib/boardGeometry.ts');
const A = require('../src/lib/ai.ts');
const colors = ['red', 'green', 'yellow', 'blue'];
const seats = colors.map(color => ({ id: color, color, name: color, type: 'cpu', difficulty: 'hard' }));
const pawn = (color, index, steps) => ({ id: color + '-' + index, seatId: color, color, index, steps });

test('all ring and lane cells resolve to exact centers at every board size', () => {
  assert.equal(new Set(L.RING.map(p => p.join(','))).size, 52);
  for (const color of colors) for (let steps = 0; steps < 56; steps++) {
    const token = pawn(color, 0, steps), [r, c] = L.cellOfToken(token), cell = G.getPawnCell(token);
    assert.equal(cell.id, 'cell:' + r + ':' + c);
    assert.deepEqual(cell.center, { x: c + 0.5, y: r + 0.5 });
    assert.deepEqual(L.posOfToken(token), cell.center);
    for (const size of [288, 328, 358, 620]) {
      const p = G.getCellRenderPosition(cell, size);
      assert.ok(Math.abs(p.x / (size / 15) - c - 0.5) < 1e-10);
      assert.ok(Math.abs(p.y / (size / 15) - r - 0.5) < 1e-10);
    }
  }
});
test('home formations are symmetric and inside the matching quadrant', () => {
  for (const color of colors) {
    const origin = G.baseOrigin(color);
    const points = [0,1,2,3].map(i => G.getPawnCell(pawn(color,i,-1)));
    assert.equal(new Set(points.map(p => p.id)).size, 4);
    assert.equal(points.reduce((sum,p)=>sum+p.center.x,0)/4, origin.left+3);
    assert.equal(points.reduce((sum,p)=>sum+p.center.y,0)/4, origin.top+3);
    assert.equal(new Set(points.map(p => p.center.x)).size, 2);
    assert.equal(new Set(points.map(p => p.center.y)).size, 2);
    for (const p of points) {
      assert.ok(p.center.x > origin.left && p.center.x < origin.left + 6);
      assert.ok(p.center.y > origin.top && p.center.y < origin.top + 6);
    }
  }
});
test('occupancy is stable across ordering and every stack remains inside its tile', () => {
  for (let count = 1; count <= 16; count++) {
    const tokens = Array.from({ length: count }, (_, i) => pawn(colors[Math.floor(i/4)], i%4, (52 - L.START_INDEX[colors[Math.floor(i/4)]])%52));
    const index = G.buildOccupancy(tokens), reversed = G.buildOccupancy([...tokens].reverse());
    assert.equal(index.size, 1);
    assert.deepEqual([...index.values()][0].map(t => t.id), [...reversed.values()][0].map(t => t.id));
    const positions = tokens.map((_, i) => G.stackLayout(count, i));
    assert.equal(new Set(positions.map(p => p.offset.x + ',' + p.offset.y)).size, count);
    for (const {offset, scale} of positions) {
      assert.ok(Math.abs(offset.x) + scale/2 <= 0.51);
      assert.ok(Math.abs(offset.y) + scale/2 <= 0.51);
    }
  }
});
test('shared safe cell filters opponents, finished pawns and illegal selections', () => {
  const tokens = [pawn('red',0,0), pawn('red',1,0), pawn('green',0,39)];
  const group = [...G.buildOccupancy(tokens).values()][0];
  assert.equal(group.length,3);
  assert.deepEqual(G.eligiblePawns(group,'red',L.legalMoves(tokens,'red',2)).map(t=>t.id), ['red-0','red-1']);
  assert.equal(G.eligiblePawns(group,'red',['red-1']).length,1);
  assert.equal(G.eligiblePawns(group,'red',[]).length,0);
  assert.equal(G.eligiblePawns(group,'red',['green-0']).length,0);
  const moved=L.applyMove(tokens,'red-0',1).tokens;
  assert.equal(G.buildOccupancy(moved).get(G.getPawnCell(tokens[0]).id).length,2);
});
test('capture, safe cells, exact finish, invalid dice and immutable input', () => {
  const tokens=[pawn('red',0,0),pawn('green',0,40)];
  const before=JSON.stringify(tokens), result=L.applyMove(tokens,'red-0',1);
  assert.equal(result.tokens[1].steps,-1);
  assert.equal(result.events[0].type,'capture');
  assert.equal(JSON.stringify(tokens),before);
  const safe=L.applyMove([pawn('red',0,7),pawn('green',0,47)],'red-0',1);
  assert.equal(safe.tokens[1].steps,47);
  assert.ok(!safe.events.some(e=>e.type==='capture'));
  for (const dice of [0,7,-1,1.5,NaN]) {
    assert.deepEqual(L.legalMoves(tokens,'red',dice),[]);
    assert.deepEqual(L.applyMove(tokens,'red-0',dice).tokens,tokens);
  }
  const finish=[pawn('red',0,55)];
  assert.deepEqual(L.applyMove(finish,'red-0',2).tokens,finish);
  assert.equal(L.applyMove(finish,'red-0',1).tokens[0].steps,56);
  assert.deepEqual(L.legalMoves([pawn('red',0,-1)],'red',5),[]);
  assert.equal(L.applyMove([pawn('red',0,-1)],'red-0',6).tokens[0].steps,0);
  assert.ok(L.hasWon([0,1,2,3].map(i=>pawn('red',i,56)),'red'));
});
test('movement traverses consecutive cell centers and enters each home lane', () => {
  for (const color of colors) {
    for (let steps=0;steps<55;steps++) {
      const p=L.posOfToken(pawn(color,0,steps)), q=L.waypointsFor(pawn(color,0,steps),1)[0];
      assert.equal(Math.max(Math.abs(q.x-p.x),Math.abs(q.y-p.y)),1);
    }
    assert.deepEqual(L.waypointsFor(pawn(color,0,48),6),[49,50,51,52,53,54].map(s=>G.getPawnCell(pawn(color,0,s)).center));
  }
});
test('all required viewports preserve a square board within available width', () => {
  const sizes=[[320,568],[360,640],[375,812],[390,844],[411,731],[412,915],[430,932],[428,926],[768,1024],[834,1194],[1024,1366],[1024,768],[1366,768],[1920,1080],[2560,1440]];
  for (const [w,h] of sizes) for (const [width,height] of [[w,h],[h,w]]) for (const count of [1,2,4]) {
    const size=G.getBoardSize(width,height,60,count);
    assert.ok(size>0 && size<=width-32 && size<=620);
  }
});
test('CPU regression: complete 40 deterministic games across 1–4 seats and difficulties', () => {
  const original=Math.random;
  let seed=731;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  try {
    for(let game=0;game<40;game++){
      const players=seats.slice(0,1+game%4).map((s,i)=>({...s,difficulty:['easy','medium','hard','expert'][i]}));
      let tokens=L.createTokens(players),turn=0,streak=0,won=false;
      for(let step=0;step<15000;step++){
        const seat=players[turn],dice=L.rollDice();
        assert.ok(dice>=1&&dice<=6);
        streak=dice===6?streak+1:0;
        if(streak>=3){streak=0;turn=(turn+1)%players.length;continue;}
        const moves=L.legalMoves(tokens,seat.id,dice);
        if(!moves.length){turn=(turn+1)%players.length;streak=0;continue;}
        const pick=A.chooseMove({tokens,seat,dice,difficulty:seat.difficulty,seats:players});
        assert.ok(moves.includes(pick));
        const result=L.applyMove(tokens,pick,dice);tokens=result.tokens;
        assert.ok(tokens.every(t=>t.steps>=-1&&t.steps<=56));
        if(L.hasWon(tokens,seat.id)){won=true;break;}
        if(!(dice===6||result.events.some(e=>e.type==='capture'||e.type==='finish'))){turn=(turn+1)%players.length;streak=0;}
      }
      assert.ok(won,'game '+game+' should finish');
    }
  } finally {Math.random=original;}
});
