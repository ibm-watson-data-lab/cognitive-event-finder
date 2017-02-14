var app = new Vue({
    el: '#events',
    data: {},
    methods: {
        init() {
            mapboxgl.accessToken = mapboxAccessToken;
            var geoj = {
                type: "FeatureCollection"
            };
            var features = [];
            var points = [];
            var point;
            var feature;
            var min = [];
            var max = [];
            for (var i = 0; i < events.length; i++) {
                point = events[i];
                feature = { type: "Feature" };
                feature.properties = {};
                for (var prop in point) {
                    if (point.hasOwnProperty(prop)) {
                        if (prop == "geometry") {
                            feature.geometry = {};
                            if (!point[prop].type) {
                                feature.geometry.type = "Point";
                            } else {
                                feature.geometry.type = point[prop].type;
                            }
                            // something is screwy with data so do this weird hack
                            if (point.geometry.coordinates[0] < 0) // 0 is x
                                feature.geometry.coordinates = point.geometry.coordinates;
                            else
                                feature.geometry.coordinates = [point.geometry.coordinates[1], point.geometry.coordinates[0]];
                        } else { // end geometry
                            feature.properties[prop] = point[prop];
                        }
                    }
                }

                x = feature.geometry.coordinates[0];
                y = feature.geometry.coordinates[1];
                if (i == 0) { // set initial bbox
                    min[0] = max[0] = x;
                    min[1] = max[1] = y;
                } else {
                    if (x < min[0]) min[0] = x;
                    if (x > max[0]) max[0] = x;
                    if (y < min[1]) min[1] = y;
                    if (y > max[1]) max[1] = y;
                }

                features.push(feature);
            }
            geoj.features = features;

            var map = new mapboxgl.Map({
                container: "map",
                style: "mapbox://styles/mapbox/streets-v9",
                center: [-97.74306, 30.26715],
                zoom: 15,
                pitch: 30
            });

            var userLocation = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Point",
                        "coordinates": []
                    }
                }]
            }

            // Austin convention center for demo purposes
            // Update origin to user locatin as default!
            var origin = [-97.74046897888182,
                30.26425663877134
            ]
            if (features.length) {
                if ('geometry' in features[0]) {
                    var destination = features[0].geometry.coordinates
                    console.log('used custom destination')
                }
            } else {
                var destination = [-97.74497509002686,
                    30.270001765380385
                ]
                console.log('used default destination')
            }

            var directions = new MapboxDirections({
                accessToken: mapboxgl.accessToken,
                unit: 'metric',
                profile: 'walking',
                geocoder: {
                    bbox: [
                        [-98, 29],
                        [-97, 31]
                    ]
                },
                controls: {
                    inputs: false,
                    instructions: true
                },
                interactive: false
            });

            var geolocate = new mapboxgl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true,
                    timeout: 10000, //Poll every 5 seconds
                    maximumAge: 0
                },
                watchPosition: true //Update marker on geolocate
            });

            geolocate.on('geolocate', function(e) {
                var user_point = [e.coords.longitude, e.coords.latitude]
                userLocation.features[0].geometry.coordinates = user_point;
                updateUserLocation(map, 'user-location', userLocation);
            });

            map.addControl(geolocate, 'top-right');
            map.addControl(directions, 'top-left');

            function updateUserLocation(map, sourceName, geojson) {

                if (!map.getSource(sourceName)) {
                    map.addSource(sourceName, {
                        type: 'geojson',
                        data: geojson
                    });

                    if (!map.getLayer('user-location-point')) {
                        map.addLayer({
                            "id": 'user-location-point',
                            "type": 'circle',
                            "source": sourceName,
                            "paint": {
                                "circle-color": 'blue',
                                "circle-stroke-width": 2,
                                "circle-stroke-color": 'black',
                                "circle-radius": {
                                    stops: [
                                        [8, 3],
                                        [16, 8]
                                    ]
                                }
                            }
                        })
                    }
                } else {
                    map.getSource(sourceName).setData(userLocation)
                }
            }

            map.on('load', function() {
                if (!map.getLayer('eventsLayer')) {
                    map.addLayer({
                        "id": "eventslayer",
                        "type": "circle",
                        "source": {
                            "type": "geojson",
                            "cluster": true,
                            "clusterMaxZoom": 11,
                            "clusterRadius": 20,
                            "data": geoj
                        },
                        "paint": {
                            "circle-radius": 8,
                            "circle-color": "#ff0000"
                        }
                    });
                }
                if (!map.getLayer('3d-buildings')) {
                    map.addLayer({
                        'id': '3d-buildings',
                        'source': 'composite',
                        'source-layer': 'building',
                        'filter': ['==', 'extrude', 'true'],
                        'type': 'fill-extrusion',
                        'minzoom': 15,
                        'paint': {
                            'fill-extrusion-color': '#aaa',
                            'fill-extrusion-height': {
                                'type': 'identity',
                                'property': 'height'
                            },
                            'fill-extrusion-base': {
                                'type': 'identity',
                                'property': 'min_height'
                            },
                            'fill-extrusion-opacity': .6
                        }
                    });
                }
            });

            directions.setOrigin(origin);
            directions.setDestination(destination);
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();
