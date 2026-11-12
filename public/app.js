const $=s=>document.querySelector(s);const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e};
let me=null,socket=null,match=null,activeId=null,deadline=0,tick=null,answered=false,lastIndex=-1;
const show=(id)=>{['loginView','passwordView','adminView','studentView','gameView'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id))};
function notify(message){const n=$('#notice');n.textContent=message;n.style.display='block';clearTimeout(notify.t);notify.t=setTimeout(()=>n.style.display='none',4000)}
async function api(path,opts={}){const r=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Request failed');return data}
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)});
const patch=(path,data)=>api(path,{method:'PATCH',body:JSON.stringify(data)});
const values=form=>Object.fromEntries(new FormData(form).entries());
function table(container,headers,rows){const wrap=el('div');wrap.className='tablewrap';const t=el('table'),head=el('tr');headers.forEach(h=>head.append(el('th',h)));t.append(head);rows.forEach(row=>{const tr=el('tr');row.forEach(cell=>{const td=el('td');if(cell instanceof Node)td.append(cell);else td.textContent=String(cell??'');tr.append(td)});t.append(tr)});container.replaceChildren(wrap);wrap.append(t)}
async function loginView(){if(!me){show('loginView');$('#logout').hidden=true;$('#identity').textContent='';return}$('#identity').textContent=me.full_name+' ('+me.student_id+')';$('#logout').hidden=false;
 if(me.must_change_password){show('passwordView');return}
 if(me.role==='admin'){show('adminView');await loadAdmin()}else{show('studentView');await loadStudent()}
 if(!socket)setupSocket();
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{const d=await post('/login',values(e.target));me=d.user;await loginView()}catch(err){notify(err.message)}};
$('#passwordForm').onsubmit=async e=>{e.preventDefault();try{await post('/change-password',values(e.target));me.must_change_password=false;e.target.reset();await loginView();notify('Password changed')}catch(err){notify(err.message)}};
$('#logout').onclick=async()=>{try{await post('/logout',{});}catch{}socket?.disconnect();socket=null;me=null;activeId=null;clearInterval(tick);await loginView()};
function setupSocket(){socket=io();socket.on('connect',()=>{if(activeId)socket.emit('match:join',{matchId:activeId})});socket.on('matches:changed',()=>{if(me?.role==='student')loadStudent().catch(console.error)});
 socket.on('match:state',m=>{if(activeId===m.id){match=m;renderPlayers();if(m.status==='finished'){finishUI(m)}else if(m.status==='cancelled'){$('#gameNotice').textContent='Match cancelled.'}}});
 socket.on('match:countdown',d=>{if(activeId===null)return;$('#choices').replaceChildren();$('#roundLabel').textContent='GET READY';$('#questionText').textContent='Battle starting…';clearInterval(tick);const update=()=>{$('#countdown').textContent=Math.max(0,Math.ceil((d.startsAt-Date.now())/1000))};update();tick=setInterval(update,100)});
 socket.on('match:question',d=>{if(activeId===null)return;if(d.index<lastIndex)return;lastIndex=d.index;deadline=d.deadline;answered=false;$('#gameNotice').textContent='Choose one answer before time runs out.';$('#roundLabel').textContent=`Question ${d.index+1} of ${match?.question_count||'?' } • ${d.question.topic}`;$('#questionText').textContent=d.question.question;
 const choices=$('#choices');choices.replaceChildren();['A','B','C','D'].forEach(letter=>{const btn=el('button',letter+'. '+d.question['option_'+letter.toLowerCase()]);btn.onclick=()=>{if(answered||Date.now()>deadline)return;answered=true;btn.classList.add('selected');[...choices.children].forEach(b=>b.disabled=true);socket.emit('match:answer',{matchId:activeId,index:d.index,answer:letter});$('#gameNotice').textContent='Answer submitted. Waiting for result…'};choices.append(btn)});clearInterval(tick);tick=setInterval(()=>{const s=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('#countdown').textContent=s;if(s===0){[...choices.children].forEach(b=>b.disabled=true);if(!answered)$('#gameNotice').textContent='Time is up!'}},100)});
 socket.on('match:answer-result',r=>{$('#gameNotice').textContent=r.correct?`Correct! +${r.points} points`:'Incorrect. +0 points'});
 socket.on('match:round-ended',()=>{$('#gameNotice').textContent='Next question loading…'});
 socket.on('match:finished',m=>{if(activeId===m.id){match=m;finishUI(m)}});
 socket.on('game:error',notify);
}
function renderPlayers(){if(!match)return;const p=$('#gamePlayers');p.replaceChildren();match.players.forEach(player=>{const box=el('div');box.className='player';box.append(el('div',player.full_name),el('small',player.student_id),el('strong',player.score));p.append(box)})}
function finishUI(m){clearInterval(tick);$('#countdown').textContent='0';$('#choices').replaceChildren();$('#roundLabel').textContent='MATCH COMPLETE';$('#questionText').textContent=m.winner_id===null?'DRAW!':(m.players.find(p=>p.id===m.winner_id)?.full_name||'Player')+' WINS!';$('#gameNotice').textContent=m.players.map(p=>p.full_name+': '+p.score+' points').join(' | ')}
async function openMatch(id){activeId=Number(id);lastIndex=-1;answered=false;match=await api('/matches/'+id);show('gameView');$('#gameTitle').textContent='Battle #'+id;$('#questionText').textContent=match.status==='waiting'?'Waiting for instructor to start…':'Connecting to match…';$('#roundLabel').textContent='';$('#choices').replaceChildren();$('#gameNotice').textContent='';$('#countdown').textContent='--';renderPlayers();if(match.status==='finished')finishUI(match);socket?.emit('match:join',{matchId:activeId})}
$('#backBtn').onclick=async()=>{activeId=null;clearInterval(tick);await loginView()};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{const tab=b.dataset.tab;['students','questions','matches','reports'].forEach(x=>$('#'+x+'Tab').classList.toggle('hidden',x!==tab));if(tab==='reports')loadLeaderboard('#leaderboard')};
async function loadAdmin(){await Promise.all([loadStudents(),loadQuestions(),loadMatches(),loadLeaderboard('#leaderboard')])}
let studentCache=[];
async function loadStudents(){studentCache=await api('/students');for(const sel of [$('#player1'),$('#player2')]){sel.replaceChildren();sel.append(el('option','Select student'));sel.firstChild.value='';studentCache.filter(u=>u.active).forEach(u=>{const op=el('option',u.full_name+' ('+u.student_id+')');op.value=u.id;sel.append(op)})}
 const section=$('#studentSectionFilter'),current=section.value;section.replaceChildren();const all=el('option','All sections');all.value='';section.append(all);[...new Set(studentCache.map(u=>u.section).filter(Boolean))].sort().forEach(v=>{const o=el('option',v);o.value=v;section.append(o)});section.value=current;renderStudents();updateAutoSections();}
function renderStudents(){const query=$('#studentSearch').value.trim().toLowerCase(),section=$('#studentSectionFilter').value,status=$('#studentStatusFilter').value;
 const users=studentCache.filter(u=>(!query||[u.student_id,u.full_name].some(v=>v.toLowerCase().includes(query)))&&(!section||u.section===section)&&(!status||(status==='active'?!!u.active:!u.active)));
 $('#studentStats').textContent=`Showing ${users.length} of ${studentCache.length} students`;
 const rows=users.map(u=>{const actions=el('div');actions.className='inline';const toggle=el('button',u.active?'Deactivate':'Activate');toggle.className=u.active?'danger':'secondary';toggle.onclick=async()=>{try{await patch('/students/'+u.id,{active:!u.active});await loadStudents()}catch(e){notify(e.message)}};const reset=el('button','Reset password');reset.className='secondary';reset.onclick=async()=>{const password=prompt('New temporary password (10+ characters) for '+u.student_id);if(password===null)return;try{await post('/students/'+u.id+'/reset',{password});notify('Password reset')}catch(e){notify(e.message)}};actions.append(toggle,reset);return [u.student_id,u.full_name,u.section,u.active?'Active':'Inactive',actions]});table($('#studentList'),['Student ID','Name','Section','Status','Actions'],rows)}
for(const id of ['#studentSearch','#studentSectionFilter','#studentStatusFilter'])$(id).addEventListener(id==='#studentSearch'?'input':'change',renderStudents);
function csvEscape(value){const v=String(value??'');return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function downloadStudentCredentials(records){const headers=['student_id','full_name','section','temporary_password'];const csv=[headers.join(','),...records.map(u=>headers.map(h=>csvEscape(u[h])).join(','))].join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='jdbc-arena-new-student-credentials.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
$('#importStudents').onclick=async()=>{const file=$('#studentCsv').files[0];if(!file)return notify('Choose a student CSV first');if(file.size>100000)return notify('CSV must be smaller than 100 KB');try{
 const rows=parseCsv(await file.text());if(rows.length<2)throw Error('CSV needs a header and at least one student');const headers=rows.shift().map(h=>h.trim().toLowerCase());const required=['student_id','full_name','section'];if(headers.length!==3||required.some(h=>!headers.includes(h)))throw Error('CSV headers must be student_id,full_name,section');if(rows.length>100)throw Error('Maximum 100 students per import');
 const students=rows.map((r,i)=>{if(r.length!==3)throw Error('Wrong number of columns in CSV row '+(i+2));return Object.fromEntries(required.map(h=>[h,r[headers.indexOf(h)].trim()]))});
 if(!confirm('Import '+students.length+' student records? Existing IDs will be skipped.'))return;
 const result=await post('/students/import',{students});$('#studentCsv').value='';$('#studentImportResult').textContent=`Created: ${result.created.length}; skipped existing: ${result.skipped.length}.`;
 if(result.created.length){downloadStudentCredentials(result.created);alert('Credentials CSV downloaded. Keep it private: these temporary passwords will not be shown again.');}
 await loadStudents();notify('Student import completed');
 }catch(e){notify(e.message)}};
$('#studentForm').onsubmit=async e=>{e.preventDefault();try{await post('/students',values(e.target));e.target.reset();notify('Student created');await loadStudents()}catch(err){notify(err.message)}};
let questionCache=[],editingQuestionId=null;
const questionForm=$('#questionForm');
const questionFilters=['#questionSearch','#questionTopicFilter','#questionDifficultyFilter','#questionStatusFilter'];
function resetQuestionForm(){editingQuestionId=null;questionForm.reset();$('#questionFormTitle').textContent='Add multiple-choice question';$('#questionSubmit').textContent='Add question';$('#cancelQuestionEdit').classList.add('hidden')}
$('#cancelQuestionEdit').onclick=resetQuestionForm;
function renderQuestions(){
 const search=$('#questionSearch').value.trim().toLowerCase(),topic=$('#questionTopicFilter').value,diff=$('#questionDifficultyFilter').value,status=$('#questionStatusFilter').value;
 const rows=questionCache.filter(q=>(!topic||q.topic===topic)&&(!diff||q.difficulty===diff)&&(!status||(status==='active'?!!q.active:!q.active))&&(!search||[q.topic,q.question,q.option_a,q.option_b,q.option_c,q.option_d].some(v=>String(v).toLowerCase().includes(search))));
 table($('#questionList'),['ID','Topic','Difficulty','Question','Correct','Status','Actions'],rows.map(q=>{
  const actions=el('div');actions.className='inline';
  const edit=el('button','Edit');edit.className='secondary';edit.onclick=()=>{
   editingQuestionId=q.id;for(const name of ['topic','question','option_a','option_b','option_c','option_d','correct_answer','difficulty'])questionForm.elements.namedItem(name).value=q[name];
   $('#questionFormTitle').textContent='Edit question #'+q.id;$('#questionSubmit').textContent='Save changes';$('#cancelQuestionEdit').classList.remove('hidden');questionForm.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const toggle=el('button',q.active?'Disable':'Enable');toggle.className=q.active?'danger':'secondary';toggle.onclick=async()=>{try{await patch('/questions/'+q.id,{active:!q.active});await loadQuestions();notify('Question status updated')}catch(e){notify(e.message)}};
  actions.append(edit,toggle);return[q.id,q.topic,q.difficulty,q.question,q.correct_answer,q.active?'Active':'Inactive',actions];
 }));
}
async function loadQuestions(){
 questionCache=await api('/questions');
 const active=questionCache.filter(q=>q.active).length;
 $('#questionStats').textContent=`Total: ${questionCache.length} | Active: ${active} | Inactive: ${questionCache.length-active}`;
 const sel=$('#questionTopicFilter'),selected=sel.value;
 sel.replaceChildren();const all=el('option','All topics');all.value='';sel.append(all);
 [...new Set(questionCache.map(q=>q.topic))].sort().forEach(topic=>{const o=el('option',topic);o.value=topic;sel.append(o)});sel.value=selected;
 const battle=$('#battleTopic');if(battle){const prior=battle.value;battle.replaceChildren();const any=el('option','All topics');any.value='';battle.append(any);[...new Set(questionCache.filter(q=>q.active).map(q=>q.topic))].sort().forEach(topic=>{const o=el('option',topic);o.value=topic;battle.append(o)});battle.value=prior;}
 renderQuestions();updateAutoTopics();
}
questionFilters.forEach(selector=>$(selector).addEventListener(selector==='#questionSearch'?'input':'change',renderQuestions));
questionForm.onsubmit=async e=>{e.preventDefault();try{
 const data=values(e.target);
 if(editingQuestionId!==null)await api('/questions/'+editingQuestionId,{method:'PUT',body:JSON.stringify(data)});
 else await post('/questions',data);
 notify(editingQuestionId!==null?'Question updated':'Question added');resetQuestionForm();await loadQuestions();
 }catch(err){notify(err.message)}};
// Handles quoted commas, escaped double quotes, and newlines in quoted CSV fields.
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted){quoted=false}else if(cell===''){quoted=true}else throw Error('Invalid CSV quote');
  }else if(c===','&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw Error('Unclosed CSV quote');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
$('#importQuestions').onclick=async()=>{
 const file=$('#questionCsv').files[0];if(!file)return notify('Choose a CSV file first');
 if(file.size>500000)return notify('CSV must be smaller than 500 KB');
 try{
  const rows=parseCsv(await file.text());if(rows.length<2)throw Error('CSV must contain a header and questions');
  const required=['topic','question','option_a','option_b','option_c','option_d','correct_answer','difficulty'];
  const headers=rows.shift().map(h=>h.trim().toLowerCase());
  if(required.some(h=>!headers.includes(h)))throw Error('Missing CSV headers. See the required headers above.');
  if(rows.length>200)throw Error('Maximum 200 questions per import');
  const questions=rows.map((r,i)=>{
   if(r.length!==headers.length)throw Error('Wrong number of columns on CSV row '+(i+2));
   return Object.fromEntries(required.map(h=>[h,r[headers.indexOf(h)].trim()]));
  });
  if(!confirm('Import '+questions.length+' questions?'))return;
  const result=await post('/questions/import',{questions});$('#questionCsv').value='';notify(result.imported+' questions imported');await loadQuestions();
 }catch(e){notify(e.message)}
};
// Auto pairing: the preview is a one-use server-side session snapshot.
let autoPreview=null;
function invalidateAutoPreview(){autoPreview=null;$('#autoConfirmBtn').disabled=true;$('#autoShuffleBtn').disabled=true;$('#autoPairResult').replaceChildren()}
function updateAutoSections(){
 const sel=$('#autoSection'),current=sel.value;sel.replaceChildren();const initial=el('option','Select section');initial.value='';sel.append(initial);
 [...new Set(studentCache.filter(s=>s.active&&s.section).map(s=>s.section))].sort().forEach(section=>{const opt=el('option',section);opt.value=section;sel.append(opt)});
 sel.value=[...sel.options].some(o=>o.value===current)?current:([...sel.options].some(o=>o.value==='BSIT-2A')?'BSIT-2A':'');
}
function updateAutoTopics(){
 const sel=$('#autoTopic'),current=sel.value;sel.replaceChildren();const initial=el('option','All topics');initial.value='';sel.append(initial);
 [...new Set(questionCache.filter(q=>q.active).map(q=>q.topic))].sort().forEach(topic=>{const opt=el('option',topic);opt.value=topic;sel.append(opt)});
 sel.value=[...sel.options].some(o=>o.value===current)?current:'';
}
function renderAutoPreview(p){
 const area=$('#autoPairResult');area.replaceChildren();area.append(el('h4',`${p.total_students} active students • ${p.pairs.length} waiting battles`));
 if(p.unmatched)area.append(el('p',`Unmatched this round: ${p.unmatched.full_name} (${p.unmatched.student_id}). No match is created for this student.`));
 const grid=el('div');area.append(grid);table(grid,['Battle','Player 1','Player 2'],p.pairs.map((pair,i)=>[i+1,`${pair.player1.full_name} (${pair.player1.student_id})`,`${pair.player2.full_name} (${pair.player2.student_id})`]));
 $('#autoConfirmBtn').disabled=false;$('#autoShuffleBtn').disabled=false;
}
async function createAutoPreview(){
 const form=$('#autoPairForm');const data=values(form);invalidateAutoPreview();
 const p=await post('/matches/auto-preview',data);autoPreview=p;renderAutoPreview(p);
}
$('#autoPairForm').addEventListener('change',invalidateAutoPreview);
$('#autoPairForm').addEventListener('input',invalidateAutoPreview);
$('#autoPairForm').onsubmit=async e=>{e.preventDefault();try{await createAutoPreview()}catch(err){notify(err.message)}};
$('#autoShuffleBtn').onclick=async()=>{try{await createAutoPreview()}catch(err){notify(err.message)}};
$('#autoConfirmBtn').onclick=async()=>{
 const p=autoPreview;if(!p)return;
 if(!confirm(`Create ${p.pairs.length} waiting matches for ${p.section}? This will write them to the database.`))return;
 $('#autoConfirmBtn').disabled=true;$('#autoShuffleBtn').disabled=true;
 try{const r=await post('/matches/auto-confirm',{token:p.token});invalidateAutoPreview();notify(`${r.created_count} matches created successfully`);await loadMatches()}
 catch(err){invalidateAutoPreview();notify(err.message+' Check Matches before retrying.');await loadMatches()}
};
$('#matchForm').onsubmit=async e=>{e.preventDefault();try{const d=values(e.target);const r=await post('/matches',d);notify('Match #'+r.id+' created');await loadMatches()}catch(err){notify(err.message)}};
async function loadMatches(){const rows=await api('/matches');table($('#adminMatches'),['ID','Players','Topic / Difficulty','Scheduled','Status','Actions'],rows.map(m=>{const div=el('div');div.className='inline';const view=el('button','View');view.className='secondary';view.onclick=()=>openMatch(m.id).catch(e=>notify(e.message));div.append(view);if(m.status==='waiting'){const start=el('button','Start');start.onclick=async()=>{try{await post('/matches/'+m.id+'/start',{});await loadMatches()}catch(e){notify(e.message)}};const cancel=el('button','Cancel');cancel.className='danger';cancel.onclick=async()=>{try{await post('/matches/'+m.id+'/cancel',{});await loadMatches()}catch(e){notify(e.message)}};div.append(start,cancel)}if(['finished','cancelled'].includes(m.status)){const rematch=el('button','Rematch');rematch.onclick=async()=>{try{const r=await post('/matches/'+m.id+'/rematch',{});notify('Rematch #'+r.id+' created');await loadMatches()}catch(e){notify(e.message)}};div.append(rematch)}return[m.id,m.players,(m.topic_filter||'All topics')+' / '+(m.difficulty_filter||'Mixed'),m.scheduled_at?new Date(m.scheduled_at).toLocaleString():'Immediate',m.status,div]}))}
async function loadStudent(){const rows=await api('/matches');table($('#myMatches'),['ID','Players','Status','Action'],rows.map(m=>{const b=el('button',m.status==='finished'?'Results':'Join / View');b.onclick=()=>openMatch(m.id).catch(e=>notify(e.message));return[m.id,m.players,m.status,b]}));await loadLeaderboard('#studentLeaderboard')}
async function loadLeaderboard(selector){const rows=await api('/leaderboard');table($(selector),['Rank','Student','Section','Games','Wins','Points'],rows.map((r,i)=>[i+1,r.full_name+' ('+r.student_id+')',r.section,r.games,r.wins,r.total_points]))}
(async()=>{try{me=(await api('/me')).user;await loginView()}catch{show('loginView')}})();
