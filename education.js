(() => {
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const get=id=>document.getElementById(id);
 const events='mw_edu_events';
 const db=window.supabase?.createClient('https://hmdlrjzgzefuylfljdlc.supabase.co','sb_publishable_n7kO1KIYQGuGoH4RZ6E0Ww_FRQZpEqW',{auth:{storageKey:'mw-edu-auth',detectSessionInUrl:false}});
 const btn=(label,action)=>{const b=node('button',label);b.type='button';b.className='edu-button';b.addEventListener('click',action);return b;};
 const panel=()=>{const div=node('div');div.className='edu-panel';return div;};
 const format=(y,m,d)=>[y,String(m+1).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
 const eventDates=e=>e.starts_on===e.ends_on?e.starts_on:e.starts_on+' ~ '+e.ends_on;
 function details(e){const div=panel();div.append(node('h3',e.title),node('p',[eventDates(e),e.time_label,e.venue].filter(Boolean).join(' · ')));if(e.details)div.append(node('pre',e.details));return div;}
 async function calendar(){
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   let [year,month]=today.split('-').map(Number);month--;let request=0;
   const grid=get('calendar-grid'),status=get('calendar-status'),list=get('calendar-list');
   async function render(){
     const current=++request,y=year,m=month;
     const count=new Date(y,m+1,0).getDate(),offset=new Date(y,m,1).getDay(),cells=[];
     get('calendar-month').textContent=y+'년 '+(m+1)+'월';grid.replaceChildren();list.replaceChildren();status.textContent='일정을 불러오는 중입니다.';
     for(const name of ['일','월','화','수','목','금','토']){const cell=node('div',name);cell.className='cal-week';grid.append(cell);}
     for(let i=0;i<offset;i++){const cell=node('div');cell.className='cal-day empty';cell.setAttribute('aria-hidden','true');grid.append(cell);}
     for(let day=1;day<=count;day++){const cell=node('div',day);cell.className='cal-day';if(format(y,m,day)===today)cell.setAttribute('aria-current','date');grid.append(cell);cells.push(cell);}
     const {data,error}=await db.from(events).select('id,title,starts_on,ends_on,time_label,venue,details').eq('published',true).lte('starts_on',format(y,m,count)).gte('ends_on',format(y,m,1)).order('starts_on').order('title');
     if(current!==request)return;
     if(error){status.textContent='교육 일정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';return;}
     status.textContent=data.length?'이달의 교육 '+data.length+'건':'이달에 공개된 교육 일정이 없습니다.';
     const headings=new Map();
     for(const event of data){const section=details(event);const heading=section.querySelector('h3');heading.tabIndex=-1;headings.set(event.id,heading);list.append(section);}
     for(let day=1;day<=count;day++)for(const event of data){const date=format(y,m,day);if(date<event.starts_on||date>event.ends_on)continue;const b=node('button',event.title);b.type='button';b.className='cal-event';b.setAttribute('aria-label',date+' '+event.title+' 상세 보기');b.onclick=()=>headings.get(event.id).focus();cells[day-1].append(b);}
   }
   const move=delta=>{if(month+delta<0){year--;month=11;}else if(month+delta>11){year++;month=0;}else month+=delta;render();};
   get('prev').onclick=()=>move(-1);get('next').onclick=()=>move(1);await render();
 }
 function label(form,title,tag,type,name,required,max){
   const l=node('label',title),input=node(tag);input.name=name;if(type)input.type=type;input.required=!!required;if(max)input.maxLength=max;l.append(input);form.append(l);return input;
 }
 async function admin(){
   const root=get('admin-root'),status=get('admin-status');root.replaceChildren();
   const {data:{user}}=await db.auth.getUser();
   if(!user){
     const form=node('form');form.className='edu-form';const email=label(form,'이메일','input','email','email',true),password=label(form,'비밀번호','input','password','password',true);email.autocomplete='username';password.autocomplete='current-password';
     const submit=node('button','로그인');submit.className='edu-button';form.append(submit);root.append(form);
     form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;const {error}=await db.auth.signInWithPassword({email:email.value,password:password.value});password.value='';submit.disabled=false;if(error){status.textContent='로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.';return;}status.textContent='';await admin();};return;
   }
   const [owner,role]=await Promise.all([db.rpc('mw_is_admin'),db.from('mw_edu_admins').select('user_id').eq('user_id',user.id).maybeSingle()]);
   root.append(btn('로그아웃',async()=>{await db.auth.signOut();status.textContent='';await admin();}));
   if(!owner.data&&!role.data){status.textContent=owner.error||role.error?'관리 권한을 확인하지 못했습니다.':'교육 일정 관리 권한이 없는 계정입니다.';return;}
   const editor=panel(),list=node('div');root.append(editor,list);
   function edit(event={}){
     editor.replaceChildren(node('h2',event.id?'일정 수정':'새 교육 일정'));const form=node('form');form.className='edu-form';editor.append(form);
     const inputs={};for(const [key,title,type,max] of [['title','교육 제목','text',120],['starts_on','시작일','date'],['ends_on','종료일','date'],['time_label','시간 안내','text',100],['venue','장소','text',200],['details','교육 세부 내용','textarea',6000]]){const input=label(form,title,type==='textarea'?'textarea':'input',type==='textarea'?null:type,key,['title','starts_on'].includes(key),max);input.value=event[key]||'';inputs[key]=input;}
     const publish=label(form,'홈페이지에 공개','input','checkbox','published');publish.checked=Boolean(event.published);
     const save=node('button','일정 저장');save.className='edu-button';form.append(save);if(event.id)form.append(btn('새 일정 작성',()=>edit()));
     form.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()]));data.ends_on=data.ends_on||data.starts_on;data.published=publish.checked;if(!data.title||data.ends_on<data.starts_on){status.textContent='제목과 시작일·종료일을 확인해 주세요.';return;}save.disabled=true;
       const result=await (event.id?db.from(events).update(data).eq('id',event.id):db.from(events).insert(data)).select('id').single();save.disabled=false;if(result.error){status.textContent='일정을 저장하지 못했습니다. 입력값과 권한을 확인해 주세요.';return;}status.textContent='일정을 저장했습니다.';edit();await refresh();};
   }
   async function refresh(){
     const {data,error}=await db.from(events).select('*').order('starts_on',{ascending:false}).limit(100);
     list.replaceChildren(node('h2','등록된 교육 일정'));
     if(error){list.append(node('p','일정 목록을 불러오지 못했습니다.'));return;}
     if(!data.length)list.append(node('p','등록된 일정이 없습니다.'));
     for(const event of data){const row=details(event);row.append(node('p',event.published?'공개 중':'비공개'),btn('수정',()=>{edit(event);editor.scrollIntoView({block:'start'});}));list.append(row);}
   }
   edit();await refresh();
   if(owner.data){
     const box=panel(),form=node('form');form.className='edu-form';box.append(node('h2','교육 일정 관리자 설정'),node('p','Supabase에서 이메일 인증을 완료한 계정에 교육 일정 관리 권한을 부여하거나 회수할 수 있습니다.'),form);root.append(box);
     const email=label(form,'관리자 이메일','input','email','admin_email',true);const op=label(form,'권한 작업','select',null,'op');
     for(const [value,name] of [['grant','부여'],['revoke','회수']]){const option=node('option',name);option.value=value;op.append(option);}
     const button=node('button','권한 저장');button.className='edu-button';form.append(button);
     form.onsubmit=async e=>{e.preventDefault();button.disabled=true;const {error}=await db.rpc('mw_edu_set_admin',{account_email:email.value,enabled:op.value==='grant'});button.disabled=false;status.textContent=error?'권한을 변경하지 못했습니다. 이메일 인증 여부를 확인해 주세요.':'교육 일정 관리 권한을 변경했습니다.';if(!error)form.reset();};
   }
 }
 async function instructors(){
   const status=get('teacher-status'),list=get('teacher-list');
   const {data,error}=await db.from('mw_teacher_profiles').select('display_name,headline,bio,career,image_url,tags').eq('published',true).eq('approval_status','approved').order('display_name');
   if(error){status.textContent='강사 프로필을 불러오지 못했습니다.';return;}
   status.textContent=data.length?'':'현재 공개된 강사 프로필이 없습니다.';
   for(const teacher of data){const card=node('article');card.className='edu-profile';try{const url=new URL(teacher.image_url);if(url.protocol==='https:'){const img=node('img');img.src=url.href;img.alt=teacher.display_name+' 프로필';img.loading='lazy';card.append(img);}}catch{}
     card.append(node('h3',teacher.display_name));if(teacher.headline)card.append(node('p',teacher.headline));if(teacher.tags?.length)card.append(node('p',teacher.tags.join(' · ')));if(teacher.bio)card.append(node('p',teacher.bio));if(teacher.career){const more=node('details');more.append(node('summary','경력·교육 이력'),node('p',teacher.career));card.append(more);}list.append(card);}
 }
 if(!db){for(const id of ['calendar-status','admin-status','teacher-status'])if(get(id))get(id).textContent='연결을 불러오지 못했습니다. 새로고침해 주세요.';return;}
 if(get('calendar-grid'))calendar();
 if(get('admin-root'))admin();
 if(get('teacher-list'))instructors();
})();