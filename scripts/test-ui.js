/**
 * Dependency-free Chrome DevTools smoke test against the real exported app.
 * Run npm run build first, then node scripts/test-ui.js.
 * Screenshots and measurements are written only to ignored .expo/ui-verification.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const wait = ms => new Promise(r => setTimeout(r, ms));
const output = path.resolve('.expo/ui-verification');
fs.mkdirSync(output, { recursive: true });
const browser = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = http.createServer((req,res) => {
  const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '');
  const root = path.resolve('dist');
  const file = path.resolve(root, relative || 'index.html');
  if (!file.startsWith(root + path.sep) && file !== root) {res.writeHead(403);res.end();return;}
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root,'index.html');
  const mime = {'.js':'application/javascript','.html':'text/html','.ttf':'font/ttf','.png':'image/png','.wav':'audio/wav','.ico':'image/x-icon'};
  res.setHeader('Content-Type',mime[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
let chrome, socket;
const errors = [], results = [];
async function main() {
  await new Promise(r=>server.listen(4173,'127.0.0.1',r));
  chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=9227','--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'ludo-ui-')),'about:blank'],
    {stdio:'ignore',windowsHide:true});
  let tabs;
  for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9227/json')).json();break;}catch{await wait(200);}}
  assert.ok(tabs,'Chrome debugging endpoint');
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let sequence=0; const pending=new Map();
  socket.addEventListener('message',e=>{
    const msg=JSON.parse(e.data);
    if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}
    if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout: '+method));}},15000).unref();
  });
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'Browser evaluation failed');
    return r.result?.value;
  };
  const activate=async expression=>{
    await wait(200);
    const point=await evaluate('(()=>{const e='+expression+';if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    assert.ok(point,'click target '+expression);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  };
  const click=async label=>{
    await activate('[...document.querySelectorAll("[role=button]")].filter(e=>e.getClientRects().length>0).find(e=>e.innerText.includes('+JSON.stringify(label)+'))');
    await wait(450);
  };
  const screenshot=async name=>{
    const r=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await send('Page.navigate',{url:'http://127.0.0.1:4173'});
  await wait(3300);
  if(await evaluate('document.body.innerText.includes("Skip")')) await click('Skip');
  await wait(600);
  console.log('HOME:',(await evaluate('document.body.innerText')).slice(0,320));
  await screenshot('home-mobile');
  const viewports=[[320,568],[360,640],[375,812],[390,844],[411,731],[412,915],[430,932],[428,926],[768,1024],[834,1194],[1024,1366],[1024,768],[1366,768],[1920,1080],[2560,1440],[568,320],[844,390],[1024,768]];
  const measure=async screen=>{
    const r=await evaluate('(()=>{const b=[...document.querySelectorAll("[data-testid=game-board]")].find(e=>e.getBoundingClientRect().width>0)?.getBoundingClientRect();const overflow=[...document.querySelectorAll("div")].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return s.display!=="none"&&s.overflowX!=="hidden"&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&r.width>0;}).map(e=>({width:e.clientWidth,scroll:e.scrollWidth,text:e.innerText.slice(0,50)}));return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,board:b?{width:b.width,height:b.height,left:b.left,right:b.right}:null,overflow:overflow.slice(0,8)};})()');
    results.push({screen,...r});
    assert.ok(r.documentWidth<=r.width+1,screen+' document overflow '+JSON.stringify(r));
    if(screen!=='home') assert.ok(r.board && r.board.width>0,screen+' visible board is required');
    if(r.board){assert.ok(Math.abs(r.board.width-r.board.height)<1);assert.ok(r.board.left>=0&&r.board.right<=r.width+1);}
  };
  for(const [width,height] of viewports){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:width<768});
    await wait(100);await measure('home');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  if (!process.env.NAV_ONLY) {
  await wait(350);
  // Use the real practice flow, then force only the dice RNG for reproducible input.
  await click('Practice Solo');
  await wait(500);
  await click('START MATCH');await wait(600);
  await screenshot('game-mobile');
  for(const [width,height] of viewports){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:width<768});
    await wait(100);await measure('game');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await evaluate('Math.random=()=>0.999');
  const roll=async()=>{await activate('[...document.querySelectorAll("[aria-label]")].filter(e=>e.getClientRects().length>0).find(e=>e.getAttribute("aria-label")==="Roll dice")');await wait(1700);};
  const move=async label=>{await activate('[...document.querySelectorAll("[aria-label]")].filter(e=>e.getClientRects().length>0).find(e=>e.getAttribute("aria-label").startsWith('+JSON.stringify(label)+'))');await wait(700);};
  await roll();await move('red pawn 1.');
  await roll();await move('red pawn 2.');
  await roll();await wait(1400); // Existing three-sixes rule forfeits this roll.
  await roll();await move('red pawn 1, red pawn 2.');
  assert.ok(await evaluate('document.body.innerText.includes("Choose your pawn")'),'stack selector opens');
  assert.equal(await evaluate('[...document.querySelectorAll("[aria-label]")].filter(e=>e.getAttribute("aria-label").startsWith("Move red pawn")).length'),2);
  await screenshot('stack-selector');
  await click('Cancel');
  await move('red pawn 1, red pawn 2.');
  await move('Move red pawn 2');
  await wait(1000);
  assert.ok(!(await evaluate('document.body.innerText.includes("Choose your pawn")')),'selection dismisses after move');
  await screenshot('after-stack-move');
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});
  await wait(300);await screenshot('game-desktop');
  // Return through the pause menu and verify existing navigation.
  await activate('[...document.querySelectorAll("[aria-label]")].filter(e=>e.getClientRects().length>0).find(e=>e.getAttribute("aria-label")==="Pause match")');
  await wait(300);await click('Quit to home');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await wait(250);
  }
  for (const label of ['Profile', 'Statistics', 'Achievements', 'Customize', 'Settings', 'How to Play', 'Create Room', 'Join Room']) {
    await click(label);
    await screenshot('navigation-'+label.replaceAll(' ','-'));
    console.log('NAV',label,(await evaluate('document.body.innerText')).slice(-180));
    assert.ok(await evaluate('[...document.querySelectorAll("[aria-label]")].some(e=>e.getAttribute("aria-label")==="Back" && e.getBoundingClientRect().width>0)'),label+' opens a screen with a Back control');
    await activate('[...document.querySelectorAll("[aria-label]")].filter(e=>e.getClientRects().length>0).find(e=>e.getAttribute("aria-label")==="Back")');
    await wait(400);
  }
  for(const count of [2,4]){
    await click('Classic Match');
    if(count===4) await click('4 Players');
    await click('START MATCH');await wait(500);
    for(const [width,height] of viewports){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:width<768});
      await wait(100);await measure('classic-'+count);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
    await wait(250);await screenshot('game-'+count+'-players-mobile');
    await activate('[...document.querySelectorAll("[aria-label]")].filter(e=>e.getClientRects().length>0).find(e=>e.getAttribute("aria-label")==="Pause match")');
    await wait(250);await click('Quit to home');
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));
  assert.deepEqual(errors,[],'uncaught browser exceptions');
  console.log('PASS:',results.length,'viewport checks; real dice, pawn and stack-selector interactions; no uncaught exceptions.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  socket?.close();chrome?.kill();server.close();
});
