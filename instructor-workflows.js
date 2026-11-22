(() => {
  const fields = [
    ['name','공개 활동명','text',80,true],
    ['specialty','전문 분야','text',160,true],
    ['course','수료 과정명과 기수 또는 수료 시기','text',200,true],
    ['bio','강사 소개','textarea',3000,true],
    ['website','공개할 SNS 또는 문의 주소 (선택)','url',500,false]
  ];
  const labels = {pending:'검토 대기',approved:'승인됨',changes:'수정 필요',new:'접수',contacted:'연락 완료',closed:'검토 종료'};
  const make = (tag,text) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function input(form,title,name,type,max,required) {
    const label = make('label',title);
    const field = make(type === 'textarea' ? type : 'input');
    if (type !== 'textarea') field.type = type;
    field.name = name;
    if (max) field.maxLength = max;
    field.required = required;
    if (type === 'url') field.pattern = 'https://.+';
    label.append(field);
    form.append(label);
    return field;
  }
  function button(text,action) {
    const element = make('button',text);
    element.className = 'edu-button';
    element.type = action ? 'button' : 'submit';
    if (action) element.onclick = action;
    return element;
  }
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  const photoBucket = 'mw-graduate-photos';
  const photoTypes = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  function profileImage(url, alt) {
    const image = make('img');
    image.src = url;
    image.alt = alt;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => image.remove();
    return image;
  }
  async function showPhotos(db, profile, cover, gallery) {
    const paths = [profile.cover_path,...(profile.gallery_paths || [])].filter(Boolean);
    const legacy = safeUrl(profile.photo);
    if (!paths.length) {
      if (legacy) cover.append(profileImage(legacy,profile.name+' 프로필'));
      return;
    }
    const {data,error} = await db.storage.from(photoBucket).createSignedUrls(paths,900);
    if (error) {
      gallery.textContent = '사진을 불러오지 못했습니다.';
      return;
    }
    if (!profile.cover_path && legacy) cover.append(profileImage(legacy,profile.name+' 프로필'));
    for (const result of data) {
      if (!result.signedUrl) continue;
      const representative = result.path === profile.cover_path;
      (representative ? cover : gallery).append(profileImage(result.signedUrl,
        representative ? profile.name+' 프로필' : profile.name+' 활동 사진'));
    }
  }
  function photoFields(db, form, previous) {
    const cover = input(form,'대표 사진 1장 (선택)','cover_file','file',undefined,false);
    const gallery = input(form,'교육·활동 사진 추가 (최대 6장)','gallery_files','file',undefined,false);
    cover.accept = gallery.accept = Object.keys(photoTypes).join(',');
    gallery.multiple = true;
    form.append(make('p','사진 한 장당 최대 5MB · JPG, PNG, WEBP'));
    const keptCover = previous.cover_path || previous.photo
      ? input(form,'기존 대표 사진 삭제','remove_cover','checkbox',undefined,false) : null;
    const keptGallery = (previous.gallery_paths || []).map((path,index) => ({
      path, remove:input(form,'기존 추가 사진 '+(index+1)+' 삭제','remove_gallery','checkbox',undefined,false)
    }));
    if (keptCover || keptGallery.length) {
      const preview = make('div');
      const portrait = make('div');
      const images = make('div');
      portrait.className = 'graduate-cover';
      images.className = 'graduate-gallery';
      preview.append(make('p','현재 등록한 사진'),portrait,images);
      form.append(preview);
      showPhotos(db,previous,portrait,images);
    }
    const uploaded = new WeakMap();
    return async userId => {
      const files = [...gallery.files];
      const keep = keptGallery.filter(item => !item.remove.checked).map(item => item.path);
      if (files.length + keep.length > 6) throw Error('추가 사진은 기존 사진을 포함해 최대 6장입니다.');
      const nextCover = cover.files[0];
      for (const file of [nextCover,...files].filter(Boolean)) {
        if (!Object.hasOwn(photoTypes,file.type) || file.size === 0 || file.size > 5242880) {
          throw Error('사진은 5MB 이하의 JPG·PNG·WEBP 파일을 선택해 주세요.');
        }
      }
      async function upload(file) {
        if (uploaded.has(file)) return uploaded.get(file);
        const path = userId+'/'+crypto.randomUUID()+'.'+photoTypes[file.type];
        const {error} = await db.storage.from(photoBucket).upload(path,file,{contentType:file.type});
        if (error) throw Error('사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.');
        uploaded.set(file,path);
        return path;
      }
      const coverPath = nextCover ? await upload(nextCover) : keptCover?.checked ? '' : previous.cover_path || '';
      for (const file of files) keep.push(await upload(file));
      return {cover_path:coverPath, gallery_paths:keep, photo:coverPath || keptCover?.checked ? '' : previous.photo || ''};
    };
  }
  function card(db,profile,review = false) {
    const article = make('article');
    article.className = 'edu-panel';
    const cover = make('div');
    const gallery = make('div');
    cover.className = 'graduate-cover';
    gallery.className = 'graduate-gallery';
    article.append(cover);
    article.append(make('h3',profile.name),make('p',profile.specialty),make('p',profile.course),make('pre',profile.bio));
    const url = safeUrl(profile.website);
    if (url) {
      const link = make('a','강사 SNS·문의');
      link.href = url;
      link.rel = 'noreferrer';
      link.target = '_blank';
      article.append(link);
    }
    article.append(gallery);
    showPhotos(db,review ? {...profile,photo:''} : profile,cover,gallery);
    return article;
  }
  async function directory() {
    const root = document.getElementById('graduate-editor');
    if (!root) return;
    const list = document.getElementById('verified-directory');
    const message = document.getElementById('graduate-status');
    const db = window.supabase?.createClient(
      'https://hmdlrjzgzefuylfljdlc.supabase.co',
      'sb_publishable_n7kO1KIYQGuGoH4RZ6E0Ww_FRQZpEqW',
      {auth:{storageKey:'mw-graduate-auth'}}
    );
    if (!db) {
      list.textContent = '연결을 불러오지 못했습니다. 새로고침해 주세요.';
      return;
    }
    async function loadPublic() {
      const {data,error} = await db.from('mw_edu_directory').select('id,profile').order('id');
      list.replaceChildren();
      if (error || !data.length) {
        list.textContent = error ? '강사 목록을 불러오지 못했습니다.' : '아직 공개된 강사 프로필이 없습니다.';
        return;
      }
      list.append(...data.map(row => card(db,row.profile)));
    }
    async function loadEditor() {
      root.replaceChildren();
      const {data:{user}} = await db.auth.getUser();
      const form = make('form');
      form.className = 'edu-form';
      root.append(form);
      if (!user) {
        const email = input(form,'이메일','email','email',254,true);
        email.autocomplete = 'email';
        const password = input(form,'비밀번호 (6자 이상)','password','password',128,true);
        password.minLength = 6;
        const login = button('로그인');
        const register = button('계정 만들기');
        register.value = 'register';
        form.append(login,register);
        form.onsubmit = async event => {
          event.preventDefault();
          const credentials = {email:email.value.trim(),password:password.value};
          const signup = event.submitter === register;
          const options = {emailRedirectTo:new URL('./directory.html',location.href).href};
          login.disabled = register.disabled = true;
          const {data,error} = signup
            ? await db.auth.signUp({...credentials,options})
            : await db.auth.signInWithPassword(credentials);
          login.disabled = register.disabled = false;
          if (error) { message.textContent = '계정을 확인할 수 없습니다. 이메일과 비밀번호를 확인해 주세요.'; return; }
          if (signup && !data.session) {
            message.textContent = '이메일에서 가입 확인 링크를 누른 뒤 이 페이지에서 로그인해 주세요.';
            return;
          }
          message.textContent = '';
          await loadEditor();
        };
        return;
      }
      root.prepend(button('로그아웃',async () => {
        await db.auth.signOut();
        message.textContent = '';
        await loadEditor();
      }));
      const {data,error} = await db.from('mw_edu_profile_submissions')
        .select('profile,status,note,revision').eq('user_id',user.id).maybeSingle();
      if (error) {
        form.remove();
        message.textContent = '내 프로필을 불러오지 못했습니다. 새로고침해 주세요.';
        return;
      }
      if (data) form.append(make('p',labels[data.status] + (data.note ? ' · '+data.note : '')));
      for (const [key,title,type,max,required] of fields) {
        input(form,title,key,type,max,required).value = data?.profile[key] ?? '';
      }
      const savePhotos = photoFields(db,form,data?.profile || {});
      const consent = make('label');
      const checkbox = make('input');
      checkbox.type = 'checkbox';
      checkbox.required = true;
      consent.append(checkbox,document.createTextNode(' 승인 후 위 정보가 강사 디렉토리에 공개되는 데 동의합니다.'));
      form.append(consent);
      const submit = button('공개 승인 요청');
      form.append(submit);
      form.onsubmit = async event => {
        event.preventDefault();
        submit.disabled = true;
        message.textContent = '프로필과 사진을 저장하는 중입니다.';
        try {
          const values = new FormData(form);
          const profile = Object.fromEntries(fields.map(([key]) => [key,values.get(key).trim()]));
          if (fields.some(([key,,,,required]) => required && !profile[key])) {
            message.textContent = '필수 항목을 입력해 주세요.';
            return;
          }
          Object.assign(profile,await savePhotos(user.id));
          const submissions = db.from('mw_edu_profile_submissions');
          const save = data
            ? submissions.update({profile}).eq('user_id',user.id).eq('revision',data.revision)
            : submissions.insert({user_id:user.id,profile});
          const result = await save.select('revision').single();
          message.textContent = result.error ? '프로필을 저장하지 못했습니다. 입력 내용을 확인해 주세요.' : '검토 요청을 접수했습니다.';
          if (!result.error) await loadEditor();
        } catch (error) {
          message.textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      };
    }
    await Promise.all([loadPublic(),loadEditor()]);
  }

  window.renderInstructorWorkflows = async (db,root) => {
    const message = make('p');
    message.setAttribute('role','status');
    const profiles = make('div');
    const applications = make('div');
    root.append(make('h2','수료 강사 프로필 검토'),profiles,make('h2','스튜디오 공식 강사 지원'),applications,message);
    async function refresh() {
      const [submissions,incoming] = await Promise.all([
        db.from('mw_edu_profile_submissions').select('user_id,profile,status,note,revision'),
        db.from('mw_instructor_applications').select('*').order('received_at',{ascending:false})
      ]);
      profiles.replaceChildren();
      applications.replaceChildren();
      if (submissions.error || incoming.error) message.textContent = '일부 목록을 불러오지 못했습니다.';
      if (!submissions.error && !submissions.data.length) profiles.textContent = '제출된 강사 프로필이 없습니다.';
      if (!incoming.error && !incoming.data.length) applications.textContent = '접수된 공식 강사 지원서가 없습니다.';
      for (const row of (submissions.data || []).sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending'))) {
        const article = card(db,row.profile,true);
        article.append(make('p',labels[row.status] + (row.note ? ' · '+row.note : '')));
        const actions = make('div');
        actions.className = 'edu-actions';
        const review = async (decision, feedback = '') => {
          const {error} = await db.rpc('mw_review_edu_profile',{
            candidate:row.user_id,expected_revision:row.revision,decision,feedback
          });
          message.textContent = error ? '프로필을 처리하지 못했습니다. 목록을 다시 확인해 주세요.' : '프로필 상태를 변경했습니다.';
          await refresh();
        };
        if (row.status === 'pending') {
          actions.append(button('수료 확인 후 승인·공개',() => {
            if (confirm('협회 수료 이력을 확인했고 이 프로필을 공개할까요?')) return review('approved');
          }),button('수정 요청',() => {
            const feedback = prompt('강사에게 전달할 수정 내용을 입력해 주세요. (최대 500자)')?.trim();
            if (feedback && feedback.length <= 500) return review('changes',feedback);
          }));
        }
        actions.append(button('공개 내리기',() => {
          if (confirm('디렉토리에서 이 프로필을 내릴까요?')) return review('hide','프로필 공개가 해제되었습니다.');
        }));
        article.append(actions);
        profiles.append(article);
      }
      for (const row of incoming.data || []) {
        const article = make('article');
        article.className = 'edu-panel';
        article.append(
          make('h3',row.name+' · '+row.specialty),
          make('p',(row.graduate?'무드웰니스 수료생':'외부 강사')+' · '+row.email),
          make('pre',row.background),
          make('pre',row.proposal),
          make('p','가능 시간 · '+row.availability)
        );
        const url = safeUrl(row.website);
        if (url) {
          const link = make('a','포트폴리오 보기');
          link.href = url;
          link.rel = 'noreferrer';
          link.target = '_blank';
          article.append(link);
        }
        const form = make('form');
        form.className = 'edu-form';
        const label = make('label','지원서 검토 상태');
        const select = make('select');
        for (const state of ['new','contacted','closed']) select.add(new Option(labels[state],state));
        select.value = row.status;
        label.append(select);
        const save = button('상태 저장');
        form.append(label,save);
        form.onsubmit = async event => {
          event.preventDefault();
          save.disabled = true;
          const {data,error} = await db.from('mw_instructor_applications').update({status:select.value}).eq('id',row.id).select('id');
          message.textContent = error || !data?.length ? '상태를 저장하지 못했습니다.' : '지원서 상태를 저장했습니다.';
          save.disabled = false;
        };
        article.append(form);
        applications.append(article);
      }
    }
    await refresh();
  };
  directory();
})();
