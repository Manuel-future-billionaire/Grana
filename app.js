'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='kalkulatorKantor.v8';
const LEGACY_STORES=['kalkulatorKantor.v7','kalkulatorKantor.v6','kalkulatorKantor.v5','kalkulatorKantor.v4','kalkulatorKantor.v3'];
const defaults={history:[],retention:14,precision:8,liveResult:true,thousandsSeparator:true,appearance:'system'};
let state=load(), expression='', lastResult=0, selectedId=null, dialogMode='note', cursorPos=0;

function load(){
  try{
    const current=localStorage.getItem(STORE);
    const legacy=LEGACY_STORES.map(k=>localStorage.getItem(k)).find(Boolean);
    const parsed=JSON.parse(current||legacy||'{}');
    return {...defaults,...parsed,history:Array.isArray(parsed.history)?parsed.history:[]};
  }catch{return {...defaults}}
}
function save(){localStorage.setItem(STORE,JSON.stringify(state))}

function applyAppearance(){
  const mode=state.appearance||'system';
  if(mode==='system')document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme',mode);
}

function id(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cleanOld(){if(!state.retention)return;const cutoff=Date.now()-state.retention*864e5;state.history=state.history.filter(x=>x.created>=cutoff);save()}
function normalize(s){return s.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replaceAll(',','.')}
function tokenize(s){const src=normalize(s);const out=[];let i=0;while(i<src.length){const c=src[i];if(/\s/.test(c)){i++;continue}if(/[0-9.]/.test(c)){let n=c;i++;while(i<src.length&&/[0-9.eE]/.test(src[i]))n+=src[i++];if(!Number.isFinite(Number(n)))throw Error('Nieprawidłowa liczba');out.push({t:'n',v:Number(n)});continue}if('+-*/()'.includes(c)){out.push({t:c,v:c});i++;continue}throw Error('Nieprawidłowy znak')}return out}
function evaluate(src){const ts=tokenize(src),vals=[],ops=[];const prec={'+':1,'-':1,'*':2,'/':2,'u-':3};const apply=()=>{const o=ops.pop();if(o==='u-'){if(!vals.length)throw Error('Błąd składni');vals.push(-vals.pop());return}const b=vals.pop(),a=vals.pop();if(a===undefined||b===undefined)throw Error('Błąd składni');if(o==='+')vals.push(a+b);else if(o==='-')vals.push(a-b);else if(o==='*')vals.push(a*b);else{if(b===0)throw Error('Dzielenie przez zero');vals.push(a/b)}};let prev='start';for(const x of ts){if(x.t==='n'){vals.push(x.v);prev='value';continue}if(x.t==='('){ops.push('(');prev='(';continue}if(x.t===')'){while(ops.length&&ops.at(-1)!=='(')apply();if(ops.pop()!=='(')throw Error('Brak nawiasu');prev='value';continue}let o=x.t;if(o==='-'&&(prev==='start'||prev==='('||prev==='op'))o='u-';while(ops.length&&ops.at(-1)!=='('&&prec[o]<=prec[ops.at(-1)])apply();ops.push(o);prev='op'}while(ops.length){if(ops.at(-1)==='(')throw Error('Brak nawiasu');apply()}if(vals.length!==1||!Number.isFinite(vals[0]))throw Error('Błąd obliczenia');return vals[0]}
function format(n){if(!Number.isFinite(n))return 'Błąd';const p=Number(state.precision);const s=Number(n.toPrecision(Math.min(15,p+5))).toLocaleString('pl-PL',{maximumFractionDigits:p,useGrouping:state.thousandsSeparator});return s==='-0'?'0':s}

const expressionInput=$('#expression');
function renderExpression(){
  expressionInput.textContent='';
  const text=expression||'0';
  if(!expression){const z=document.createElement('span');z.className='placeholder';z.textContent='0';expressionInput.append(z);return}
  for(let i=0;i<=expression.length;i++){
    if(i===cursorPos){const c=document.createElement('span');c.className='editor-caret';c.setAttribute('aria-hidden','true');expressionInput.append(c)}
    if(i<expression.length){const ch=document.createElement('span');ch.className='editor-char';ch.dataset.pos=String(i);ch.textContent=expression[i];expressionInput.append(ch)}
  }
  requestAnimationFrame(()=>expressionInput.querySelector('.editor-caret')?.scrollIntoView({block:'nearest',inline:'nearest'}));
}
function render(){renderExpression();let r='0';if(expression&&state.liveResult){try{r=format(evaluate(expression))}catch{r='…'}}else r=format(lastResult);$('#result').textContent=r;renderRecent()}
function insertText(text){const start=cursorPos;let token=text;if(token===','){const left=expression.slice(0,start);const tail=left.split(/[+−×÷()]/).at(-1);if(tail.includes(','))return;if(!tail||!(/\d$/.test(tail)))token='0,'}expression=expression.slice(0,start)+token+expression.slice(start);cursorPos=start+token.length;render()}
function backspace(){const start=cursorPos;if(start>0){expression=expression.slice(0,start-1)+expression.slice(start);cursorPos=start-1}render()}
function placeCursorFromPoint(clientX){
  if(!expression){cursorPos=0;render();return}
  const chars=[...expressionInput.querySelectorAll('.editor-char')];
  let best=expression.length,bestDist=Infinity;
  for(let i=0;i<chars.length;i++){const r=chars[i].getBoundingClientRect();const mid=r.left+r.width/2;const pos=clientX<mid?i:i+1;const edge=clientX<mid?r.left:r.right;const d=Math.abs(clientX-edge);if(d<bestDist){bestDist=d;best=pos}}
  cursorPos=Math.max(0,Math.min(best,expression.length));render();
}
function calculate(saveHistory=true){if(!expression)return;try{const original=expression,v=evaluate(expression);lastResult=v;if(saveHistory)addHistory(original,format(v));expression=format(v);cursorPos=expression.length;render()}catch(e){toast(e.message||'Nieprawidłowe działanie')}}
function addHistory(expr,res){const now=Date.now();state.history.unshift({id:id(),expression:extractExpression(expr),result:res,created:now,updated:now,comment:''});cleanOld();save();renderHistory();renderRecent()}
function toggleSign(){if(expression){expression=expression.startsWith('−')?expression.slice(1):`−${expression}`;cursorPos=expression.length}else{expression='−';cursorPos=1}render()}
async function pasteIntoCalculator(){try{let text=await navigator.clipboard.readText();text=text.trim();if(!text)throw 0;const firstLine=text.split(/\r?\n/)[0];const candidate=firstLine.includes('=')?firstLine.split('=')[0].trim():firstLine;evaluate(candidate);insertText(candidate);toast('Wklejono obliczenie')}catch{toast('Safari nie udostępniło schowka')}}
function pressAction(a){if(a==='clear'){expression='';lastResult=0;cursorPos=0;render()}else if(a==='backspace')backspace();else if(a==='equals')calculate();else if(a==='toggle-sign')toggleSign()}
function dateText(ms){return new Intl.DateTimeFormat('pl-PL',{dateStyle:'short',timeStyle:'medium'}).format(ms)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function extractExpression(value){
  let text=String(value??'').trim();
  if(!text)return '';
  text=text.split(/\r?\n/)[0].trim();
  if(text.includes('='))text=text.split('=')[0].trim();
  return text.replace(/\s+(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}).*$/,'').trim();
}
function renderRecent(){
  const box=$('#recentList');
  if(!box)return;
  const items=state.history.slice(0,3);
  if(!items.length){box.innerHTML='<div class="recent-empty">Brak ostatnich obliczeń</div>';return}
  box.innerHTML=items.map(x=>`<div class="recent-item" data-id="${esc(x.id)}"><span class="recent-expr">${esc(extractExpression(x.expression))}</span><span class="recent-result">= ${esc(x.result)}</span></div>`).join('');
  for(const el of box.querySelectorAll('.recent-item'))el.addEventListener('click',()=>useEntry(el.dataset.id));
}

function renderHistory(){const list=$('#historyList');list.innerHTML=state.history.length?'':'<div class="empty">Historia jest pusta</div>';for(const x of state.history){const clean=extractExpression(x.expression);const el=document.createElement('div');el.className='history-item';el.dataset.id=x.id;el.innerHTML=`<div class="expr">${esc(clean)}</div><div class="res">= ${esc(x.result)}</div>${x.comment?`<div class="comment">${esc(x.comment)}</div>`:''}<div class="meta"><span>${dateText(x.created)}</span></div>`;bindLongPress(el);el.addEventListener('dblclick',()=>useEntry(x.id));list.append(el)}renderRecent()}
function bindLongPress(el){let t,sx,sy;const stop=()=>{clearTimeout(t);t=null};el.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;t=setTimeout(()=>openMenu(el.dataset.id,e.clientX,e.clientY),520)});el.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>10)stop()});el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('contextmenu',e=>{e.preventDefault();openMenu(el.dataset.id,e.clientX,e.clientY)})}
function openMenu(entryId,x,y){selectedId=entryId;const m=$('#contextMenu');m.classList.remove('hidden');const w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';m.style.top=Math.max(8,Math.min(innerHeight-h-8,y-10))+'px';navigator.vibrate?.(20)}
function closeMenu(){$('#contextMenu').classList.add('hidden')}
function openDisplayMenu(x,y){const m=$('#displayMenu');m.classList.remove('hidden');const w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';m.style.top=Math.max(8,Math.min(innerHeight-h-8,y-10))+'px';navigator.vibrate?.(20)}
function closeDisplayMenu(){$('#displayMenu').classList.add('hidden')}
function bindDisplayLongPress(el){let t,sx,sy;const stop=()=>{clearTimeout(t);t=null};el.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;t=setTimeout(()=>openDisplayMenu(e.clientX,e.clientY),520)});el.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>10)stop()});el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('contextmenu',e=>{e.preventDefault();openDisplayMenu(e.clientX,e.clientY)})}
function entry(){return state.history.find(x=>x.id===selectedId)}
function useEntry(entryId){const x=state.history.find(e=>e.id===entryId);if(!x)return;const clean=extractExpression(x.expression);try{evaluate(clean)}catch{toast('Nie można użyć tego wpisu');return}expression=clean;lastResult=evaluate(clean);cursorPos=expression.length;closeDrawers();render();toast('Wstawiono samo działanie')}
async function menuAction(a){const x=entry();if(!x)return;if(a==='use')useEntry(x.id);else if(a==='copy'){await copy(`${x.expression} = ${x.result}\n${dateText(x.created)}${x.comment?'\nNotatka: '+x.comment:''}`)}else if(a==='note')showDialog('Notatka do obliczenia',x.comment,'note');else if(a==='edit')showDialog('Edytuj zapisane obliczenie',x.expression,'edit');else if(a==='delete'&&confirm('Usunąć ten wpis?')){state.history=state.history.filter(e=>e.id!==x.id);save();renderHistory();renderRecent()}closeMenu()}
function showDialog(title,text,mode){dialogMode=mode;$('#dialogTitle').textContent=title;$('#dialogText').value=text;$('#textDialog').showModal();setTimeout(()=>$('#dialogText').focus(),50)}
function saveDialog(){const x=entry();if(!x)return;const value=$('#dialogText').value.trim();if(dialogMode==='note')x.comment=value;else{try{x.expression=extractExpression(value);x.result=format(evaluate(x.expression))}catch{toast('Nieprawidłowe działanie');return}}x.updated=Date.now();save();renderHistory()}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Skopiowano do schowka')}catch{const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();toast('Skopiowano do schowka')}}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1800)}
function openDrawer(which){closeMenu();$('#drawerBackdrop').classList.remove('hidden');which.classList.add('open');which.setAttribute('aria-hidden','false');renderHistory()}
function closeDrawers(){for(const d of $$('.drawer')){d.classList.remove('open');d.setAttribute('aria-hidden','true')}$('#drawerBackdrop').classList.add('hidden')}

expressionInput.addEventListener('pointerdown',e=>{e.preventDefault();placeCursorFromPoint(e.clientX)});expressionInput.addEventListener('contextmenu',e=>e.preventDefault());

let deleteDelay=null,deleteRepeat=null,deleteRepeated=false;
function stopDeleteRepeat(){clearTimeout(deleteDelay);clearInterval(deleteRepeat);deleteDelay=deleteRepeat=null}
$('#keypad').addEventListener('pointerdown',e=>{
  const b=e.target.closest('button[data-action="backspace"]');if(!b)return;
  e.preventDefault();deleteRepeated=false;backspace();
  deleteDelay=setTimeout(()=>{deleteRepeated=true;deleteRepeat=setInterval(()=>{if(expression)backspace()},75)},360);
});
for(const ev of ['pointerup','pointercancel','pointerleave'])$('#keypad').addEventListener(ev,stopDeleteRepeat);
$('#keypad').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.action==='backspace')return;b.dataset.token?insertText(b.dataset.token):pressAction(b.dataset.action)});

$('#historyBtn').onclick=()=>openDrawer($('#historyDrawer'));$('#openFullHistory').onclick=()=>openDrawer($('#historyDrawer'));$('#settingsBtn').onclick=()=>openDrawer($('#settingsDrawer'));$('#closeHistory').onclick=closeDrawers;$('#closeSettings').onclick=closeDrawers;$('#drawerBackdrop').onclick=closeDrawers;
$('#contextMenu').onclick=e=>{const b=e.target.closest('button');if(b)menuAction(b.dataset.menu)};$('#displayMenu').onclick=e=>{const b=e.target.closest('button');if(b?.dataset.displayMenu==='paste'){pasteIntoCalculator();closeDisplayMenu()}};bindDisplayLongPress($('#result'));document.addEventListener('pointerdown',e=>{if(!e.target.closest('#contextMenu')&&!e.target.closest('.history-item'))closeMenu();if(!e.target.closest('#displayMenu')&&!e.target.closest('#result'))closeDisplayMenu()});
$('#dialogSave').onclick=saveDialog;$('#clearHistory').onclick=()=>{if(confirm('Usunąć całą historię?')){state.history=[];save();renderHistory();renderRecent()}};
$('#retention').value=state.retention;$('#precision').value=state.precision;$('#appearance').value=state.appearance;$('#liveResult').checked=state.liveResult;$('#thousandsSeparator').checked=state.thousandsSeparator;
$('#retention').onchange=e=>{state.retention=Number(e.target.value);cleanOld();renderHistory()};$('#appearance').onchange=e=>{state.appearance=e.target.value;save();applyAppearance()};$('#precision').onchange=e=>{state.precision=Number(e.target.value);save();render()};$('#liveResult').onchange=e=>{state.liveResult=e.target.checked;save();render()};$('#thousandsSeparator').onchange=e=>{state.thousandsSeparator=e.target.checked;save();render();renderHistory()};
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({version:8,exported:new Date().toISOString(),history:state.history},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kalkulator-kantor-historia.json';a.click();URL.revokeObjectURL(a.href)};
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{const obj=JSON.parse(await e.target.files[0].text());if(!Array.isArray(obj.history))throw 0;state.history=obj.history.map(x=>({...x,expression:extractExpression(x.expression),locked:undefined}));save();renderHistory();toast('Historia zaimportowana')}catch{toast('Nieprawidłowy plik')}};
document.addEventListener('keydown',e=>{if(document.activeElement===$('#dialogText'))return;if(/\d/.test(e.key))insertText(e.key);else if(e.key==='Enter'||e.key==='=')calculate();else if(e.key==='Backspace'){e.preventDefault();backspace()}else if(e.key==='Escape')pressAction('clear');else if(['+','-','*','/','.'].includes(e.key))insertText({'*':'×','/':'÷','-':'−','.':','}[e.key]||e.key)});
applyAppearance();cleanOld();render();renderHistory();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
