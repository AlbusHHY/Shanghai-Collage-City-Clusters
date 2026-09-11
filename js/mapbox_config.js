window.MAPBOX_CONFIG = {
  // GitHub Actions enables Mapbox and injects the public token at deploy time.
  enabled: false,
  accessToken: '',
  style: 'mapbox://styles/mapbox/standard',
  theme: 'monochrome',
  lightPreset: 'day',
  buildings2DVisible: false,
  buildings3DVisible: false,
  buildingMinZoom: 13,
  buildingPitch: 42,
  buildingColor: '#c9cdd0',
  showPlaceLabels: true,
  showRoadLabels: true,
  showPointOfInterestLabels: false,
  showTransitLabels: false
};
