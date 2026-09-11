(function(){
  'use strict';
  const output=document.getElementById('scale-description');
  const buttons=[...document.querySelectorAll('[data-scale]')];
  function description(button){return `${button.dataset.scaleName} · ${button.dataset.connectivity} · Mean size: ${button.dataset.meanSize} blocks`;}
  buttons.forEach(button=>{
    const text=`Scale ${button.dataset.scale}: ${description(button)}`;
    button.title=text;
    button.setAttribute('aria-label',text);
    button.addEventListener('click',()=>{output.textContent=description(button);});
  });
})();
