const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { system: null, history: JSON.parse(localStorage.getItem('winova-history') || '[]'), clipboardWatch: localStorage.getItem('clipboard-watch') !== 'false', lastClipboard: '' };
const pageNames = { dashboard: ['WORKSPACE','Overview'], clipboard: ['PRODUCTIVITY','Clipboard'], text: ['WRITING TOOLS','Text studio'], developer: ['DEVELOPER UTILITIES','Developer toolbox'], generate: ['CREATE LOCALLY','Smart generators'], utilities: ['EVERYDAY TOOLS','Utility lab'], network: ['CONNECTIVITY','Network tools'], quick: ['WINDOWS SHORTCUTS','Quick actions'], settings: ['PREFERENCES','Preferences'] };

function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = 'toast', 2400); }
function formatBytes(bytes) { if (!bytes) return '0 GB'; return `${(bytes / 1073741824).toFixed(1)} GB`; }
function formatFileSize(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`; if (bytes < 1073741824) return `${(bytes/1048576).toFixed(1)} MB`; return `${(bytes/1073741824).toFixed(2)} GB`; }
function formatUptime(seconds) { const d=Math.floor(seconds/86400), h=Math.floor((seconds%86400)/3600), m=Math.floor((seconds%3600)/60), s=Math.floor(seconds%60); return d ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`; }
function timeGreeting() { const h=new Date().getHours(); return h<12?'Good morning':h<18?'Good afternoon':'Good evening'; }
function goTo(page) { $$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${page}`)); $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); $('#page-kicker').textContent=pageNames[page][0]; $('#page-title').textContent=page==='dashboard'?timeGreeting():pageNames[page][1]; window.scrollTo({top:0,behavior:'smooth'}); }

async function refreshSystem() { try { const s=await window.winova.getSystemSnapshot(); state.system=s; const used=s.totalMemory-s.freeMemory, pct=Math.round(used/s.totalMemory*100), adapter=s.network.find(x=>!x.internal)||s.network[0]; $('#memory-value').textContent=`${pct}% used`; $('#memory-bar').style.width=`${pct}%`; $('#memory-detail').textContent=`${formatBytes(used)} of ${formatBytes(s.totalMemory)}`; $('#cpu-value').textContent=`${s.cores} logical cores`; $('#core-chip').textContent=`${s.cores} cores`; $('#arch-chip').textContent=s.arch; $('#cpu-detail').textContent=s.cpu; $('#uptime-value').textContent=formatUptime(s.uptime); $('#network-value').textContent=adapter?.address||'Offline'; $('#network-detail').textContent=adapter?.name||'No active adapter'; $('#device-name').textContent=s.hostname; $('#platform').textContent=s.platform; $('#user-name').textContent=s.user; $('#app-version').textContent=`v${s.appVersion}`; $('#sidebar-device').textContent=s.hostname; $('#avatar').textContent=s.user.slice(0,1).toUpperCase(); $('#last-updated').textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`; renderAdapters(s.network); } catch(e){toast('Could not read system information',true)} }
async function loadSystemDetails(){try{const d=await window.winova.getSystemDetails();$('#inventory-model').textContent=d.model||'Unknown model';$('#inventory-manufacturer').textContent=d.manufacturer||'Unknown manufacturer';$('#inventory-gpu').textContent=d.gpu||'Unknown graphics adapter';$('#inventory-vram').textContent=d.gpuMemory?`${formatBytes(d.gpuMemory)} graphics memory`:'Shared or unavailable memory';$('#inventory-windows').textContent=d.windows||'Windows';$('#inventory-build').textContent=`Build ${d.build||'unknown'} · installed ${d.installed?new Date(d.installed).toLocaleDateString():'unknown'}`;$('#inventory-bios').textContent=d.bios||'Unknown BIOS';$('#inventory-board').textContent=d.board||'Unknown mainboard';const disks=Array.isArray(d.disks)?d.disks:[];$('#drive-list').innerHTML=disks.length?disks.map(disk=>{const used=disk.size-disk.free,pct=disk.size?Math.round(used/disk.size*100):0;return `<div class="drive"><div class="drive-head"><strong>${escapeHtml(disk.name)} ${escapeHtml(disk.label||'Local disk')}</strong><span>${formatBytes(disk.free)} free of ${formatBytes(disk.size)}</span></div><div class="progress"><i style="width:${pct}%"></i></div></div>`}).join(''):'<div class="muted">No local drives were detected.</div>'}catch(e){$$('[id^="inventory-"]').forEach(x=>{if(x.textContent.includes('Loading')||x.textContent.includes('Detecting'))x.textContent='Unavailable'});$('#drive-list').innerHTML='<div class="muted">Detailed hardware information is unavailable.</div>'}}
function renderAdapters(items=[]) { $('#adapter-list').innerHTML=items.length?items.map(x=>`<div class="adapter"><strong>${escapeHtml(x.name)}${x.internal?' · Loopback':''}</strong><span>${escapeHtml(x.address)} · ${escapeHtml(x.mac)}</span></div>`).join(''):'<div class="empty-state">No IPv4 adapters found.</div>'; }
function escapeHtml(text=''){const d=document.createElement('div');d.textContent=text;return d.innerHTML}

function saveHistory(){localStorage.setItem('winova-history',JSON.stringify(state.history));renderHistory()}
function addClipboard(text){text=String(text||'').trim();if(!text||state.history[0]?.text===text)return;state.history=state.history.filter(x=>x.text!==text);state.history.unshift({text,time:Date.now()});state.history=state.history.slice(0,25);saveHistory()}
function renderHistory(){const list=$('#clipboard-list');list.innerHTML=state.history.length?state.history.map((x,i)=>`<div class="clipboard-item"><div class="clip-text">${escapeHtml(x.text)}</div><small>${new Date(x.time).toLocaleString()}</small><button data-copy-index="${i}">Copy</button><button data-delete-index="${i}">×</button></div>`).join(''):'<div class="empty-state"><strong>No clipboard items yet</strong><br><br>Copy some text or capture your current clipboard to get started.</div>'}
async function pollClipboard(){if(!state.clipboardWatch||document.hidden||!document.hasFocus())return;try{const text=await window.winova.readClipboard();if(text&&text!==state.lastClipboard){state.lastClipboard=text;addClipboard(text)}}catch{}}

function updateTextStats(){const text=$('#text-input').value, words=text.trim()?text.trim().split(/\s+/):[], sentences=text.trim()?text.split(/[.!?]+/).filter(x=>x.trim()).length:0, lines=text?text.split(/\n/).length:0;$('#char-count').textContent=text.length;$('#word-count').textContent=words.length;$('#sentence-count').textContent=sentences;$('#line-count').textContent=lines;$('#byte-count').textContent=new TextEncoder().encode(text).length;$('#longest-word').textContent=words.sort((a,b)=>b.length-a.length)[0]?.slice(0,18)||'—';const secs=Math.ceil(words.length/238*60);$('#read-time').textContent=secs<60?`${secs} sec`:`${Math.ceil(secs/60)} min`}

$$('[data-page]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.page)));$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.goto)));$('#refresh-btn').addEventListener('click',()=>{refreshSystem();toast('System information refreshed')});
$('#capture-clipboard').addEventListener('click',async()=>{addClipboard(await window.winova.readClipboard());toast('Clipboard captured')});$('#clear-history').addEventListener('click',()=>{state.history=[];saveHistory();toast('Clipboard history cleared')});$('#clipboard-list').addEventListener('click',async e=>{const copy=e.target.dataset.copyIndex,del=e.target.dataset.deleteIndex;if(copy!==undefined){await window.winova.writeClipboard(state.history[+copy].text);toast('Copied to clipboard')}if(del!==undefined){state.history.splice(+del,1);saveHistory()}});
$('#text-input').addEventListener('input',updateTextStats);$$('.text-action').forEach(b=>b.addEventListener('click',()=>{let text=$('#text-input').value;const actions={upper:()=>text.toUpperCase(),lower:()=>text.toLowerCase(),title:()=>text.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()),trim:()=>text.split('\n').map(x=>x.trim().replace(/\s+/g,' ')).join('\n').trim(),sort:()=>text.split('\n').sort((a,b)=>a.localeCompare(b)).join('\n'),unique:()=>[...new Set(text.split('\n'))].join('\n')};$('#text-input').value=actions[b.dataset.action]();updateTextStats()}));
$$('[data-tooltab]').forEach(b=>b.addEventListener('click',()=>{$$('[data-tooltab]').forEach(x=>x.classList.toggle('active',x===b));$$('.dev-panel').forEach(x=>x.classList.toggle('active',x.id===`tooltab-${b.dataset.tooltab}`))}));
function transformJson(compact=false){try{const parsed=JSON.parse($('#json-input').value);$('#json-input').value=JSON.stringify(parsed,null,compact?0:2);$('#json-status').textContent='✓ Valid JSON';$('#json-status').className='validation good';toast(compact?'JSON minified':'JSON formatted')}catch(e){$('#json-status').textContent=`Invalid: ${e.message}`;$('#json-status').className='validation bad';toast('Invalid JSON',true)}}
$('#json-format').addEventListener('click',()=>transformJson(false));$('#json-minify').addEventListener('click',()=>transformJson(true));$('#json-copy').addEventListener('click',()=>{window.winova.writeClipboard($('#json-input').value);toast('JSON copied')});
$('#base64-encode').addEventListener('click',()=>{try{$('#base64-input').value=btoa(unescape(encodeURIComponent($('#base64-input').value)));toast('Text encoded')}catch{toast('Could not encode value',true)}});$('#base64-decode').addEventListener('click',()=>{try{$('#base64-input').value=decodeURIComponent(escape(atob($('#base64-input').value.trim())));toast('Base64 decoded')}catch{toast('That is not valid Base64',true)}});$('#base64-copy').addEventListener('click',()=>{window.winova.writeClipboard($('#base64-input').value);toast('Result copied')});
$('#hash-generate').addEventListener('click',async()=>{try{$('#hash-output').textContent=await window.winova.hash($('#hash-input').value,$('#hash-algorithm').value);toast('Hash generated')}catch(e){toast(e.message,true)}});
$('#dns-lookup').addEventListener('click',async()=>{const box=$('#dns-result');box.textContent='Resolving…';try{const r=await window.winova.lookup($('#dns-host').value);box.textContent=`${r.host}\n${r.addresses.map(x=>`${x.family}: ${x.address}`).join('\n')}\n\nResolved in ${r.elapsed} ms`}catch(e){box.textContent=`Lookup failed: ${e.message}`}});$('#dns-host').addEventListener('keydown',e=>{if(e.key==='Enter')$('#dns-lookup').click()});
$$('[data-win-action]').forEach(b=>b.addEventListener('click',async()=>{try{await window.winova.windowsAction(b.dataset.winAction);toast('Opened successfully')}catch(e){toast(`Could not open: ${e.message}`,true)}}));
$('#clipboard-toggle').addEventListener('change',e=>{state.clipboardWatch=e.target.checked;localStorage.setItem('clipboard-watch',String(e.target.checked))});

function setUpdateState(status){
  const title=$('#update-title'),message=$('#update-message'),progress=$('#update-progress'),check=$('#update-check'),download=$('#update-download'),install=$('#update-install'),notes=$('#update-notes'),notesContent=$('#update-notes-content');
  check.classList.remove('hidden');download.classList.add('hidden');install.classList.add('hidden');notes.classList.add('hidden');progress.textContent='';check.disabled=false;
  if(status.status==='checking'){title.textContent='Checking for updates…';message.textContent='Contacting the Winova release service.';check.disabled=true}
  if(status.status==='current'){title.textContent='Winova Toolkit is up to date';message.textContent=`You have the latest version (${status.version}).`}
  if(status.status==='available'){title.textContent=`Version ${status.version} is available`;message.textContent='A newer Winova Toolkit release is ready to download.';notesContent.textContent=status.releaseNotes||'Release notes are unavailable.';notes.classList.remove('hidden');download.classList.remove('hidden');check.classList.add('hidden')}
  if(status.status==='downloading'){title.textContent='Downloading update…';message.textContent='You can continue using Winova while it downloads.';progress.textContent=`${status.percent||0}%`;check.classList.add('hidden')}
  if(status.status==='downloaded'){title.textContent=`Version ${status.version} is ready`;message.textContent='Restart Winova to finish installing the update.';install.classList.remove('hidden');check.classList.add('hidden')}
  if(status.status==='error'){title.textContent='Could not check for updates';message.textContent=status.message||'The release service could not be reached.'}
}
window.winova.onUpdateStatus(setUpdateState);
$('#update-check').addEventListener('click',async()=>{setUpdateState({status:'checking'});try{const result=await window.winova.checkForUpdates();if(result.development)setUpdateState({status:'current',version:`${result.version} development build`})}catch(e){setUpdateState({status:'error',message:e.message})}});
$('#update-download').addEventListener('click',async()=>{try{await window.winova.downloadUpdate()}catch(e){setUpdateState({status:'error',message:e.message})}});
$('#update-install').addEventListener('click',()=>window.winova.installUpdate());

function secureRandom(max) { const values=new Uint32Array(1); crypto.getRandomValues(values); return values[0] % max; }
function generatePassword() {
  const lower='abcdefghijkmnopqrstuvwxyz', upper='ABCDEFGHJKLMNPQRSTUVWXYZ', numbers='23456789', symbols='!@#$%^&*_-+=?';
  let alphabet=lower, required=[lower[secureRandom(lower.length)]];
  if($('#password-upper').checked){alphabet+=upper;required.push(upper[secureRandom(upper.length)])}
  if($('#password-numbers').checked){alphabet+=numbers;required.push(numbers[secureRandom(numbers.length)])}
  if($('#password-symbols').checked){alphabet+=symbols;required.push(symbols[secureRandom(symbols.length)])}
  const length=Number($('#password-length').value);const chars=[...required];
  while(chars.length<length)chars.push(alphabet[secureRandom(alphabet.length)]);
  for(let i=chars.length-1;i>0;i--){const j=secureRandom(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
  $('#password-output').textContent=chars.join('');
}
$('#password-length').addEventListener('input',e=>$('#password-length-value').textContent=e.target.value);
$('#generate-password').addEventListener('click',()=>{generatePassword();toast('Secure password generated')});
$('#generate-uuid').addEventListener('click',()=>{$('#uuid-output').textContent=crypto.randomUUID();toast('UUID generated')});
$$('[data-copy-target]').forEach(b=>b.addEventListener('click',async()=>{const value=$(`#${b.dataset.copyTarget}`).textContent;if(value.startsWith('Click'))return;await window.winova.writeClipboard(value);toast('Copied to clipboard')}));
function updateUnixTime(){if(!document.hidden)$('#unix-now').textContent=Math.floor(Date.now()/1000)}
$('#convert-timestamp').addEventListener('click',()=>{const value=$('#timestamp-input').value.trim();let date;if(/^\d{10,13}$/.test(value)){const numeric=Number(value);date=new Date(value.length===10?numeric*1000:numeric)}else{date=new Date(value)}$('#timestamp-result').textContent=Number.isNaN(date.getTime())?'Could not understand that date or timestamp.':`${date.toLocaleString()}\n${date.toISOString()}\nUnix: ${Math.floor(date.getTime()/1000)}`});

$('#choose-checksum-file').addEventListener('click',async()=>{const box=$('#checksum-result');box.innerHTML='<span>Calculating checksum…</span>';try{const result=await window.winova.checksumFile($('#checksum-algorithm').value);if(!result){box.innerHTML='<span>No file selected</span>';return}box.innerHTML=`<div><strong>${escapeHtml(result.name)}</strong><small>${formatFileSize(result.size)} · ${result.algorithm.toUpperCase()}</small></div><code>${escapeHtml(result.digest)}</code><button id="copy-checksum">Copy</button>`;$('#copy-checksum').addEventListener('click',async()=>{await window.winova.writeClipboard(result.digest);toast('Checksum copied')})}catch(e){box.innerHTML=`<span>Could not inspect file: ${escapeHtml(e.message)}</span>`}});

const unitSets={data:{units:['B','KB','MB','GB','TB'],toBase:{B:1,KB:1024,MB:1048576,GB:1073741824,TB:1099511627776}},length:{units:['mm','cm','m','km','in','ft','mi'],toBase:{mm:.001,cm:.01,m:1,km:1000,in:.0254,ft:.3048,mi:1609.344}},temperature:{units:['°C','°F','K']}};
function rebuildUnits(){const category=$('#convert-category').value,set=unitSets[category],options=set.units.map(x=>`<option value="${x}">${x}</option>`).join('');$('#convert-from-unit').innerHTML=options;$('#convert-to-unit').innerHTML=options;$('#convert-to-unit').selectedIndex=1;convertUnits()}
function convertUnits(){const category=$('#convert-category').value,value=Number($('#convert-from-value').value),from=$('#convert-from-unit').value,to=$('#convert-to-unit').value;if(!Number.isFinite(value)){$('#convert-to-value').value='';return}let result;if(category==='temperature'){const c=from==='°C'?value:from==='°F'?(value-32)*5/9:value-273.15;result=to==='°C'?c:to==='°F'?c*9/5+32:c+273.15}else{const set=unitSets[category];result=value*set.toBase[from]/set.toBase[to]}$('#convert-to-value').value=Number(result.toPrecision(10)).toString()}
$('#convert-category').addEventListener('change',rebuildUnits);$('#convert-from-value').addEventListener('input',convertUnits);$('#convert-from-unit').addEventListener('change',convertUnits);$('#convert-to-unit').addEventListener('change',convertUnits);rebuildUnits();

const clock={mode:'stopwatch',running:false,startedAt:0,elapsed:0,remaining:0,interval:null};
function renderClock(ms){const safe=Math.max(0,ms),h=Math.floor(safe/3600000),m=Math.floor(safe%3600000/60000),s=Math.floor(safe%60000/1000),t=Math.floor(safe%1000/100);$('#clock-display').textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${t}`}
function stopClock(){clock.running=false;clearInterval(clock.interval);clock.interval=null;$('#clock-start').textContent='Start'}
function tickClock(){const passed=Date.now()-clock.startedAt;if(clock.mode==='stopwatch'){clock.elapsed+=passed;clock.startedAt=Date.now();renderClock(clock.elapsed)}else{clock.remaining-=passed;clock.startedAt=Date.now();renderClock(clock.remaining);if(clock.remaining<=0){stopClock();renderClock(0);toast('Timer complete')}}}
$$('[data-clock-mode]').forEach(b=>b.addEventListener('click',()=>{stopClock();clock.mode=b.dataset.clockMode;clock.elapsed=0;clock.remaining=Number($('#timer-minutes').value)*60000;$$('[data-clock-mode]').forEach(x=>x.classList.toggle('active',x===b));$('#timer-setup').classList.toggle('hidden',clock.mode!=='timer');renderClock(clock.mode==='timer'?clock.remaining:0)}));
$('#clock-start').addEventListener('click',()=>{if(clock.running){tickClock();stopClock();return}if(clock.mode==='timer'&&clock.remaining<=0)clock.remaining=Number($('#timer-minutes').value)*60000;clock.running=true;clock.startedAt=Date.now();$('#clock-start').textContent='Pause';clock.interval=setInterval(tickClock,100)});$('#clock-reset').addEventListener('click',()=>{stopClock();clock.elapsed=0;clock.remaining=Number($('#timer-minutes').value)*60000;renderClock(clock.mode==='timer'?clock.remaining:0)});$('#timer-minutes').addEventListener('input',()=>{if(!clock.running){clock.remaining=Number($('#timer-minutes').value)*60000;renderClock(clock.remaining)}});

const commands = [
  { icon:'⌂', title:'Overview', detail:'System status and device details', page:'dashboard', group:'Page' },
  { icon:'▣', title:'Clipboard history', detail:'View and reuse recent clipboard text', page:'clipboard', group:'Tool' },
  { icon:'¶', title:'Text studio', detail:'Transform and analyze text', page:'text', group:'Tool' },
  { icon:'{ }', title:'JSON formatter', detail:'Format, validate, and minify JSON', page:'developer', group:'Tool' },
  { icon:'✦', title:'Smart generators', detail:'Passwords, UUIDs, and timestamps', page:'generate', group:'Tool' },
  { icon:'◈', title:'Utility lab', detail:'Checksums, unit conversion, and timer', page:'utilities', group:'Tool' },
  { icon:'◎', title:'DNS lookup', detail:'Resolve a domain name', page:'network', group:'Tool' },
  { icon:'⚡', title:'Quick actions', detail:'Open useful Windows locations', page:'quick', group:'Page' },
  { icon:'⚙', title:'Windows Settings', detail:'Open system settings', action:'settings', group:'Action' },
  { icon:'▥', title:'Task Manager', detail:'Inspect running processes', action:'taskmgr', group:'Action' },
  { icon:'⊞', title:'Control Panel', detail:'Open classic Windows controls', action:'control', group:'Action' },
  { icon:'↓', title:'Downloads folder', detail:'Open your Downloads folder', action:'downloads', group:'Action' },
  { icon:'♲', title:'Recycle Bin', detail:'Review recently deleted files', action:'recycle', group:'Action' },
  { icon:'⚙', title:'Preferences', detail:'Appearance and clipboard settings', page:'settings', group:'Page' }
];
let commandSelection = 0;
let filteredCommands = commands;
function renderCommands(query='') {
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  filteredCommands=commands.filter(c=>words.every(w=>`${c.title} ${c.detail} ${c.group}`.toLowerCase().includes(w)));
  commandSelection=Math.min(commandSelection,Math.max(0,filteredCommands.length-1));
  $('#command-results').innerHTML=filteredCommands.length?filteredCommands.map((c,i)=>`<button class="command-item${i===commandSelection?' selected':''}" data-command-index="${i}"><i>${escapeHtml(c.icon)}</i><div><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(c.detail)}</small></div><b>${c.group}</b></button>`).join(''):'<div class="command-empty">No matching tools found.</div>';
  $('.command-item.selected')?.scrollIntoView({block:'nearest'});
}
function openCommands(){commandSelection=0;$('#command-backdrop').classList.add('open');$('#command-search').value='';renderCommands();setTimeout(()=>$('#command-search').focus(),0)}
function closeCommands(){ $('#command-backdrop').classList.remove('open'); }
async function runCommand(command){if(!command)return;closeCommands();if(command.page){goTo(command.page);return}try{await window.winova.windowsAction(command.action);toast(`${command.title} opened`)}catch(e){toast(`Could not open ${command.title}`,true)}}
$('#search-trigger').addEventListener('click',openCommands);
$('#command-search').addEventListener('input',e=>{commandSelection=0;renderCommands(e.target.value)});
$('#command-results').addEventListener('click',e=>{const item=e.target.closest('[data-command-index]');if(item)runCommand(filteredCommands[+item.dataset.commandIndex])});
$('#command-backdrop').addEventListener('mousedown',e=>{if(e.target===e.currentTarget)closeCommands()});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#command-backdrop').classList.contains('open')?closeCommands():openCommands();return}
  if(!$('#command-backdrop').classList.contains('open'))return;
  if(e.key==='Escape'){closeCommands();return}
  if(e.key==='ArrowDown'){e.preventDefault();commandSelection=Math.min(commandSelection+1,filteredCommands.length-1);renderCommands($('#command-search').value)}
  if(e.key==='ArrowUp'){e.preventDefault();commandSelection=Math.max(commandSelection-1,0);renderCommands($('#command-search').value)}
  if(e.key==='Enter'){e.preventDefault();runCommand(filteredCommands[commandSelection])}
});

document.body.classList.remove('light');localStorage.removeItem('theme');$('#clipboard-toggle').checked=state.clipboardWatch;renderHistory();updateTextStats();updateUnixTime();refreshSystem();loadSystemDetails();pollClipboard();
setInterval(()=>{if(!document.hidden&&$('#page-dashboard').classList.contains('active'))refreshSystem()},45000);
setInterval(pollClipboard,3000);
setInterval(updateUnixTime,1000);
setInterval(()=>{if(state.system){state.system.uptime+=1;$('#uptime-value').textContent=formatUptime(state.system.uptime)}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){pollClipboard();updateUnixTime()}});
