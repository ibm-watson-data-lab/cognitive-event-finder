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
            // console.log(geoj);

            document.getElementById('map').setAttribute("style", "display:inline");
            var popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: true });
            var map = new mapboxgl.Map({
                container: "map",
                style: "mapbox://styles/mapbox/streets-v9",
                center: [-97.74306, 30.26715],
                zoom: 15,
                pitch: 30
            });
            try {
                map.fitBounds([min, max], { "padding": 12 });
            } catch (e) {
                console.log(e)
            }

            map.addControl(new MapboxDirections({
                accessToken: mapboxgl.accessToken,
                unit: 'metric',
                profile: 'walking',
                geocoder: {
                    bbox: [[-98, 29],[-97, 31]]
                }
            }), 'top-left');

            map.on('load', function() {
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
            });

            map.on('mousemove', function(e) {
                var fs = map.queryRenderedFeatures(e.point, { layers: ["eventslayer"] });
                map.getCanvas().style.cursor = (fs.length) ? "pointer" : "";
                if (!fs.length) {
                    popup.remove();
                    return;
                };
                var f = fs[0];

                popuphtml = "<b>" + f.properties.name + "</b><p>" + f.properties.description + "</p>";
                popup.setLngLat(f.geometry.coordinates).setHTML(popuphtml).addTo(map);
            });
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();
