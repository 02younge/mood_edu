(() => {
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const get=id=>document.getElementById(id);
 const events='mw_edu_events';
 const db=window.supabase?.createClient('https://hmdlrjzgzefuylfljdlc.supabase.co','sb_publishable_n7kO1KIYQGuGoH4RZ6E0Ww_FRQZpEqW',{auth:{storageKey:'mw-edu-auth',detectSessionInUrl:false}});
 const btn=(label,action)=>{const b=node('button',label);b.type='button';b.className='edu-button';b.addEventListener('click',action);return b;};
 const panel=()=>{const div=node('div');div.className='edu-panel';return div;};
 const format=(y,m,d)=>[y,String(m+1).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
 const eventDates=e=>e.starts_on===e.ends_on?e.starts_on:e.starts_on+' ~ '+e.ends_on;
 const courseNames={dynamic:'다이나믹 무브먼트 전문가 과정',swedish:'스웨디쉬 프로 데뷔 과정'};
 function destination(event){
   if(event.link_type==='course'&&Object.hasOwn(courseNames,event.link_target))return './'+event.link_target+'.html';
   if(event.link_type==='external'){try{const url=new URL(event.link_target);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{}}
   return null;
 }
 function details(e){const div=panel();div.append(node('h3',e.title),node('p',[eventDates(e),e.time_label,e.venue].filter(Boolean).join(' · ')));if(e.details)div.append(node('pre',e.details));const href=destination(e);if(href){const link=node('a',e.link_type==='course'?'교육과정 소개 보기 ↗':'신청·외부 안내 보기 ↗');link.href=href;link.className='edu-button';div.append(link);}return div;}
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
     const {data,error}=await db.from(events).select('id,title,starts_on,ends_on,time_label,venue,details,link_type,link_target').eq('published',true).lte('starts_on',format(y,m,count)).gte('ends_on',format(y,m,1)).order('starts_on').order('title');
     if(current!==request)return;
     if(error){status.textContent='교육 일정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';return;}
     status.textContent=data.length?'이달의 교육 '+data.length+'건':'이달에 공개된 교육 일정이 없습니다.';
     const headings=new Map();
     for(const event of data){const section=details(event);const heading=section.querySelector('h3');heading.tabIndex=-1;headings.set(event.id,heading);list.append(section);}
     for(let day=1;day<=count;day++)for(const event of data){const date=format(y,m,day);if(date<event.starts_on||date>event.ends_on)continue;const b=node('button',event.title);b.type='button';b.className='cal-event';b.setAttribute('aria-label',date+' '+event.title+' 상세 보기');b.onclick=()=>{const href=destination(event);if(href)location.assign(href);else headings.get(event.id).focus();};cells[day-1].append(b);}
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
     const linkType=label(form,'달력에서 일정을 눌렀을 때','select',null,'link_type');
     const course=label(form,'연결할 교육과정','select',null,'link_course');
     const external=label(form,'구글폼 또는 외부 주소','input','url','link_external',false,2000);
     fillOptions(linkType,{none:'달력의 세부 안내 보기',course:'교육과정 소개 페이지로 이동',external:'구글폼·외부 링크로 이동'});
     fillOptions(course,courseNames);
     linkType.value=event.link_type||'none';if(linkType.value==='course')course.value=event.link_target;
     if(linkType.value==='external')external.value=event.link_target;
     const syncLinks=()=>{course.parentElement.hidden=linkType.value!=='course';external.parentElement.hidden=linkType.value!=='external';external.disabled=external.parentElement.hidden;external.required=!external.disabled;};
     linkType.onchange=syncLinks;syncLinks();
     const publish=label(form,'홈페이지에 공개','input','checkbox','published');publish.checked=Boolean(event.published);
     const save=node('button','일정 저장');save.className='edu-button';form.append(save);if(event.id)form.append(btn('새 일정 작성',()=>edit()));
     form.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()]));data.ends_on=data.ends_on||data.starts_on;data.published=publish.checked;data.link_type=linkType.value;data.link_target=data.link_type==='course'?course.value:data.link_type==='external'?external.value.trim():'';if(data.link_type!=='none'&&!destination(data)){status.textContent='올바른 HTTPS 링크를 입력해 주세요.';return;}if(!data.title||data.ends_on<data.starts_on){status.textContent='제목과 시작일·종료일을 확인해 주세요.';return;}save.disabled=true;
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
   await contentAdmin(root,status,user);
   if(owner.data){
     const box=panel(),form=node('form');form.className='edu-form';box.append(node('h2','교육 일정 관리자 설정'),node('p','Supabase에서 이메일 인증을 완료한 계정에 교육 일정 관리 권한을 부여하거나 회수할 수 있습니다.'),form);root.append(box);
     const email=label(form,'관리자 이메일','input','email','admin_email',true);const op=label(form,'권한 작업','select',null,'op');
     for(const [value,name] of [['grant','부여'],['revoke','회수']]){const option=node('option',name);option.value=value;op.append(option);}
     const button=node('button','권한 저장');button.className='edu-button';form.append(button);
     form.onsubmit=async e=>{e.preventDefault();button.disabled=true;const {error}=await db.rpc('mw_edu_set_admin',{account_email:email.value,enabled:op.value==='grant'});button.disabled=false;status.textContent=error?'권한을 변경하지 못했습니다. 이메일 인증 여부를 확인해 주세요.':'교육 일정 관리 권한을 변경했습니다.';if(!error)form.reset();};
   }
 }
 const contentTable='mw_edu_content',photoBucket='mw-edu-photos';
 function fillOptions(select, options){
   for(const [value,title] of Object.entries(options)){const option=node('option',title);option.value=value;select.append(option);}
 }
 async function photoFor(record,box){
   if(!record.photo_path)return;
   const {data}=await db.storage.from(photoBucket).createSignedUrl(record.photo_path,3600);
   if(data?.signedUrl){const img=node('img');img.src=data.signedUrl;img.alt=record.title;img.loading='lazy';box.prepend(img);}
 }
 function paragraphBody(body,container){
   for(const block of body.split(/\n\s*\n/)){
     const lines=block.trim().split('\n');
     if(!lines[0])continue;
     if(lines[0].startsWith('## '))container.append(node('h2',lines.shift().slice(3)));
     if(lines.length){const p=node('p',lines.join('\n'));p.style.whiteSpace='pre-wrap';container.append(p);}
   }
 }
 async function publicContent(){
   const faculty=get('teacher-list'),course=get('course-content'),kind=faculty?'faculty':course.dataset.kind;
   const {data,error}=await db.from(contentTable).select('title,subtitle,body,photo_path').eq('published',true).eq('kind',kind).order('title');
   if(faculty){
     get('teacher-status').textContent=error?'교육진 프로필을 불러오지 못했습니다.':data.length?'':'공개된 교육진 프로필을 준비 중입니다.';
     if(error)return;
     for(const record of data){const card=node('article');card.className='edu-profile';card.append(node('h3',record.title));if(record.subtitle)card.append(node('p',record.subtitle));paragraphBody(record.body,card);faculty.append(card);photoFor(record,card);}
   }else if(!error&&data.length){
     const record=data[0],main=document.querySelector('main');main.querySelector('h1').textContent=record.title;main.querySelector('.edu-page-hero p').textContent=record.subtitle;
     document.title=record.title+' | 무드웰니스 교육협회';
     course.querySelector('#course-default').hidden=Boolean(record.body);
     const box=panel();box.classList.add('edu-profile');if(record.body)paragraphBody(record.body,box);if(record.photo_path||record.body){course.prepend(box);photoFor(record,box);}
   }
 }
 async function contentAdmin(root,status,user){
   const parent=panel(),editor=node('div'),list=node('div');parent.append(node('h2','교육 강사진·교육과정 관리'),editor,list);root.append(parent);
   function edit(record={}){
     editor.replaceChildren(node('h3',record.id?'등록 내용 수정':'새 프로필 또는 과정 안내 등록'));
     const form=node('form');form.className='edu-form';editor.append(form);
     const kind=label(form,'등록 유형','select',null,'kind');
     fillOptions(kind,{faculty:'교육 강사진 프로필',...courseNames});kind.value=record.kind||'faculty';kind.disabled=Boolean(record.id);
     const title=label(form,'이름 또는 과정 제목','input','text','title',true,150);title.value=record.title||'';
     kind.onchange=()=>{if(!title.value||Object.values(courseNames).includes(title.value))title.value=courseNames[kind.value]||'';};
     const subtitle=label(form,'담당 과정·전문 분야 또는 한 줄 소개','input','text','subtitle',false,300);subtitle.value=record.subtitle||'';
     const body=label(form,'프로필 또는 교육과정 상세 내용','textarea',null,'body',false,12000);body.rows=14;body.value=record.body||'';
     form.append(node('p','문단은 빈 줄로 구분하고, 소제목은 줄 앞에 ## 를 붙여 주세요.'));
     const photo=label(form,'사진 첨부 (JPG·PNG·WEBP, 5MB 이하)','input','file','photo');photo.accept='image/jpeg,image/png,image/webp';
     const remove=record.photo_path?label(form,'기존 사진 표시 해제','input','checkbox','remove'):null;
     const publish=label(form,'홈페이지에 공개','input','checkbox','publish');publish.checked=Boolean(record.published);
     const save=node('button','저장');save.className='edu-button';form.append(save,btn('새로 작성',()=>edit()));let uploaded=null,uploadedFile=null;
     form.onsubmit=async e=>{
       e.preventDefault();if(save.disabled)return;
       const file=photo.files[0],extension=file&&{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
       if(!title.value.trim()||(file&&(!extension||file.size>5242880||!file.size))){status.textContent='제목과 사진 형식·크기를 확인해 주세요.';return;}
       save.disabled=true;
       try{
         let path=remove?.checked?null:record.photo_path||null;
         if(file){if(uploadedFile!==file){const key=user.id+'/'+crypto.randomUUID()+'.'+extension;const result=await db.storage.from(photoBucket).upload(key,file,{contentType:file.type});if(result.error)throw result.error;uploaded=key;uploadedFile=file;}path=uploaded;}
         const data={kind:kind.value,title:title.value.trim(),subtitle:subtitle.value.trim(),body:body.value.trim(),photo_path:path,published:publish.checked};
         const result=await (record.id?db.from(contentTable).update(data).eq('id',record.id):db.from(contentTable).insert(data)).select('id').single();
         if(result.error)throw result.error;
         status.textContent='등록 내용을 저장했습니다.';edit();await refresh();
       }catch(error){status.textContent=error.code==='23505'?'이미 등록된 과정입니다. 아래 목록에서 수정해 주세요.':'등록 내용을 저장하지 못했습니다. 입력값과 권한을 확인해 주세요.';}finally{save.disabled=false;}
     };
   }
   async function refresh(){
     const {data,error}=await db.from(contentTable).select('*').order('kind').order('title');
     list.replaceChildren(node('h3','등록된 프로필·과정'));
     if(error){list.append(node('p','등록 목록을 불러오지 못했습니다.'));return;}
     for(const record of data){const row=panel();row.append(node('strong',record.title),node('p',(record.kind==='faculty'?'교육 강사진':'교육과정')+' · '+(record.published?'공개':'비공개')),btn('수정',()=>{edit(record);editor.scrollIntoView({block:'start'});}));list.append(row);}
     for(const [kind,title] of Object.entries(courseNames))if(!data.some(record=>record.kind===kind)){
       const row=panel();row.append(node('strong',title),node('p','기본 과정 안내가 공개되어 있습니다.'),btn('과정 내용 편집',()=>{const source=get('default-'+kind);edit({kind,title,subtitle:source?.dataset.subtitle||'',body:source?.value||''});editor.scrollIntoView({block:'start'});}));list.append(row);
     }
   }
   edit();await refresh();
 }
 if(!db){for(const id of ['calendar-status','admin-status','teacher-status'])if(get(id))get(id).textContent='연결을 불러오지 못했습니다. 새로고침해 주세요.';return;}
 if(get('calendar-grid'))calendar();
 if(get('admin-root'))admin();
 if(get('teacher-list')||get('course-content'))publicContent();
})();