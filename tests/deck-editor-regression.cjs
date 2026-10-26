const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),nodes=new Map(),storage=new Map();
class Element {
 constructor(){this.style={};this.dataset={};this.children=[];this.attrs={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x),contains:x=>this.classes.has(x)};this.textContent='';this._html='';this.value='';this.parts={};this.writes=0;}
 set innerHTML(s){this._html=s;this.children=[];this.parts={};this.writes++;}
 get innerHTML(){return this._html;}
 get firstElementChild(){return this.children[0]||null;}
 appendChild(c){this.insertBefore(c,null);}
 insertBefore(c,before){if(c.parent)c.remove();let at=before?this.children.indexOf(before):-1;if(at<0)at=this.children.length;this.children.splice(at,0,c);c.parent=this;}
 remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
 addEventListener(){}querySelector(selector){if(!this.parts[selector])this.parts[selector]=new Element();return this.parts[selector];}
 querySelectorAll(selector){if(selector==='.quantityControl button')return [this.querySelector('minus'),this.querySelector('plus')];return [];}
}
function node(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);}
const tabs=['all','included','excluded'].map(v=>{const e=new Element();e.setAttribute('data-editor-view',v);return e;});
const colors=['緑','白','赤','青','黒','黄'].map(v=>{const e=new Element();e.setAttribute('data-editor-color',v);return e;});
const document={body:node('body'),documentElement:node('html'),getElementById:node,querySelector(){return null;},querySelectorAll(s){return s==='[data-editor-view]'?tabs:s==='[data-editor-color]'?colors:[];},createElement(){return new Element();}};
const window={scrollY:700,scrollTo(x,y){this.scrollY=y;},addEventListener(){}};
const ctx=vm.createContext({console,document,window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout,MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){},confirm:()=>true});
for(const file of ['data/cards.js','data/card-rules.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
let checks=0;function check(value,msg){assert.ok(value,msg);checks++;}
function list(){return node('deckEditList').children.filter(e=>e.dataset.cardName).map(e=>e.dataset.cardName);}
function reset(){ctx.showDeckEditor();ctx.toggleEditorColor('青');}
reset();window.scrollY=700;
check(!node('deckAnalysis').open,'analysis initially folded');
check(node('deckTotalCount').textContent==='0 / 40'&&node('deckAverageCost').textContent==='0.0','empty deck summary');
check(list().length===ctx.CARD_POOLS['青'].length,'all selected-colour cards shown');
let rows=Array.from(node('deckEditList').children),cards=list().map(n=>{let t=ctx.cardTemplateByName(n);return ctx.cloneCard(t.row,t.color);});
check(cards.every((c,i)=>!i||ctx.cardCostOrder(cards[i-1],c)<=0),'cost ascending with stable tie ordering');
let entry=ctx.editorRows.get('禁書の一頁'),row=entry.node,writes=row.writes;
entry.plus.onclick();entry.plus.onclick();
check(ctx.editorCounts['禁書の一頁']===2&&entry.value.textContent==='2','plus updates count');
check(node('deckTotalCount').textContent==='2 / 40'&&node('deckAverageCost').textContent==='1.0','statistics update immediately');
check(ctx.editorRows.get('禁書の一頁').node===row&&row.writes===writes&&node('deckEditList').children.every((n,i)=>n===rows[i]),'quantity changes preserve every row node and its markup');
check(window.scrollY===700,'quantity changes preserve scroll');
ctx.adjustDeckCard('禁書の一頁',1);ctx.adjustDeckCard('禁書の一頁',1);ctx.adjustDeckCard('禁書の一頁',1);
check(ctx.editorCounts['禁書の一頁']===4&&entry.plus.disabled,'four copy cap');
ctx.setEditorFilter('view','included');check(list().length===1&&list()[0]==='禁書の一頁','included view');
ctx.setEditorFilter('view','excluded');check(!list().includes('禁書の一頁'),'excluded view');
const excluded=ctx.editorRows.get(list()[0]);excluded.plus.onclick();
check(!list().includes(excluded.card.name)&&ctx.editorCounts[excluded.card.name]===1,'newly adopted row disappears only from excluded view');
ctx.setEditorFilter('view','all');ctx.setEditorFilter('type','スペル');ctx.setEditorFilter('set','C003');ctx.setEditorFilter('keyword','effect:draw');ctx.setEditorFilter('search','カード 1枚');
check(list().length===1&&list()[0]==='禁書の一頁','view, type, set, effect and text search combine');
ctx.setEditorFilter('search','存在しないカード');
check(list().length===0&&node('deckEditList').firstElementChild.textContent==='条件に合うカードがありません','no results state');
ctx.setEditorFilter('search','航路 1枚');check(list().length===0,'all query terms must match card name or effect');
ctx.setEditorFilter('search','');ctx.setEditorFilter('type','all');ctx.setEditorFilter('set','all');ctx.setEditorFilter('keyword','kw:潜水');
check(list().length>0&&list().includes('船喰らい'),'keyword derived from rules and printed text');
ctx.setEditorFilter('keyword','all');ctx.toggleEditorColor('白');
check(ctx.editorColors.length===2&&list().some(n=>ctx.cardTemplateByName(n).color==='白'),'two-colour pool');
ctx.toggleEditorColor('赤');check(ctx.editorColors.length===2&&node('deckEditorError').textContent,'third colour rejected');
ctx.adjustDeckCard('農民',1);ctx.toggleEditorColor('白');check(!ctx.editorCounts['農民']&&!list().includes('農民'),'deselected colour cards removed from draft');
ctx.toggleEditorColor('白');ctx.editorCounts={'禁書の一頁':4,'農民':2,'危険海域':1};ctx.renderDeckEditor();
check(node('deckUniqueCount').textContent==='3種類'&&node('deckAverageCost').textContent==='1.4','copy-weighted mean and distinct card count');
check(node('deckColorIcons').innerHTML.includes('5枚・71%')&&node('deckColorIcons').innerHTML.includes('2枚・29%'),'colour quantities and ratios');
check(node('deckTypeCounts').innerHTML.includes('ユニット<strong>2')&&node('deckTypeCounts').innerHTML.includes('スペル<strong>4')&&node('deckTypeCounts').innerHTML.includes('ランドマーク<strong>1'),'three type totals');
check(node('deckCostCurve').innerHTML.includes('costBarSegment blue')&&node('deckCostCurve').innerHTML.includes('costBarSegment white'),'colour-stacked cost curve');
let shown;ctx.showCardDetail=c=>shown=c;ctx.editorRows.get('禁書の一頁').node.querySelector('.deckEditInfo').onclick();
check(shown.name==='禁書の一頁','normal tap opens card detail');
ctx.editorCounts={};ctx.editorAvailableCards().slice(0,10).forEach(c=>ctx.editorCounts[c.name]=4);ctx.renderDeckEditor();
check(ctx.totalDeckCards(ctx.editorCounts)===40&&!node('deckSaveBtn').disabled,'forty cards can save');
check(Array.from(ctx.editorRows.values()).filter(e=>e.node.parent).every(e=>e.plus.disabled),'all plus buttons disabled at forty');
let untouched=ctx.editorAvailableCards()[11];ctx.adjustDeckCard(untouched.name,1);check(!ctx.editorCounts[untouched.name],'forty-card cap enforced in logic');
node('deckNameInput').value='検証デッキ';let libraryVisits=0;ctx.showDeckLibrary=()=>libraryVisits++;ctx.saveEditedDeck();
let saved=JSON.parse(storage.get('crossfort_decks_v1'))[0];
check(libraryVisits===1&&saved.name==='検証デッキ'&&saved.colors.length===2&&ctx.totalDeckCards(saved.cards)===40,'save uses the existing storage schema');
ctx.showDeckEditor(saved.id);check(ctx.editingDeckId===saved.id&&ctx.totalDeckCards(ctx.editorCounts)===40,'existing deck reopens without conversion');
ctx.adjustDeckCard(Object.keys(ctx.editorCounts)[0],-1);check(node('deckSaveBtn').disabled,'incomplete deck cannot save');
ctx.adjustDeckCard(Object.keys(ctx.editorCounts)[0],1);node('deckNameInput').value='更新';ctx.saveEditedDeck();
check(JSON.parse(storage.get('crossfort_decks_v1')).length===1&&ctx.savedDecks[0].name==='更新','editing replaces the same deck');
ctx.deleteSavedDeck(saved.id);check(JSON.parse(storage.get('crossfort_decks_v1')).length===0,'existing delete behaviour retained');
ctx.CARD_SETS.C004='第四弾 検証';ctx.CARD_IDS['将来カード']='C004-001';ctx.populateSetFilter('editorSetFilter','all');check(node('editorSetFilter').innerHTML.includes('第四弾 検証'),'future sets populated dynamically');
check(!/bookShelf|bookSpine|renderDeckBookShelf/.test(html),'shelf renderer and styles removed');
check(!html.slice(html.indexOf('<section id="deckEditorScreen">'),html.indexOf('<section id="catalogScreen">')).match(/長押し|スワイプ|スクロール|タップして|押すと/),'editor has no persistent operation guide');
check(html.includes('grid-template-columns:44px 24px 44px')&&html.includes('type="search"')&&html.includes('font-size:16px'),'touch targets and no-zoom field sizing');
console.log(checks+' deck editor regression checks passed');
