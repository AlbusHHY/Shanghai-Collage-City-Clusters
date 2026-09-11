(function(){
  'use strict';
  const data=window.URBAN_FORM_DATA;
  if(!data||!window.L||!window.COMMUNITY_MEMBERSHIPS||!window.COMMUNITY_SIZES||!window.VOTING){document.body.innerHTML='<p class="load-error">Map dependencies could not be loaded.</p>';return;}
  const singletonCommunityIds=Object.fromEntries(Object.entries(window.SINGLETON_COMMUNITY_PARCEL_IDS||{}).map(([scale,ids])=>[scale,new Set(ids)]));
  const communityMemberships=window.COMMUNITY_MEMBERSHIPS,communitySizes=window.COMMUNITY_SIZES;
  const map=L.map('map',{zoomControl:true,preferCanvas:false,minZoom:10,maxZoom:19});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(map);
  const palette=['#3f6f8f','#cf775c','#5c9472','#a9789a','#c39b49','#6d83b5','#a35f5f','#58a6a6','#8b795e','#8073ac','#bf8b62','#4f8c69'];
  const state={scale:1,mode:'clusters',buildings:false,selected:null};
  const clusterNames={1:'Park residential',2:'High-rise CBD',3:'Industrial park',4:'Low-rise and low-density',5:'Historical dense district',6:'High-density worker village',7:'Mixed residential',8:'High-rise and high-density',9:'Low-density residential',10:'High-FAR mixed',11:'Extreme-density old residential',12:'High-FAR commercial residential',13:'Fragmented rural low-rise',14:'Fragmented rural high-rise',15:'Other'};
  const clusterLookup={
    1:{CT1:1,CT2:2,CT3:3,CT4:4,CT5:5,CT6:6,CT7:7,CT8:8,CT_EMPTY:15},
    2:{CT2:3,CT7:4,CT8:5,CT1:6,CT3:7,CT5:8,CT4:9,CT6:10,CT9:12,CT_EMPTY:15},
    3:{CT6:1,CT3:2,CT4:3,CT8:4,CT7:6,CT1:9,CT2:10,CT5:11,CT_EMPTY:15},
    4:{CT3:2,CT2:3,CT5:5,CT7:7,CT6:9,CT4:12,CT1:13,CT_EMPTY:15},
    5:{CT8:2,CT1:3,CT7:5,CT9:6,CT5:7,CT2:8,CT3:10,CT4:11,CT10:13,CT6:14,CT_EMPTY:15}
  };
  function clusterMeta(value){const number=clusterLookup[state.scale][value]||15;return{number,name:clusterNames[number]||'Other',code:String(number).padStart(2,'0')};}
  const clusterKey=()=>`cluster_scale_${state.scale}`, entropyKey=()=>`entropy_scale_${state.scale}`;
  const valuesByScale={};
  for(let s=1;s<=5;s++){
    const clusters=[...new Set(data.features.map(f=>f.properties[`cluster_scale_${s}`]).filter(v=>v!==null&&v!==undefined))].sort(naturalSort);
    const entropy=data.features.map(f=>Number(f.properties[`entropy_scale_${s}`])).filter(Number.isFinite);
    valuesByScale[s]={clusters,min:Math.min(...entropy),max:Math.max(...entropy)};
  }
  function naturalSort(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});}
  function clusterColor(v){return palette[(clusterMeta(v).number-1)%palette.length];}
  function lerp(a,b,t){return Math.round(a+(b-a)*t);}
  function entropyColor(v){if(!Number.isFinite(Number(v)))return '#c9ced2';const {min,max}=valuesByScale[state.scale];let t=max===min?0.5:(Number(v)-min)/(max-min);t=Math.max(0,Math.min(1,t));const stops=[[255,255,255],[255,245,190],[255,213,94],[245,157,49],[224,105,25]],p=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p)),q=p-i;return `rgb(${lerp(stops[i][0],stops[i+1][0],q)},${lerp(stops[i][1],stops[i+1][1],q)},${lerp(stops[i][2],stops[i+1][2],q)})`;}
  function communityNumber(feature,scale=state.scale){return Number(communityMemberships[String(scale)]?.[feature.id]||0);}
  function isSelected(feature){return Boolean(state.selected&&state.selected.scale===state.scale&&communityNumber(feature)===state.selected.communityNumber);}
  function style(feature){const p=feature.properties,selected=isSelected(feature),isTransparentSingleton=state.mode==='entropy'&&Number(p[entropyKey()])===0&&singletonCommunityIds[String(state.scale)]?.has(feature.id);return{fillColor:state.mode==='clusters'?clusterColor(p[clusterKey()]):entropyColor(p[entropyKey()]),fillOpacity:isTransparentSingleton?0:(selected ? .92 : .76),color:selected?'#fffaf2':'#f7f9fa',weight:selected?1.35:.45,opacity:selected?1:.85};}
  function infoHtml(feature){const p=feature.properties,c=p[clusterKey()],meta=c==null?null:clusterMeta(c),e=Number(p[entropyKey()]),community=communityNumber(feature);return `<div class="tip-grid"><span>Scale</span><b>Scale ${state.scale}</b><span>Cluster ID</span><b>${String(community).padStart(4,'0')}</b><span>Urban-form type</span><b>${meta?meta.name:'Not available'}</b><span>Cluster Mixing</span><b>${Number.isFinite(e)?e.toFixed(3):'Not available'}</b></div>`;}
  function each(feature,layer){layer.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);selectCommunity(feature,e.latlng);});}
  const geo=L.geoJSON(data,{style,onEachFeature:each,bubblingMouseEvents:false}).addTo(map);
  const mapContainer=map.getContainer();
  let middlePoint=null;
  mapContainer.addEventListener('mousedown',event=>{
    if(event.button!==1)return;
    middlePoint={x:event.clientX,y:event.clientY};
    mapContainer.classList.add('middle-dragging');
    event.preventDefault();
  },true);
  mapContainer.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
  window.addEventListener('mousemove',event=>{
    if(!middlePoint)return;
    const dx=event.clientX-middlePoint.x,dy=event.clientY-middlePoint.y;
    middlePoint={x:event.clientX,y:event.clientY};
    map.panBy([-dx,-dy],{animate:false});
    event.preventDefault();
  });
  window.addEventListener('mouseup',event=>{
    if(event.button!==1)return;
    middlePoint=null;
    mapContainer.classList.remove('middle-dragging');
  });
  window.addEventListener('blur',()=>{
    middlePoint=null;
    mapContainer.classList.remove('middle-dragging');
  });
  map.createPane('boundaryPane');
  map.getPane('boundaryPane').style.zIndex='430';
  map.getPane('boundaryPane').style.pointerEvents='none';
  function makeBoundaryLayer(){return L.geoJSON(window.CLUSTER_BOUNDARIES[String(state.scale)],{pane:'boundaryPane',interactive:false,style:{fill:false,fillOpacity:0,color:'#111111',opacity:.92,weight:2,lineJoin:'round'}}).addTo(map);}
  let boundaryLayer=makeBoundaryLayer();
  map.createPane('selectionPane');
  map.getPane('selectionPane').style.zIndex='440';
  map.getPane('selectionPane').style.pointerEvents='none';
  let selectionLayer=null;
  let selectionInfoTooltip=null;
  function renderSelection(){if(selectionLayer){selectionLayer.remove();selectionLayer=null;}if(!state.selected||state.selected.scale!==state.scale)return;const boundary=window.CLUSTER_BOUNDARIES[String(state.scale)].features[state.selected.communityNumber-1];if(boundary)selectionLayer=L.geoJSON(boundary,{pane:'selectionPane',interactive:false,style:{fill:false,color:'#e85d04',opacity:1,weight:4.5,lineJoin:'round'}}).addTo(map);}
  function renderSelectionInfo(){
    if(selectionInfoTooltip){selectionInfoTooltip.remove();selectionInfoTooltip=null;}
    if(!state.selected||state.selected.scale!==state.scale||!state.selected.feature)return;
    const anchor=state.selected.anchor||(selectionLayer&&selectionLayer.getBounds().getCenter());
    if(!anchor)return;
    selectionInfoTooltip=L.tooltip({permanent:true,interactive:false,direction:'top',offset:[0,-7],className:'research-tooltip cluster-info-tooltip',opacity:.97})
      .setLatLng(anchor)
      .setContent(infoHtml(state.selected.feature))
      .addTo(map);
  }
  function clearSelection(closePanel=true){state.selected=null;renderSelection();renderSelectionInfo();geo.setStyle(style);if(closePanel)window.VOTING.close(false);}
  function selectCommunity(feature,anchor){const number=communityNumber(feature);if(!number)return;const p=feature.properties,meta=clusterMeta(p[clusterKey()]);state.selected={scale:state.scale,communityNumber:number,feature,anchor};geo.setStyle(style);geo.eachLayer(layer=>{if(isSelected(layer.feature))layer.bringToFront();});renderSelection();renderSelectionInfo();window.VOTING.open({scale:state.scale,communityNumber:number,communityId:`S${state.scale}-C${String(number).padStart(4,'0')}`,communitySize:Number(communitySizes[String(state.scale)][number-1]||0),clusterName:meta.name});}
  document.addEventListener('vote-panel-close',()=>clearSelection(false));
  map.on('click',event=>{
    const target=event.originalEvent&&event.originalEvent.target;
    if(target&&typeof target.closest==='function'&&target.closest('.leaflet-interactive'))return;
    clearSelection();
  });
  map.createPane('buildingPane');
  map.getPane('buildingPane').style.zIndex='450';
  map.getPane('buildingPane').style.pointerEvents='none';
  const buildingBounds=L.latLngBounds([[31.1210930,121.3438543],[31.3781337,121.6425914]]);
  const buildingColors={1:'#dadada',2:'#b1b1b1',3:'#808080',4:'#525252',5:'#262626'};
  const buildings=L.vectorGrid.protobuf('data/building_mvt/{z}/{x}/{y}.pbf',{pane:'buildingPane',rendererFactory:L.canvas.tile,minZoom:11,maxZoom:19,maxNativeZoom:16,bounds:buildingBounds,interactive:false,vectorTileLayerStyles:{buildings:function(properties,zoom){return{fill:true,fillColor:buildingColors[properties.height_class]||'#bdbdbd',fillOpacity:.84,stroke:true,color:'#111111',opacity:.82,weight:zoom>=16?.55:zoom>=14?.4:.28};}},attribution:'Building heights: source shapefile'});
  map.fitBounds(geo.getBounds(),{padding:[24,24],maxZoom:14});
  function renderBuildingLegend(){const el=document.getElementById('building-legend');const classes=[['#dadada','≤ 12 m'],['#b1b1b1','> 12–24 m'],['#808080','> 24–50 m'],['#525252','> 50–100 m'],['#262626','> 100 m']];el.hidden=!state.buildings;el.innerHTML=state.buildings?`<div class="legend-title">Building Height</div>${classes.map(([c,l])=>`<div class="legend-row"><i class="swatch" style="background:${c}"></i><span>${l}</span></div>`).join('')}<div class="building-note">347,282 buildings · Height field</div>`:'';document.getElementById('legend').classList.toggle('with-building-legend',state.buildings);}
  function renderLegend(){const el=document.getElementById('legend');let main;if(state.mode==='clusters'){main='<div class="legend-title">Urban Form Cluster</div>'+valuesByScale[state.scale].clusters.map(v=>({v,meta:clusterMeta(v)})).filter(({meta})=>meta.number!==15).sort((a,b)=>a.meta.number-b.meta.number).map(({v,meta})=>`<div class="legend-row"><i class="swatch" style="background:${clusterColor(v)}"></i><span class="cluster-code">${meta.code}</span><span>${meta.name}</span></div>`).join('');}else{const {min,max}=valuesByScale[state.scale],mid=(min+max)/2;main=`<div class="legend-title">Cluster Mixing</div><div class="gradient"></div><div class="gradient-levels"><span>Low</span><span>Moderate</span><span>High</span></div><div class="gradient-labels"><span>${min.toFixed(3)}</span><span>${mid.toFixed(3)}</span><span>${max.toFixed(3)}</span></div><div class="mixing-note">Low = more homogeneous · High = more mixed</div><div class="singleton-note"><i class="swatch singleton-swatch"></i><span>Single-block cluster (mixing = 0)</span></div>`;}el.innerHTML=`<div class="legend-section">${main}</div>`;renderBuildingLegend();}
  function update(){geo.setStyle(style);renderSelectionInfo();renderLegend();document.getElementById('status').textContent=`Scale ${state.scale} · ${state.mode==='clusters'?'Urban Form Clusters':'Cluster Mixing'}`;}
  function activate(selector,button){document.querySelectorAll(selector).forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  document.querySelectorAll('[data-scale]').forEach(b=>b.addEventListener('click',()=>{clearSelection(false);state.scale=Number(b.dataset.scale);window.VOTING.close(false);activate('[data-scale]',b);boundaryLayer.remove();boundaryLayer=makeBoundaryLayer();update();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;activate('[data-mode]',b);update();}));
  const building2DToggle=document.getElementById('building-2d-toggle');
  const building3DToggle=document.getElementById('building-3d-toggle');
  building2DToggle.addEventListener('click',()=>{state.buildings=!state.buildings;if(state.buildings){buildings.addTo(map);}else{buildings.remove();}building2DToggle.classList.toggle('active',state.buildings);building2DToggle.setAttribute('aria-pressed',String(state.buildings));building2DToggle.lastChild.textContent=state.buildings?' 2D Buildings Visible':' 2D Buildings Hidden';renderLegend();});
  building3DToggle.disabled=true;
  building3DToggle.setAttribute('aria-disabled','true');
  building3DToggle.title='Configure a Mapbox public token to use 3D buildings.';
  building3DToggle.lastChild.textContent=' 3D Requires Mapbox';
  renderLegend();window.__MAP_TEST__={map,geo,state,valuesByScale,update,selectCommunity,clearSelection};
})();
