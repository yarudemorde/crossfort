const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'parchment.css'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const nodes=new Map();
function node(id){
  if(!nodes.has(id))nodes.set(id,{style:{display:'block',setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},children:[],innerHTML:'',textContent:'',disabled:false,appendChild(child){this.children.push(child)},remove(){},setAttribute(){},getAttribute(){return null},querySelector(){return node(id+'-card')},querySelectorAll(){return []}});
  return nodes.get(id);
}
const document={getElementById:node,documentElement:node('html'),body:node('body'),querySelector(){return null},querySelectorAll(){return []},createElement(){return node('created-'+Math.random())}};
const ctx=vm.createContext({document,window:{addEventListener(){},scrollTo(){},alert(){}},console,localStorage:{getItem(){return null},setItem(){}},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},TextEncoder,TextDecoder,btoa,atob});
vm.runInContext(fs.readFileSync(path.join(dir,'data/cards.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(dir,'data/card-rules.js'),'utf8'),ctx);
vm.runInContext(script.slice(0,script.lastIndexOf('// Fit names to each existing card width')),ctx);
function run(code){return vm.runInContext(code,ctx)}
function card(name){return run(`(function(){var t=cardTemplateByName(${JSON.stringify(name)});return cloneCard(t.row,t.color)})()`)}
run("state={playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null)}");

let checks=0;
function check(value,message){assert.ok(value,message);checks++}
const iconCases=[
  ['クロスフォート兵','guard','守護','M12 2 21 6'],
  ['毒牙の蜥蜴','lethal','殺傷','M6 17C0 10'],
  ['帝国の騎馬隊','pierce','貫通','M3 21 21 3'],
  ['帝国の突撃兵','haste','猛襲','m14 2-10 12'],
  ['クロスフォートの城壁','cannotAttack','攻撃不可','circle cx="12"']
];
for(const [name,className,label,pathFragment] of iconCases){
  const badges=ctx.keywordBadges(card(name),'player');
  check(badges.includes(`keywordIcon ${className}`)&&badges.includes(`aria-label="${label}"`)&&badges.includes(pathFragment),`${label} uses the restored HTML/SVG icon`);
}
ctx.CARD_RULES['防衛不可検証']={keywords:['unblockable']};
check(ctx.keywordBadges({name:'防衛不可検証',type:'ユニット',power:1,text:'',color:'黒'},'player').includes('keywordIcon unblockable'),'unblockable uses the restored HTML/SVG icon');
ctx.CARD_RULES['三種キーワード検証']={keywords:['guard','lethal','haste']};
const comboBadges=ctx.keywordBadges({name:'三種キーワード検証',type:'ユニット',power:2,text:'',color:'黒'},'player');
check((comboBadges.match(/<span class="keywordIcon/g)||[]).length===3,'three keyword icons coexist in one restored row');
check((comboBadges.match(/<svg/g)||[]).length===3,'each restored keyword has one inline SVG');
check(!ctx.keywordBadges({name:'通常ユニット',type:'ユニット',power:1,text:'',color:'白'},'player'),'cards without icon keywords add no empty row');

const textKeywords=['守護','殺傷','猛襲','貫通','潜水：2','魂響','報復：3','探査：4','発見','信仰：2','攻撃不可'];
for(const keyword of textKeywords) check(ctx.formatCardText(`■ ${keyword}`).includes('keywordText'),`${keyword} remains highlighted in card text`);
const badgeSource=html.slice(html.indexOf('function keywordBadges'),html.indexOf('function formatCardText'));
check(!badgeSource.includes('<img')&&!badgeSource.includes('assets/icons/keywords'),'AI-generated PNG assets are not referenced by keyword rendering');
check(!/battlefieldKeywordEffects|animateKeywordEffect|animatePlacement|keywordAura|keywordMoment|keywordFx/.test(html+css),'keyword effects remain disabled');
check(/\.keywordIcon\{[^}]*border:1px solid #ead5b5[^}]*border-radius:5px[^}]*box-shadow:0 2px 6px #0009/.test(html),'original icon frame, radius, and shadow are restored');
check(/\.keywordIcon\.guard\{background:#36536c\}/.test(html)&&/\.keywordIcon\.lethal\{background:#6b2830\}/.test(html)&&/\.keywordIcon\.pierce\{background:#674f24\}/.test(html)&&/\.keywordIcon\.haste\{background:#793e24\}/.test(html),'original keyword colors are restored');
check(/\.keywordIcon svg\{width:14px;height:14px[^}]*stroke-width:1\.8/.test(css),'original SVG size and line width are restored');
check(/#gameScreen \.card \.keywordIcon\{width:15px;height:15px;flex-basis:15px\}/.test(css),'mobile battlefield icons retain the current compact 15px fit');
const boardSource=html.slice(html.indexOf('function renderBoard'),html.indexOf('function renderLandmarks'));
const handSource=html.slice(html.indexOf('function renderHand'),html.indexOf("window.addEventListener('resize'"));
const catalogSource=html.slice(html.indexOf('function renderCatalog'),html.indexOf('function showComingSoon'));
const detailSource=html.slice(html.indexOf('function showCardDetail'),html.indexOf('function hideCardDetail'));
check(boardSource.includes('keywordBadges(u,side)'),'battlefield cards use the restored icon renderer');
check(!handSource.includes('keywordBadges')&&!catalogSource.includes('keywordBadges')&&!detailSource.includes('keywordBadges'),'hand, catalog, deck editor, and enlarged detail preserve their existing text-only presentation');
check(html.includes('parchment.css?v=14'),'clients receive the restored icon stylesheet without stale cache reuse');
check(!/(炎上|burning\.png|burn-icon)/.test(html+css),'unimplemented third-set keywords were not added');
console.log(`${checks} restored HTML/CSS keyword-icon assertions passed`);
