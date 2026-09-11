(function(){
  'use strict';
  const config=window.MAPBOX_CONFIG||{};
  const token=String(config.accessToken||'').trim();
  const useMapbox=config.enabled!==false&&/^pk\.[A-Za-z0-9._-]+$/.test(token);

  function loadScript(source,onLoad,onError){
    const script=document.createElement('script');
    script.src=source;
    script.onload=onLoad||null;
    script.onerror=onError||null;
    document.body.appendChild(script);
  }

  function loadLeafletFallback(){
    document.documentElement.dataset.mapEngine='leaflet';
    loadScript('js/map.js');
  }

  if(!useMapbox){
    console.info('Mapbox public token is not configured; using the Leaflet fallback map.');
    loadLeafletFallback();
    return;
  }

  document.documentElement.dataset.mapEngine='mapbox';
  const startMapbox=()=>loadScript('js/mapbox_map.js',null,loadLeafletFallback);
  if(window.mapboxgl){startMapbox();return;}
  loadScript('https://api.mapbox.com/mapbox-gl-js/v3.30.0/mapbox-gl.js',startMapbox,()=>{
    console.warn('Mapbox GL JS could not be loaded; using the Leaflet fallback map.');
    loadLeafletFallback();
  });
})();
