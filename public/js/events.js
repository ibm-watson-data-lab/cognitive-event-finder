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
            var bbox = turf.bbox(geoj)

            var bounds = [
                    [-98, 29],
                    [-97, 31]
                ] // Austin city bounds

            var map = new mapboxgl.Map({
                container: "map",
                style: "mapbox://styles/rajrsingh/cizhoy8xk000i2socld7of1m1",
                center: [-97.74306, 30.26715],
                zoom: 12,
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
            var origin = [-97.74046897888182,
                        30.26425663877134
                    ]
            var destination;

            function addGeolocation() {
                // initial position at Austin Convention Center, 
                // to update if geolocaiton is supported
                origin = [-97.74046897888182,
                        30.26425663877134
                    ]

                function geo_success(position) {
                    origin = [position.coords.longitude, position.coords.latitude];
                    console.log('origin: ' + origin)
                    userLocation.features[0].geometry.coordinates = coords
                    updateUserLocation(map, 'user-location', userLocation);
                }

                function geo_error() {
                    console.log("no position availalbe!");
                }

                var geo_options = {
                    enableHighAccuracy: true,
                    maximumAge: 15000,
                    timeout: 13000
                };

                var wpid = navigator.geolocation.watchPosition(geo_success, geo_error, geo_options);


            }

            destination = features[0].geometry.coordinates

            var directions = new MapboxDirections({
                accessToken: mapboxgl.accessToken,
                unit: 'metric',
                profile: 'walking',
                geocoder: {
                    bbox: bounds
                },
                controls: {
                    inputs: false,
                    instructions: true
                },
                interactive: false
            });

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
                        "type": "symbol",
                        "source": {
                            "type": "geojson",
                            "data": geoj
                        },
                        "layout": {
                            "icon-image": '{marker-15}'
                        }
                    });
                }
                if (geoj.features.length > 0) { //If no results are returned, don't fail on fitBounds()
                    let buffer = 0.003
                    map.fitBounds([
                        [bbox[0] - buffer, bbox[1] - buffer],
                        [bbox[2] + buffer, bbox[3] + buffer]
                    ]);
                }

                addGeolocation();
            });
            console.log(origin + '; ' + destination)
            directions.setOrigin(origin);
            directions.setDestination(destination);
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();
