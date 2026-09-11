(function(){
  'use strict';
  const data=window.URBAN_FORM_DATA;
  const config=window.MAPBOX_CONFIG||{};
  if(!data||!window.mapboxgl||!window.COMMUNITY_MEMBERSHIPS||!window.COMMUNITY_SIZES||!window.CLUSTER_BOUNDARIES||!window.VOTING){
    document.body.innerHTML='<p class="load-error">Mapbox map dependencies could not be loaded.</p>';
    return;
  }

  const communityMemberships=window.COMMUNITY_MEMBERSHIPS;
  const communitySizes=window.COMMUNITY_SIZES;
  const singletonCommunityIds=Object.fromEntries(Object.entries(window.SINGLETON_COMMUNITY_PARCEL_IDS||{}).map(([scale,ids])=>[scale,new Set(ids.map(Number))]));
  const state={scale:1,mode:'clusters',buildings2D:Boolean(config.buildings2DVisible),buildings3D:Boolean(config.buildings3DVisible),selected:null};
  const palette=['#3f6f8f','#cf775c','#5c9472','#a9789a','#c39b49','#6d83b5','#a35f5f','#58a6a6','#8b795e','#8073ac','#bf8b62','#4f8c69'];
  const entropyStops=['#ffffff','#fff5be','#ffd55e','#f59d31','#e06919'];
  const clusterNames={1:'Park residential',2:'High-rise CBD',3:'Industrial park',4:'Low-rise and low-density',5:'Historical dense district',6:'High-density worker village',7:'Mixed residential',8:'High-rise and high-density',9:'Low-density residential',10:'High-FAR mixed',11:'Extreme-density old residential',12:'High-FAR commercial residential',13:'Fragmented rural low-rise',14:'Fragmented rural high-rise',15:'Other'};
  const clusterLookup={
    1:{CT1:1,CT2:2,CT3:3,CT4:4,CT5:5,CT6:6,CT7:7,CT8:8,CT_EMPTY:15},
    2:{CT2:3,CT7:4,CT8:5,CT1:6,CT3:7,CT5:8,CT4:9,CT6:10,CT9:12,CT_EMPTY:15},
    3:{CT6:1,CT3:2,CT4:3,CT8:4,CT7:6,CT1:9,CT2:10,CT5:11,CT_EMPTY:15},
    4:{CT3:2,CT2:3,CT5:5,CT7:7,CT6:9,CT4:12,CT1:13,CT_EMPTY:15},
    5:{CT8:2,CT1:3,CT7:5,CT9:6,CT5:7,CT2:8,CT3:10,CT4:11,CT10:13,CT6:14,CT_EMPTY:15}
  };

  function naturalSort(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});}
  function clusterMeta(value){const number=clusterLookup[state.scale][value]||15;return{number,name:clusterNames[number]||'Other',code:String(number).padStart(2,'0')};}
  const clusterKey=()=>`cluster_scale_${state.scale}`;
  const entropyKey=()=>`entropy_scale_${state.scale}`;
  const communityKey=()=>`_community_${state.scale}`;
  const singletonKey=()=>`_singleton_${state.scale}`;
  function clusterColor(value){return palette[(clusterMeta(value).number-1)%palette.length];}

  data.features.forEach((feature,index)=>{
    const featureId=Number.isFinite(Number(feature.id))?Number(feature.id):index;
    feature.id=featureId;
    feature.properties=feature.properties||{};
    for(let scale=1;scale<=5;scale++){
      feature.properties[`_community_${scale}`]=Number(communityMemberships[String(scale)]?.[featureId]||0);
      feature.properties[`_singleton_${scale}`]=singletonCommunityIds[String(scale)]?.has(featureId)?1:0;
    }
  });

  const boundariesByScale={};
  for(let scale=1;scale<=5;scale++){
    const collection=window.CLUSTER_BOUNDARIES[String(scale)];
    collection.features.forEach((feature,index)=>{
      feature.id=index+1;
      feature.properties={...(feature.properties||{}),_community_number:index+1};
    });
    boundariesByScale[String(scale)]=collection;
  }

  const valuesByScale={};
  for(let scale=1;scale<=5;scale++){
    const clusters=[...new Set(data.features.map(feature=>feature.properties[`cluster_scale_${scale}`]).filter(value=>value!==null&&value!==undefined))].sort(naturalSort);
    const entropy=data.features.map(feature=>Number(feature.properties[`entropy_scale_${scale}`])).filter(Number.isFinite);
    valuesByScale[scale]={clusters,min:Math.min(...entropy),max:Math.max(...entropy)};
  }

  window.mapboxgl.accessToken=String(config.accessToken).trim();
  const map=new mapboxgl.Map({
    container:'map',
    style:config.style||'mapbox://styles/mapbox/standard',
    config:{basemap:{
      theme:config.theme||'monochrome',
      lightPreset:config.lightPreset||'day',
      showPlaceLabels:config.showPlaceLabels!==false,
      showRoadLabels:config.showRoadLabels!==false,
      showPointOfInterestLabels:Boolean(config.showPointOfInterestLabels),
      showTransitLabels:Boolean(config.showTransitLabels),
      show3dObjects:state.buildings3D,
      show3dBuildings:state.buildings3D,
      show3dTrees:false,
      show3dLandmarks:false,
      show3dFacades:state.buildings3D
    }},
    center:[121.49,31.23],
    zoom:11.5,
    pitch:state.buildings3D?Number(config.buildingPitch||42):0,
    bearing:0,
    minZoom:10,
    maxZoom:19,
    antialias:true,
    projection:'mercator'
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new mapboxgl.NavigationControl({showCompass:false,visualizePitch:false}),'top-left');

  function extendBounds(bounds,coordinates){
    if(!Array.isArray(coordinates))return;
    if(typeof coordinates[0]==='number'){bounds.extend(coordinates);return;}
    coordinates.forEach(part=>extendBounds(bounds,part));
  }
  function collectionBounds(collection){const bounds=new mapboxgl.LngLatBounds();collection.features.forEach(feature=>extendBounds(bounds,feature.geometry.coordinates));return bounds;}
  function featureCenter(feature){const bounds=new mapboxgl.LngLatBounds();extendBounds(bounds,feature.geometry.coordinates);return bounds.isEmpty()?null:bounds.getCenter();}
  function communityNumber(feature){return Number(feature.properties?.[communityKey()]||0);}
  function infoHtml(feature){const properties=feature.properties||{},cluster=properties[clusterKey()],meta=cluster==null?null:clusterMeta(cluster),entropy=Number(properties[entropyKey()]),community=communityNumber(feature);return `<div class="tip-grid"><span>Scale</span><b>Scale ${state.scale}</b><span>Cluster ID</span><b>${String(community).padStart(4,'0')}</b><span>Urban-form type</span><b>${meta?meta.name:'Not available'}</b><span>Cluster Mixing</span><b>${Number.isFinite(entropy)?entropy.toFixed(3):'Not available'}</b></div>`;}

  function clusterColorExpression(){
    const expression=['match',['get',clusterKey()]];
    valuesByScale[state.scale].clusters.forEach(value=>expression.push(value,clusterColor(value)));
    expression.push('#c9ced2');
    return expression;
  }
  function entropyColorExpression(){
    const {min,max}=valuesByScale[state.scale];
    if(max===min)return entropyStops[2];
    const expression=['interpolate',['linear'],['to-number',['get',entropyKey()],min]];
    entropyStops.forEach((color,index)=>expression.push(min+(max-min)*(index/(entropyStops.length-1)),color));
    return expression;
  }
  function fillOpacityExpression(){
    const singleton=['all',['==',['get',singletonKey()],1],['==',['to-number',['get',entropyKey()],-1],0]];
    if(!state.selected||state.selected.scale!==state.scale)return state.mode==='entropy'?['case',singleton,0,.76]:.76;
    const selected=['==',['get',communityKey()],state.selected.communityNumber];
    return state.mode==='entropy'?['case',singleton,0,selected,.92,.76]:['case',selected,.92,.76];
  }
  function selectedParcelFilter(){return state.selected&&state.selected.scale===state.scale?['==',['get',communityKey()],state.selected.communityNumber]:['==',['get',communityKey()],-1];}
  function selectedBoundaryFilter(){return state.selected&&state.selected.scale===state.scale?['==',['get','_community_number'],state.selected.communityNumber]:['==',['get','_community_number'],-1];}

  let selectionInfoPopup=null;
  function renderSelectionInfo(){
    if(selectionInfoPopup){selectionInfoPopup.remove();selectionInfoPopup=null;}
    if(!state.selected||state.selected.scale!==state.scale||!state.selected.feature)return;
    const boundary=boundariesByScale[String(state.scale)].features[state.selected.communityNumber-1];
    const anchor=state.selected.anchor||(boundary&&featureCenter(boundary));
    if(!anchor)return;
    selectionInfoPopup=new mapboxgl.Popup({closeButton:false,closeOnClick:false,className:'cluster-info-popup',offset:9,maxWidth:'none'})
      .setLngLat(anchor)
      .setHTML(infoHtml(state.selected.feature))
      .addTo(map);
  }
  function renderSelection(){
    if(!map.getLayer('selected-parcel-lines'))return;
    map.setFilter('selected-parcel-lines',selectedParcelFilter());
    map.setFilter('selected-community-boundary',selectedBoundaryFilter());
  }
  function clearSelection(closePanel=true){state.selected=null;renderSelection();renderSelectionInfo();if(map.getLayer('parcel-fill'))map.setPaintProperty('parcel-fill','fill-opacity',fillOpacityExpression());if(closePanel)window.VOTING.close(false);}
  function selectCommunity(feature,anchor){
    const number=communityNumber(feature);
    if(!number)return;
    const properties=feature.properties||{},meta=clusterMeta(properties[clusterKey()]);
    state.selected={scale:state.scale,communityNumber:number,feature,anchor};
    map.setPaintProperty('parcel-fill','fill-opacity',fillOpacityExpression());
    renderSelection();
    renderSelectionInfo();
    window.VOTING.open({scale:state.scale,communityNumber:number,communityId:`S${state.scale}-C${String(number).padStart(4,'0')}`,communitySize:Number(communitySizes[String(state.scale)][number-1]||0),clusterName:meta.name});
  }

  function renderBuildingLegend(){
    const element=document.getElementById('building-legend');
    const active=state.buildings2D||state.buildings3D;
    element.hidden=!active;
    const rows=[];
    if(state.buildings2D)rows.push(`<div class="legend-row"><i class="swatch" style="background:${config.buildingColor||'#c9cdd0'}"></i><span>2D building footprints</span></div>`);
    if(state.buildings3D)rows.push('<div class="legend-row"><i class="swatch" style="background:#d7d7d7"></i><span>Mapbox Standard 3D buildings</span></div>');
    element.innerHTML=active?`<div class="legend-title">Building Layers</div>${rows.join('')}<div class="building-note">Mapbox data · all available buildings from zoom 16</div>`:'';
    document.getElementById('legend').classList.toggle('with-building-legend',active);
  }
  function renderLegend(){
    const element=document.getElementById('legend');
    let main;
    if(state.mode==='clusters'){
      main='<div class="legend-title">Urban Form Cluster</div>'+valuesByScale[state.scale].clusters.map(value=>({value,meta:clusterMeta(value)})).filter(({meta})=>meta.number!==15).sort((a,b)=>a.meta.number-b.meta.number).map(({value,meta})=>`<div class="legend-row"><i class="swatch" style="background:${clusterColor(value)}"></i><span class="cluster-code">${meta.code}</span><span>${meta.name}</span></div>`).join('');
    }else{
      const {min,max}=valuesByScale[state.scale],mid=(min+max)/2;
      main=`<div class="legend-title">Cluster Mixing</div><div class="gradient"></div><div class="gradient-levels"><span>Low</span><span>Moderate</span><span>High</span></div><div class="gradient-labels"><span>${min.toFixed(3)}</span><span>${mid.toFixed(3)}</span><span>${max.toFixed(3)}</span></div><div class="mixing-note">Low = more homogeneous · High = more mixed</div><div class="singleton-note"><i class="swatch singleton-swatch"></i><span>Single-block cluster (mixing = 0)</span></div>`;
    }
    element.innerHTML=`<div class="legend-section">${main}</div>`;
    renderBuildingLegend();
  }
  function update(){
    if(!map.getLayer('parcel-fill'))return;
    map.setPaintProperty('parcel-fill','fill-color',state.mode==='clusters'?clusterColorExpression():entropyColorExpression());
    map.setPaintProperty('parcel-fill','fill-opacity',fillOpacityExpression());
    renderSelection();
    renderSelectionInfo();
    renderLegend();
    document.getElementById('status').textContent=`Scale ${state.scale} · ${state.mode==='clusters'?'Urban Form Clusters':'Cluster Mixing'} · Mapbox`;
  }
  function activate(selector,button){document.querySelectorAll(selector).forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});}
  function applyBuildingVisibility(animate=true){
    const properties={show3dObjects:state.buildings3D,show3dBuildings:state.buildings3D,show3dTrees:false,show3dLandmarks:false,show3dFacades:state.buildings3D};
    Object.entries(properties).forEach(([name,value])=>{try{map.setConfigProperty('basemap',name,value);}catch(error){console.warn(`Mapbox basemap option ${name} is unavailable.`,error);}});
    if(map.getLayer('mapbox-building-2d'))map.setLayoutProperty('mapbox-building-2d','visibility',state.buildings2D?'visible':'none');
    map.easeTo({pitch:state.buildings3D?Number(config.buildingPitch||42):0,duration:animate?500:0});
    const button2D=document.getElementById('building-2d-toggle'),button3D=document.getElementById('building-3d-toggle');
    button2D.classList.toggle('active',state.buildings2D);
    button2D.setAttribute('aria-pressed',String(state.buildings2D));
    button2D.lastChild.textContent=state.buildings2D?' 2D Buildings Visible':' 2D Buildings Hidden';
    button3D.classList.toggle('active',state.buildings3D);
    button3D.setAttribute('aria-pressed',String(state.buildings3D));
    button3D.lastChild.textContent=state.buildings3D?' 3D Buildings Visible':' 3D Buildings Hidden';
    renderBuildingLegend();
  }

  function installMiddleMousePan(){
    const container=map.getContainer(),canvas=map.getCanvas();
    let middlePoint=null;
    canvas.addEventListener('mousedown',event=>{if(event.button!==1)return;middlePoint={x:event.clientX,y:event.clientY};container.classList.add('mapbox-middle-dragging');event.preventDefault();},true);
    canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
    window.addEventListener('mousemove',event=>{if(!middlePoint)return;const dx=event.clientX-middlePoint.x,dy=event.clientY-middlePoint.y;middlePoint={x:event.clientX,y:event.clientY};map.panBy([-dx,-dy],{duration:0});event.preventDefault();});
    window.addEventListener('mouseup',event=>{if(event.button!==1)return;middlePoint=null;container.classList.remove('mapbox-middle-dragging');});
    window.addEventListener('blur',()=>{middlePoint=null;container.classList.remove('mapbox-middle-dragging');});
  }

  map.on('load',()=>{
    map.addSource('research-parcels',{type:'geojson',data});
    map.addSource('community-boundaries',{type:'geojson',data:boundariesByScale[String(state.scale)]});
    map.addSource('mapbox-building-source',{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8'});
    map.addLayer({id:'parcel-fill',type:'fill',source:'research-parcels',slot:'middle',paint:{'fill-color':clusterColorExpression(),'fill-opacity':fillOpacityExpression(),'fill-emissive-strength':.35}});
    map.addLayer({
      id:'mapbox-building-2d',
      type:'fill',
      source:'mapbox-building-source',
      'source-layer':'building',
      slot:'top',
      minzoom:Number(config.buildingMinZoom||13),
      layout:{visibility:state.buildings2D?'visible':'none'},
      paint:{
        'fill-color':config.buildingColor||'#c9cdd0',
        'fill-outline-color':'#858d92',
        'fill-opacity':.62,
        'fill-emissive-strength':.25
      }
    });
    map.addLayer({id:'parcel-outlines',type:'line',source:'research-parcels',slot:'top',paint:{'line-color':'#f7f9fa','line-width':.45,'line-opacity':.85,'line-emissive-strength':.35}});
    map.addLayer({id:'selected-parcel-lines',type:'line',source:'research-parcels',slot:'top',filter:selectedParcelFilter(),paint:{'line-color':'#fffaf2','line-width':1.35,'line-opacity':1,'line-emissive-strength':.5}});
    map.addLayer({id:'community-boundaries',type:'line',source:'community-boundaries',slot:'top',paint:{'line-color':'#111111','line-width':2,'line-opacity':.92,'line-emissive-strength':.25}});
    map.addLayer({id:'selected-community-boundary',type:'line',source:'community-boundaries',slot:'top',filter:selectedBoundaryFilter(),paint:{'line-color':'#e85d04','line-width':4.5,'line-opacity':1,'line-emissive-strength':.5}});
    map.fitBounds(collectionBounds(data),{padding:24,maxZoom:14,duration:0});

    map.on('click','parcel-fill',event=>{if(event.features&&event.features[0])selectCommunity(event.features[0],event.lngLat);});
    map.on('mouseenter','parcel-fill',()=>map.getCanvas().classList.add('parcel-hover'));
    map.on('mouseleave','parcel-fill',()=>map.getCanvas().classList.remove('parcel-hover'));
    map.on('click',event=>{if(map.queryRenderedFeatures(event.point,{layers:['parcel-fill']}).length)return;clearSelection();});
    document.addEventListener('vote-panel-close',()=>clearSelection(false));

    document.querySelectorAll('[data-scale]').forEach(button=>button.addEventListener('click',()=>{clearSelection(false);state.scale=Number(button.dataset.scale);window.VOTING.close(false);activate('[data-scale]',button);map.getSource('community-boundaries').setData(boundariesByScale[String(state.scale)]);update();}));
    document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;activate('[data-mode]',button);update();}));
    document.getElementById('building-2d-toggle').addEventListener('click',()=>{state.buildings2D=!state.buildings2D;applyBuildingVisibility();});
    document.getElementById('building-3d-toggle').addEventListener('click',()=>{state.buildings3D=!state.buildings3D;applyBuildingVisibility();});

    installMiddleMousePan();
    applyBuildingVisibility(false);
    renderLegend();
    document.getElementById('status').textContent='Scale 1 · Urban Form Clusters · Mapbox';
    window.__MAP_TEST__={engine:'mapbox',map,state,valuesByScale,update,selectCommunity,clearSelection};
  });

  map.on('error',event=>console.warn('Mapbox map warning:',event.error||event));
})();
