require('dotenv').config();
const express=require('express'),http=require('http'),session=require('express-session');
const MySQLStore=require('express-mysql-session')(session);
const bcrypt=require('bcryptjs'),crypto=require('crypto'),{Server}=require('socket.io');
const db=require('./db');
const app=express(),server=http.createServer(app),io=new Server(server);
app.disable('x-powered-by');app.use(express.json({limit:'32kb'}));
const store=new MySQLStore({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,createDatabaseTable:true});
const sessions=session({name:'arena.sid',secret:process.env.SESSION_SECRET||'CHANGE_THIS_SECRET_BEFORE_USE',resave:false,saveUninitialized:false,store,cookie:{httpOnly:true,sameSite:'lax',secure:false,maxAge:8*60*60*1000}});
app.use(sessions);app.use(express.static('public'));
const fail=(res,e)=>{console.error(e);res.status(500).json({error:'Server or database error'});};
const asyncRoute=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>fail(res,e));
const auth=(req,res,next)=>req.session.user?next():res.status(401).json({error:'Please log in'});
const admin=(req,res,next)=>req.session.user?.role==='admin'?next():res.status(403).json({error:'Instructor only'});
const cleanUser=u=>({id:u.id,student_id:u.student_id,full_name:u.full_name,section:u.section,role:u.role,must_change_password:!!u.must_change_password});
const int=(v,min,max)=>Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
const trim=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
app.post('/api/login',asyncRoute(async(req,res)=>{
 const id=trim(req.body.student_id,40),pw=req.body.password;
 const [[u]]=await db.execute('SELECT * FROM users WHERE student_id=? AND active=1',[id]);
 if(!u||typeof pw!=='string'||!(await bcrypt.compare(pw,u.password_hash)))return res.status(401).json({error:'Invalid credentials'});
 req.session.regenerate(err=>{if(err)return fail(res,err);req.session.user=cleanUser(u);req.session.save(err2=>err2?fail(res,err2):res.json({user:req.session.user}));});
}));
app.post('/api/logout',auth,(req,res)=>req.session.destroy(()=>{res.clearCookie('arena.sid');res.json({ok:true})}));
app.get('/api/me',auth,(req,res)=>res.json({user:req.session.user}));
app.post('/api/change-password',auth,asyncRoute(async(req,res)=>{
 const old=req.body.old_password,pw=req.body.new_password;
 if(typeof pw!=='string'||pw.length<10||pw.length>100)return res.status(400).json({error:'New password must have 10–100 characters'});
 const [[u]]=await db.execute('SELECT password_hash FROM users WHERE id=?',[req.session.user.id]);
 if(!u||!(await bcrypt.compare(String(old||''),u.password_hash)))return res.status(400).json({error:'Incorrect current password'});
 await db.execute('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?',[await bcrypt.hash(pw,12),req.session.user.id]);
 req.session.user.must_change_password=false;res.json({ok:true});
}));
app.use('/api',auth,(req,res,next)=>req.session.user.must_change_password?res.status(403).json({error:'Change your temporary password first'}):next());
app.get('/api/students',admin,asyncRoute(async(req,res)=>{const [rows]=await db.query("SELECT id,student_id,full_name,section,active FROM users WHERE role='student' ORDER BY full_name");res.json(rows)}));
app.post('/api/students',admin,asyncRoute(async(req,res)=>{
 const id=trim(req.body.student_id,40),name=trim(req.body.full_name,120),section=trim(req.body.section,80),pw=req.body.password;
 if(!id||!name||typeof pw!=='string'||pw.length<10)return res.status(400).json({error:'ID, name, and temporary password (10+ characters) required'});
 try{await db.execute("INSERT INTO users (student_id,full_name,section,password_hash,role) VALUES (?,?,?,?, 'student')",[id,name,section,await bcrypt.hash(pw,12)]);}catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Student ID already exists'});throw e}
 res.json({ok:true});
}));
// Bulk student import: validate all records, skip existing IDs, and generate one-time passwords.
app.post('/api/students/import',admin,asyncRoute(async(req,res)=>{
 const input=req.body.students;
 if(!Array.isArray(input)||input.length<1||input.length>100)return res.status(400).json({error:'Import 1–100 students per batch'});
 const seen=new Set(),records=[];
 for(let i=0;i<input.length;i++){
  const item=input[i]||{},student_id=trim(item.student_id,40),full_name=trim(item.full_name,120),section=trim(item.section,80);
  if(typeof item.student_id!=='string'||typeof item.full_name!=='string'||typeof item.section!=='string'||!student_id||!full_name||student_id.length!==item.student_id.trim().length||full_name.length!==item.full_name.trim().length||section.length!==item.section.trim().length)return res.status(400).json({error:'Invalid data or field length in CSV row '+(i+2)});
  if(seen.has(student_id))return res.status(400).json({error:'Repeated student ID in CSV row '+(i+2)});
  seen.add(student_id);records.push({student_id,full_name,section});
 }
 const conn=await db.getConnection(),created=[],skipped=[];
 try{
  await conn.beginTransaction();
  for(const u of records){
   const [[existing]]=await conn.execute('SELECT id FROM users WHERE student_id=?',[u.student_id]);
   if(existing){skipped.push(u.student_id);continue}
   const password=crypto.randomBytes(15).toString('base64url');
   const hash=await bcrypt.hash(password,12);
   await conn.execute("INSERT INTO users (student_id,full_name,section,password_hash,role,must_change_password) VALUES (?,?,?,?, 'student',1)",[u.student_id,u.full_name,u.section,hash]);
   created.push({...u,temporary_password:password});
  }
  await conn.commit();
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
 res.set('Cache-Control','no-store');res.json({created,skipped});
}));

app.patch('/api/students/:id',admin,asyncRoute(async(req,res)=>{const id=int(req.params.id,1,1000000000);if(!id)return res.status(400).json({error:'Invalid ID'});await db.execute("UPDATE users SET active=? WHERE id=? AND role='student'",[req.body.active?1:0,id]);res.json({ok:true})}));
app.post('/api/students/:id/reset',admin,asyncRoute(async(req,res)=>{const id=int(req.params.id,1,1000000000),pw=req.body.password;if(!id||typeof pw!=='string'||pw.length<10)return res.status(400).json({error:'Valid ID and password (10+ characters) required'});await db.execute("UPDATE users SET password_hash=?,must_change_password=1 WHERE id=? AND role='student'",[await bcrypt.hash(pw,12),id]);res.json({ok:true})}));
// Question bank: validate on server, never trust client-provided correct answers or IDs.
const questionFields=['topic','question','option_a','option_b','option_c','option_d'];
function validateQuestion(q){
  if(!q||typeof q!=='object')return null;
  const v=Object.fromEntries(questionFields.map(k=>[k,trim(q[k],k==='question'?2000:k==='topic'?80:500)]));
  const difficulty=trim(q.difficulty||'Medium',10);
  if(questionFields.some(k=>!v[k])||!['A','B','C','D'].includes(q.correct_answer)||!['Easy','Medium','Hard'].includes(difficulty))return null;
  return {...v,correct_answer:q.correct_answer,difficulty};
}
const questionParams=q=>[...questionFields.map(k=>q[k]),q.correct_answer,q.difficulty];
app.get('/api/questions',admin,asyncRoute(async(req,res)=>{
  const [rows]=await db.query('SELECT * FROM questions ORDER BY id DESC');res.json(rows);
}));
app.post('/api/questions',admin,asyncRoute(async(req,res)=>{
  const q=validateQuestion(req.body);
  if(!q)return res.status(400).json({error:'Complete all question fields, correct answer, and valid difficulty'});
  await db.execute('INSERT INTO questions (topic,question,option_a,option_b,option_c,option_d,correct_answer,difficulty) VALUES (?,?,?,?,?,?,?,?)',questionParams(q));
  res.json({ok:true});
}));
app.put('/api/questions/:id',admin,asyncRoute(async(req,res)=>{
  const id=int(req.params.id,1,1000000000),q=validateQuestion(req.body);
  if(!id||!q)return res.status(400).json({error:'Invalid question or missing fields'});
  // Historical match questions refer to this question ID. For fairness, do not edit used questions.
  const [[{used}]]=await db.execute('SELECT COUNT(*) used FROM match_questions WHERE question_id=?',[id]);
  if(used)return res.status(409).json({error:'This question was used in a match. Disable it and create a revised question instead.'});
  const [r]=await db.execute('UPDATE questions SET topic=?,question=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_answer=?,difficulty=? WHERE id=?',[...questionParams(q),id]);
  if(!r.affectedRows)return res.status(404).json({error:'Question not found'});
  res.json({ok:true});
}));
app.patch('/api/questions/:id',admin,asyncRoute(async(req,res)=>{
  const id=int(req.params.id,1,1000000000);
  if(!id||typeof req.body.active!=='boolean')return res.status(400).json({error:'Invalid question ID or status'});
  const [r]=await db.execute('UPDATE questions SET active=? WHERE id=?',[req.body.active?1:0,id]);
  if(!r.affectedRows)return res.status(404).json({error:'Question not found'});
  res.json({ok:true});
}));
app.post('/api/questions/import',admin,asyncRoute(async(req,res)=>{
  const input=req.body.questions;
  if(!Array.isArray(input)||input.length<1||input.length>200)return res.status(400).json({error:'Import 1 to 200 questions per batch'});
  const questions=input.map(validateQuestion);
  const bad=questions.findIndex(q=>!q);
  if(bad>=0)return res.status(400).json({error:'Invalid data in CSV row '+(bad+2)});
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    for(const q of questions)await conn.execute('INSERT INTO questions (topic,question,option_a,option_b,option_c,option_d,correct_answer,difficulty) VALUES (?,?,?,?,?,?,?,?)',questionParams(q));
    await conn.commit();
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
  res.json({ok:true,imported:questions.length});
}));

const matchSummary=async(id)=>{
 const [[m]]=await db.execute('SELECT * FROM matches WHERE id=?',[id]);if(!m)return null;
 const [players]=await db.execute('SELECT u.id,u.student_id,u.full_name,mp.score FROM match_players mp JOIN users u ON u.id=mp.user_id WHERE mp.match_id=? ORDER BY u.id',[id]);
 return {id:m.id,status:m.status,current_index:m.current_index,question_count:m.question_count,seconds_per_question:m.seconds_per_question,winner_id:m.winner_id,topic_filter:m.topic_filter,difficulty_filter:m.difficulty_filter,scheduled_at:m.scheduled_at,players};
};
const publicQuestion=async(matchId,index)=>{
 const [[q]]=await db.execute('SELECT q.id,q.topic,q.question,q.option_a,q.option_b,q.option_c,q.option_d FROM match_questions mq JOIN questions q ON q.id=mq.question_id WHERE mq.match_id=? AND mq.position=?',[matchId,index]);return q||null;
};
const broadcast=async(id)=>{const m=await matchSummary(id);if(m)io.to('match:'+id).emit('match:state',m);return m};
app.post('/api/matches',admin,asyncRoute(async(req,res)=>{
 const p1=int(req.body.player1,1,1000000000),p2=int(req.body.player2,1,1000000000),count=int(req.body.question_count,1,50),secs=int(req.body.seconds_per_question,5,120);
 if(!p1||!p2||p1===p2||!count||!secs)return res.status(400).json({error:'Select two different students, 1–50 questions and 5–120 seconds'});
 const [users]=await db.query("SELECT id FROM users WHERE id IN (?,?) AND role='student' AND active=1",[p1,p2]);if(users.length!==2)return res.status(400).json({error:'Both students must be active'});
 const topic=trim(req.body.topic_filter,80),difficulty=trim(req.body.difficulty_filter,10);
 if(difficulty&&!['Easy','Medium','Hard'].includes(difficulty))return res.status(400).json({error:'Invalid difficulty'});
 const scheduled=trim(req.body.scheduled_at,35);let scheduledDate=null;
 if(scheduled){scheduledDate=new Date(scheduled);if(Number.isNaN(scheduledDate.getTime())||scheduledDate.getTime()<Date.now()-60000)return res.status(400).json({error:'Choose a valid future schedule'});}
 const [questions]=await db.execute("SELECT id FROM questions WHERE active=1 AND (? = '' OR topic=?) AND (? = '' OR difficulty=?) ORDER BY RAND() LIMIT "+count,[topic,topic,difficulty,difficulty]);
 if(questions.length<count)return res.status(400).json({error:'Not enough active questions for the selected topic/difficulty'});
 const conn=await db.getConnection();let id;
 try{await conn.beginTransaction();const [r]=await conn.execute('INSERT INTO matches (created_by,question_count,seconds_per_question,topic_filter,difficulty_filter,scheduled_at) VALUES (?,?,?,?,?,?)',[req.session.user.id,count,secs,topic,difficulty,scheduled?scheduled.replace('T',' ')+':00':null]);id=r.insertId;
 await conn.execute('INSERT INTO match_players (match_id,user_id) VALUES (?,?),(?,?)',[id,p1,id,p2]);
 for(let i=0;i<questions.length;i++)await conn.execute('INSERT INTO match_questions (match_id,position,question_id) VALUES (?,?,?)',[id,i,questions[i].id]);await conn.commit();
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
 await broadcast(id);io.to('user:'+p1).emit('matches:changed');io.to('user:'+p2).emit('matches:changed');res.json({id});
}));
// Random class pairing: preview and shuffle are server-generated; only confirmation writes matches.
const autoPairLocks=new Set();
const shuffleIds=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const saveSession=req=>new Promise((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
app.post('/api/matches/auto-preview',admin,asyncRoute(async(req,res)=>{
 const section=trim(req.body.section,80),count=int(req.body.question_count,1,50),secs=int(req.body.seconds_per_question,5,120);
 const topic=trim(req.body.topic_filter,80),difficulty=trim(req.body.difficulty_filter,10);
 if(!section||!count||!secs||difficulty&&!['Easy','Medium','Hard'].includes(difficulty))return res.status(400).json({error:'Select a valid section, question count, time, and difficulty'});
 const [students]=await db.execute("SELECT id,student_id,full_name,section FROM users WHERE role='student' AND active=1 AND section=? ORDER BY id",[section]);
 if(students.length<2)return res.status(400).json({error:'At least two active students are required in this section'});
 // Prevent a batch that cannot be populated with distinct questions per match.
 const [[{available}]]=await db.execute("SELECT COUNT(*) available FROM questions WHERE active=1 AND (?='' OR topic=?) AND (?='' OR difficulty=?)",[topic,topic,difficulty,difficulty]);
 if(available<count)return res.status(400).json({error:'Not enough active questions for the chosen topic/difficulty'});
 const randomized=shuffleIds(students),pairs=[];
 for(let i=0;i+1<randomized.length;i+=2)pairs.push([randomized[i],randomized[i+1]]);
 const unmatched=randomized.length%2?randomized[randomized.length-1]:null;
 const token=crypto.randomBytes(24).toString('hex');
 req.session.autoPairPreview={token,created:Date.now(),section,count,secs,topic,difficulty,pairs:pairs.map(pair=>pair.map(u=>u.id)),studentIds:students.map(u=>u.id)};
 await saveSession(req);
 res.set('Cache-Control','no-store');res.json({token,section,question_count:count,seconds_per_question:secs,topic_filter:topic,difficulty_filter:difficulty,pairs:pairs.map(([a,b])=>({player1:a,player2:b})),unmatched,total_students:students.length});
}));
app.post('/api/matches/auto-confirm',admin,asyncRoute(async(req,res)=>{
 const preview=req.session.autoPairPreview,token=trim(req.body.token,100),key=req.sessionID;
 if(!preview||!token||token!==preview.token||Date.now()-preview.created>15*60*1000)return res.status(409).json({error:'Preview expired or changed. Generate a fresh preview.'});
 if(autoPairLocks.has(key))return res.status(409).json({error:'Batch creation already in progress'});
 autoPairLocks.add(key);
 let conn;try{conn=await db.getConnection()}catch(e){autoPairLocks.delete(key);throw e}
 let committed=false,created=[];
 try{
  await conn.beginTransaction();
  const [current]=await conn.execute("SELECT id FROM users WHERE role='student' AND active=1 AND section=? ORDER BY id FOR UPDATE",[preview.section]);
  if(current.length!==preview.studentIds.length||current.some((u,i)=>u.id!==preview.studentIds[i])){await conn.rollback();return res.status(409).json({error:'Section roster changed. Preview and shuffle again.'})}
  const [questions]=await conn.execute("SELECT id FROM questions WHERE active=1 AND (?='' OR topic=?) AND (?='' OR difficulty=?)",[preview.topic,preview.topic,preview.difficulty,preview.difficulty]);
  if(questions.length<preview.count){await conn.rollback();return res.status(409).json({error:'Question bank changed. Generate another preview.'})}
  for(const [p1,p2] of preview.pairs){
   const chosen=shuffleIds(questions).slice(0,preview.count);
   const [r]=await conn.execute('INSERT INTO matches (created_by,question_count,seconds_per_question,topic_filter,difficulty_filter) VALUES (?,?,?,?,?)',[req.session.user.id,preview.count,preview.secs,preview.topic,preview.difficulty]);
   const id=r.insertId;created.push({id,player1:p1,player2:p2});
   await conn.execute('INSERT INTO match_players (match_id,user_id) VALUES (?,?),(?,?)',[id,p1,id,p2]);
   for(let i=0;i<chosen.length;i++)await conn.execute('INSERT INTO match_questions (match_id,position,question_id) VALUES (?,?,?)',[id,i,chosen[i].id]);
  }
  await conn.commit();committed=true;
 }catch(e){if(!committed)await conn.rollback();throw e}finally{conn.release();autoPairLocks.delete(key)}
 // The batch is committed even if the session update or notifications fail.
 delete req.session.autoPairPreview;
 try{await saveSession(req)}catch(e){console.error('Preview cleanup failed',e)}
 for(const m of created){io.to('user:'+m.player1).emit('matches:changed');io.to('user:'+m.player2).emit('matches:changed')}
 res.json({ok:true,created_count:created.length,matches:created});
}));
app.get('/api/matches',asyncRoute(async(req,res)=>{
 const isAdmin=req.session.user.role==='admin';
 const [rows]=await db.execute(`SELECT m.id,m.status,m.created_at,m.started_at,m.finished_at,m.question_count,m.winner_id,m.topic_filter,m.difficulty_filter,m.scheduled_at, GROUP_CONCAT(CONCAT(u.full_name,' (',mp.score,')') ORDER BY u.id SEPARATOR ' vs ') players FROM matches m JOIN match_players mp ON mp.match_id=m.id JOIN users u ON u.id=mp.user_id ${isAdmin?'':'WHERE EXISTS (SELECT 1 FROM match_players mine WHERE mine.match_id=m.id AND mine.user_id=?)'} GROUP BY m.id ORDER BY m.id DESC LIMIT 150`,isAdmin?[]:[req.session.user.id]);res.json(rows);
}));
app.post('/api/matches/:id/rematch',admin,asyncRoute(async(req,res)=>{
 const id=int(req.params.id,1,1000000000);if(!id)return res.status(400).json({error:'Invalid match'});
 const m=await matchSummary(id);if(!m||m.players.length!==2)return res.status(404).json({error:'Match not found'});
 if(m.status!=='finished'&&m.status!=='cancelled')return res.status(409).json({error:'Finish or cancel the previous match first'});
 const [users]=await db.execute('SELECT id FROM users WHERE id IN (?,?) AND active=1',[m.players[0].id,m.players[1].id]);if(users.length!==2)return res.status(400).json({error:'Both players must be active'});
 const [questions]=await db.execute("SELECT id FROM questions WHERE active=1 AND (? = '' OR topic=?) AND (? = '' OR difficulty=?) ORDER BY RAND() LIMIT "+m.question_count,[m.topic_filter||'',m.topic_filter||'',m.difficulty_filter||'',m.difficulty_filter||'']);
 if(questions.length<m.question_count)return res.status(400).json({error:'Not enough active questions for rematch'});
 const conn=await db.getConnection();let newId;
 try{await conn.beginTransaction();const [r]=await conn.execute('INSERT INTO matches (created_by,question_count,seconds_per_question,topic_filter,difficulty_filter) VALUES (?,?,?,?,?)',[req.session.user.id,m.question_count,m.seconds_per_question,m.topic_filter||'',m.difficulty_filter||'']);newId=r.insertId;
 await conn.execute('INSERT INTO match_players (match_id,user_id) VALUES (?,?),(?,?)',[newId,m.players[0].id,newId,m.players[1].id]);
 for(let i=0;i<questions.length;i++)await conn.execute('INSERT INTO match_questions (match_id,position,question_id) VALUES (?,?,?)',[newId,i,questions[i].id]);await conn.commit();}catch(e){await conn.rollback();throw e}finally{conn.release()}
 for(const player of m.players)io.to('user:'+player.id).emit('matches:changed');res.json({id:newId});
}));
app.get('/api/matches/:id',asyncRoute(async(req,res)=>{
 const id=int(req.params.id,1,1000000000);if(!id)return res.status(400).json({error:'Invalid match'});
 const m=await matchSummary(id);if(!m)return res.status(404).json({error:'Match not found'});
 if(req.session.user.role!=='admin'&&!m.players.some(p=>p.id===req.session.user.id))return res.status(403).json({error:'Not your match'});
 res.json(m);
}));
app.get('/api/leaderboard',asyncRoute(async(req,res)=>{
 const [rows]=await db.query("SELECT u.student_id,u.full_name,u.section,COALESCE(SUM(CASE WHEN m.status='finished' THEN mp.score ELSE 0 END),0) total_points,COUNT(CASE WHEN m.status='finished' THEN 1 END) games,COUNT(CASE WHEN m.winner_id=u.id THEN 1 END) wins FROM users u LEFT JOIN match_players mp ON mp.user_id=u.id LEFT JOIN matches m ON m.id=mp.match_id WHERE u.role='student' GROUP BY u.id ORDER BY wins DESC,total_points DESC LIMIT 100");res.json(rows);
}));
app.get('/api/reports.csv',admin,asyncRoute(async(req,res)=>{
 const [rows]=await db.query("SELECT m.id match_id,m.created_at,m.finished_at,m.status,u.student_id,u.full_name,u.section,mp.score,CASE WHEN m.status!='finished' THEN 'N/A' WHEN m.winner_id IS NULL THEN 'DRAW' WHEN m.winner_id=u.id THEN 'WIN' ELSE 'LOSS' END result FROM matches m JOIN match_players mp ON mp.match_id=m.id JOIN users u ON u.id=mp.user_id ORDER BY m.id DESC,u.id");
 const csv=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,v=>'\''+v).replace(/"/g,'""')+'"';
 const keys=['match_id','created_at','finished_at','status','student_id','full_name','section','score','result'];res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="jdbc-arena-report.csv"');res.send('\uFEFF'+keys.join(',')+'\r\n'+rows.map(r=>keys.map(k=>csv(r[k])).join(',')).join('\r\n'));
}));
// Timers live on the server. No browser can set a score or advance a round.
const timers=new Map(),locks=new Set();
async function beginQuestion(id,index){
 const [[m]]=await db.execute('SELECT status,question_count,seconds_per_question FROM matches WHERE id=?',[id]);if(!m||m.status!=='playing')return;
 if(index>=m.question_count)return finishMatch(id);
 await db.execute('UPDATE matches SET current_index=?,question_started_at=NOW(3) WHERE id=? AND status=\'playing\'',[index,id]);
 const deadline=Date.now()+m.seconds_per_question*1000;
 const q=await publicQuestion(id,index);
 await broadcast(id);io.to('match:'+id).emit('match:question',{index,question:q,deadline});
 clearTimeout(timers.get(id));timers.set(id,setTimeout(()=>advance(id,index).catch(console.error),m.seconds_per_question*1000+150));
}
async function advance(id,index){if(locks.has(id))return;locks.add(id);try{
 const [[m]]=await db.execute('SELECT status,current_index FROM matches WHERE id=?',[id]);if(m?.status!=='playing'||m.current_index!==index)return;
 io.to('match:'+id).emit('match:round-ended',{index});await beginQuestion(id,index+1);
}finally{locks.delete(id)}}
async function finishMatch(id){
 clearTimeout(timers.get(id));timers.delete(id);
 const [p]=await db.execute('SELECT user_id,score FROM match_players WHERE match_id=? ORDER BY score DESC',[id]);
 const winner=p.length===2&&p[0].score!==p[1].score?p[0].user_id:null;
 await db.execute("UPDATE matches SET status='finished',winner_id=?,finished_at=NOW() WHERE id=? AND status='playing'",[winner,id]);
 const m=await broadcast(id);io.to('match:'+id).emit('match:finished',m);
}
app.post('/api/matches/:id/start',admin,asyncRoute(async(req,res)=>{
 const id=int(req.params.id,1,1000000000);if(!id)return res.status(400).json({error:'Invalid match'});
 const [r]=await db.execute("UPDATE matches SET status='playing',started_at=NOW() WHERE id=? AND status='waiting' AND (scheduled_at IS NULL OR scheduled_at <= NOW())",[id]);if(!r.affectedRows)return res.status(409).json({error:'Match already started, unavailable, or scheduled for later'});
 const startsAt=Date.now()+3000;
 await broadcast(id);io.to('match:'+id).emit('match:countdown',{startsAt});
 timers.set(id,setTimeout(()=>beginQuestion(id,0).catch(console.error),3000));res.json({ok:true,startsAt});
}));
app.post('/api/matches/:id/cancel',admin,asyncRoute(async(req,res)=>{const id=int(req.params.id,1,1000000000);if(!id)return res.status(400).json({error:'Invalid match'});await db.execute("UPDATE matches SET status='cancelled' WHERE id=? AND status='waiting'",[id]);await broadcast(id);res.json({ok:true})}));
// Session shared with socket.io, and authorization rechecked on every answer.
io.engine.use(sessions);
io.use((socket,next)=>socket.request.session?.user&&!socket.request.session.user.must_change_password?next():next(new Error('Login required')));
io.on('connection',socket=>{
 const user=socket.request.session.user;socket.join('user:'+user.id);
 socket.on('match:join',async({matchId}={})=>{try{
 const id=int(matchId,1,1000000000);if(!id)return;
 const m=await matchSummary(id);if(!m||user.role!=='admin'&&!m.players.some(p=>p.id===user.id))return;
 socket.join('match:'+id);socket.emit('match:state',m);
 if(m.status==='playing'&&m.current_index<0){
 const [[row]]=await db.execute('SELECT started_at FROM matches WHERE id=?',[id]);
 const startsAt=new Date(row.started_at).getTime()+3000;
 socket.emit('match:countdown',{startsAt});
 }
 if(m.status==='playing'&&m.current_index>=0){
 const [[row]]=await db.execute('SELECT seconds_per_question,TIMESTAMPDIFF(MICROSECOND,NOW(3),DATE_ADD(question_started_at, INTERVAL seconds_per_question SECOND)) remaining_us FROM matches WHERE id=?',[id]);
 const deadline=Date.now()+Math.max(0,Math.floor(row.remaining_us/1000));
 const question=await publicQuestion(id,m.current_index);
 socket.emit('match:question',{index:m.current_index,question,deadline});
 }
 }catch(e){console.error(e)}});
 socket.on('match:answer',async({matchId,index,answer}={})=>{try{
 if(user.role!=='student'||!['A','B','C','D'].includes(answer))return;
 const id=int(matchId,1,1000000000),idx=int(index,0,49);if(!id||idx===null)return;
 const conn=await db.getConnection();let result=null;
 try{await conn.beginTransaction();
 const [[m]]=await conn.execute('SELECT status,current_index,seconds_per_question,question_started_at FROM matches WHERE id=? FOR UPDATE',[id]);
 const [[member]]=await conn.execute('SELECT user_id FROM match_players WHERE match_id=? AND user_id=?',[id,user.id]);
 if(!m||!member||m.status!=='playing'||m.current_index!==idx){await conn.rollback();return}
 const [[q]]=await conn.execute('SELECT q.correct_answer FROM match_questions mq JOIN questions q ON q.id=mq.question_id WHERE mq.match_id=? AND mq.position=?',[id,idx]);
 const [[time]]=await conn.query('SELECT TIMESTAMPDIFF(MICROSECOND, ?, NOW(3)) elapsed',[m.question_started_at]);
 const elapsed=Math.max(0,Math.floor(time.elapsed/1000)),limit=m.seconds_per_question*1000;
 if(elapsed>limit+250){await conn.rollback();return}
 const correct=answer===q.correct_answer,points=correct?100+Math.max(0,Math.round(100*(limit-elapsed)/limit)):0;
 try{await conn.execute('INSERT INTO match_answers (match_id,position,user_id,answer,correct,response_ms,points) VALUES (?,?,?,?,?,?,?)',[id,idx,user.id,answer,correct?1:0,elapsed,points]);}
 catch(e){if(e.code==='ER_DUP_ENTRY'){await conn.rollback();return}throw e}
 await conn.execute('UPDATE match_players SET score=score+? WHERE match_id=? AND user_id=?',[points,id,user.id]);await conn.commit();result={correct,points,index:idx};
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
 if(result){socket.emit('match:answer-result',result);const m=await broadcast(id);const [[{n}]]=await db.execute('SELECT COUNT(*) n FROM match_answers WHERE match_id=? AND position=?',[id,idx]);if(n===2)await advance(id,idx)}
 }catch(e){console.error(e);socket.emit('game:error','Unable to submit answer')}});
});
(async()=>{try{
 if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET must be at least 32 characters');
 await db.query('SELECT 1');
 // Restore active games after restart by cancelling them rather than giving inconsistent results.
 await db.query("UPDATE matches SET status='cancelled' WHERE status='playing'");
 server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('JDBC Battle Arena listening on port',process.env.PORT||3000));
}catch(e){console.error('Startup failed:',e.message);process.exit(1)}})();
