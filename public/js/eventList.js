var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true
});
var map;

var app = new Vue({
    el: '#events',
    data: {
        events: [],
        mapLoaded: false
    },
    methods: {
        init() {
            app.events = events;
            app.initMap(function () {
                app.updateMap(app.events);
            });
        },
        initMap(onMapLoaded) {
            if (app.mapLoaded) {
                if (onMapLoaded) {
                    return onMapLoaded();
                }
                else {
                    return;
                }
            }
            else {
                app.mapLoaded = true;
                mapboxgl.accessToken = mapboxAccessToken;
                var bounds = [
                    [-98, 29],
                    [-97, 31]
                ]; // Austin city bounds
                map = new mapboxgl.Map({
                    container: "map",
                    style: "mapbox://styles/rajrsingh/cizhoy8xk000i2socld7of1m1",
                    center: [-97.74306, 30.26715],
                    zoom: 14,
                    pitch: 30
                });

                // device geolocation
                var geoloptions = {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                };
                navigator.geolocation.getCurrentPosition(locateSuccess, locateError, geoloptions);

                map.addControl(new mapboxgl.NavigationControl(), 'top-left');

                map.on('load', function() {
                    if (onMapLoaded) {
                        onMapLoaded();
                    }
                });
            }
        },
        updateMap(points) {
            if (popup.isOpen()) popup.remove();
            var geoj = {
                type: "FeatureCollection"
            };
            var features = [];
            var point;
            var feature;
            var min = [];
            var max = [];
            for (var i = 0; i < points.length; i++) {
                point = points[i];
                feature = {
                    type: "Feature"
                };
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

                if (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates.length == 2 && feature.geometry.coordinates[0] && feature.geometry.coordinates[1]) {
                    features.push(feature);
                }
            }
            geoj.features = features;
            if (!geoj.features.length) {
                console.log('no results!')
                return
            }

            var bbox = turf.bbox(geoj);
            // console.log("geoj bbox: " + bbox);

            if (!map.getSource('locations')) {
                map.addSource('locations', {
                    "type": "geojson",
                    "data": geoj,
                    "cluster": false,
                    "clusterMaxZoom": 20,
                    "clusterRadius": 5
                });
            } else {
                map.getSource('locations').setData(geoj)
            }

            if (!map.getLayer('eventsLayer')) {
                map.addLayer({
                    "id": "eventsLayer",
                    "type": "symbol",
                    "source": 'locations',
                    "layout": {
                        "icon-image": "doc-icon",
                        "icon-size": {
                            "stops": [[7, 0.4], [15, 0.6]]
                        },
                        "icon-allow-overlap": true
                    }
                }, 'events-label');
            }

            if (geoj.features.length > 0) { //If no results are returned, don't fail on fitBounds()
                try {
                    let buffer = 0.003
                    map.fitBounds([
                        [bbox[0] - buffer, bbox[1] - buffer],
                        [bbox[2] + buffer, bbox[3] + buffer]
                    ]);
                } catch (e) {
                    console.log(e)
                }
            }

            map.on('click', function(e) {
                let buffer = 3;
                minpoint = new Array(e.point['x'] - buffer, e.point['y'] - buffer);
                maxpoint = new Array(e.point['x'] + buffer, e.point['y'] + buffer);
                var fs = map.queryRenderedFeatures([minpoint, maxpoint], {
                    layers: ["eventsLayer"]
                });
                app.displayPopup(fs);
            });
        },
        displayPopup(fs) {
            map.getCanvas().style.cursor = (fs.length) ? "pointer" : "";
            if (!fs.length) {
                popup.remove();
                return;
            }
            ;
            if (fs.length > 1) {
                popuphtml = "";
                fs.forEach(function (f) {
                    titl = "<a href='http://schedule.sxsw.com/2017/events/" + f.properties._id.toUpperCase() + "' target='_sxswsessiondesc'>" + f.properties.name + "</a>"
                    popuphtml += "<div class='popup-title'>" + titl + "</div>";
                    if (f.properties.description) {
                        var desc = f.properties.description;
                        if (desc.length > 50) desc = f.properties.description.substring(0, 50) + "...";
                        popuphtml += "<p>" + desc + "</p>";
                    }

                }, this);
                popup.setLngLat(fs[0].geometry.coordinates).setHTML(popuphtml).addTo(map);
            } else {
                var f = fs[0];
                if (!f.properties.cluster) {
                    titl = "<a href='http://schedule.sxsw.com/2017/events/" + f.properties._id.toUpperCase() + "' target='_sxswsessiondesc'>" + f.properties.name + "</a>";
                    popuphtml = "<div class='popup-title'>" + titl + "</div><div>";
                    var desc = f.properties.description;
                    if (desc.length > 370) desc = f.properties.description.substring(0, 370) + "...";
                    if (f.properties.img_url && f.properties.img_url != 'undefined')
                        popuphtml += "<img class='popup-image' src='" + f.properties.img_url + "'>";
                    popuphtml += desc + "</div>";
                    popup.setLngLat(f.geometry.coordinates).setHTML(popuphtml).addTo(map);
                }
            }
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();

function mapToggle() {
    window.location = "/?token=" + token;
}

function locateSuccess(pos) {
    var crd = pos.coords;
    locationPt = {
        'type': 'Feature',
        'geometry': {
            'type': 'Point',
            'coordinates': [ crd.longitude, crd.latitude]
        }
    };

    if (!map.getLayer('locationlayer')) {
        map.addLayer({
            "id": "locationlayer",
            "type": "circle",
            "source": {
                "type": "geojson",
                "data": locationPt,
            },
            "paint": {
                "circle-color": "#FF6600",
                "circle-radius": 12
            }
        }, 'location-label');
    } else {
        map.getLayer('locationlayer').setData(locationPt);
    }

};

function locateError() {}