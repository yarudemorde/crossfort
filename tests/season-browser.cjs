const {chromium}=require(process.env.CROSSFORT_PLAYWRIGHT_MODULE||'playwright');
const root=require('path').join(__dirname,'..');
const assert=require('node:assert/strict');
(async()=>{
const http=require('http'),fs=require('fs'),path=require('path');const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch(e){res.statusCode=404;res.end();}});await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CROSSFORT_CHROMIUM_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8765');
await page.evaluate(()=>{Math.random=()=>0.1;cpuTurn=async function(){};wait=async function(){};var cards={};CARD_POOLS['赤'].slice(0,10).forEach(c=>cards[c[0]]=4);savedDecks=[{id:'test',name:'遠征テスト',colors:['赤'],cards}];persistSavedDecks();beginSeason1();});
async function advance(){await page.evaluate(()=>{while(currentSeasonStory&&$('seasonStoryScreen').style.display!=='none')advanceSeasonStory();});}
await advance();await page.evaluate(()=>{eventDeckDraft='test';confirmSeason1Deck();});await advance();
for(let stage=1;stage<=3;stage++){
await page.evaluate(async(stage)=>{if(state.eventStage!==stage)throw Error('stage mismatch');state.playerTurn=true;var u=cloneCard(CARD_POOLS['赤'][0],'赤');u.power=100;u.canAttack=true;state.playerBoard[0]=u;state.enemyDefense[0]=1;await changeLife('player',-1);try{await attack('player',0);}catch(e){if(!e.staleBattle)throw e;}},stage);
await page.waitForTimeout(500);
assert.equal(await page.evaluate(()=>eventSeason1.currentHp),20-stage);
if(stage===3){assert.equal(await page.evaluate(()=>currentSeasonStory),'ending');assert.equal(await page.locator('#seasonOutcomeScreen').isVisible(),false);}
await advance();
}
await page.waitForTimeout(800);assert.equal(await page.locator('#seasonOutcomeScreen').isVisible(),true);assert.equal(await page.evaluate(()=>seasonScores.clears),1);
assert.equal(await page.locator('#seasonTotalScore').innerText(),await page.evaluate(()=>seasonScores.last.total.toLocaleString()));
for(const [width,height] of [[360,640],[390,844],[430,932],[360,568],[1280,800]]){await page.setViewportSize({width,height});await page.screenshot({path:require('path').join(process.env.CROSSFORT_SCREENSHOT_DIR||'/tmp','crossfort-clear-'+width+'-'+height+'.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.getByRole('button',{name:'戦績詳細',exact:true}).click();assert.equal(await page.locator('#seasonDetails').isVisible(),true);await page.getByRole('tab',{name:'黒龍',exact:true}).click();assert.match(await page.locator('#seasonDetailContent').innerText(),/WIN/);await page.getByRole('button',{name:'閉じる ×'}).click();}
await page.getByRole('button',{name:'もう一度挑戦',exact:true}).click();assert.equal(await page.evaluate(()=>seasonScores.run.battles.length),0);assert.equal(await page.evaluate(()=>seasonScores.clears),1);await advance();await page.evaluate(()=>{eventDeckDraft='test';confirmSeason1Deck();});await advance();
await page.evaluate(async()=>{state.playerHand=[];try{await changeLife('player',-30);}catch(e){if(!e.staleBattle)throw e;}checkGame();});await page.waitForTimeout(1200);assert.match(await page.locator('#eventOutcomeKicker').innerText(),/MISSION FAILED/);assert.equal(await page.evaluate(()=>seasonScores.last.clearBonus),0);await page.setViewportSize({width:390,height:844});await page.screenshot({path:require('path').join(process.env.CROSSFORT_SCREENSHOT_DIR||'/tmp','crossfort-failed.png')});
await page.getByRole('button',{name:'ホームへ戻る',exact:true}).click();assert.equal(await page.locator('#homeScreen').isVisible(),true);
await page.evaluate(()=>{showDeckLibrary();showDeckEditor('test');});assert.equal(await page.locator('#deckEditorScreen').isVisible(),true);
await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>showSeason1Outcome('failed'));assert.equal(await page.evaluate(()=>seasonCountFrame),0);
assert.deepEqual(errors,[]);console.log('PASS browser: 3 stage flow, HP carry, ending, CLEAR/FAILED, retry, history, details, home, editor, reduced motion, 5 viewports');await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
