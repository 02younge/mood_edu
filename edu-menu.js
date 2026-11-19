(() => {
  const trigger=document.querySelector('[data-edu-menu-open]');
  const drawer=document.getElementById('edu-navigation-drawer');
  const backdrop=document.querySelector('[data-edu-menu-backdrop]');
  const closeButton=drawer?.querySelector('[data-edu-menu-close]');
  if(!trigger||!drawer||!backdrop||!closeButton)return;
  let lastFocus=null;
  const open=()=>{
    lastFocus=document.activeElement;
    document.body.classList.add('edu-drawer-open');
    trigger.setAttribute('aria-expanded','true');
    drawer.setAttribute('aria-hidden','false');
    drawer.inert=false;
    closeButton.focus();
  };
  const close=()=>{
    document.body.classList.remove('edu-drawer-open');
    trigger.setAttribute('aria-expanded','false');
    drawer.setAttribute('aria-hidden','true');
    drawer.inert=true;
    if(lastFocus?.isConnected)lastFocus.focus();
  };
  trigger.addEventListener('click',open);
  closeButton.addEventListener('click',close);
  backdrop.addEventListener('click',close);
  drawer.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  document.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('edu-drawer-open'))return;
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='Tab'){
      const candidates=[...drawer.querySelectorAll('button,a[href]')].filter(x=>!x.disabled);
      const first=candidates[0],last=candidates[candidates.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  drawer.inert=true;
})();
