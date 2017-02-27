var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true
});
var map;

var app = new Vue({
    el: '#events',
    data: {
        events: []
    },
    methods: {
        init() {
            app.events = events;
            mapboxgl.accessToken = mapboxAccessToken;
            var bounds = [
                    [-98, 29],
                    [-97, 31]
                ] // Austin city bounds

            map = new mapboxgl.Map({
                container: "map",
                style: "mapbox://styles/rajrsingh/cizhoy8xk000i2socld7of1m1",
                center: [-97.74306, 30.26715],
                zoom: 12,
                pitch: 30
            });

            map.on('load', function() {
                app.updateMap(events)
            });
        },
        updateMap(data) {
            geoj = {
                "type": "FeatureCollection",
                "features": []
            }
            data.forEach(function(feat) {
                let properties = {};
                for (key in feat) {
                    properties[key] = feat[key]
                }
                geoj.features.push({
                    'geometry': feat.geometry,
                    'properties': properties
                });
            })

            if (!geoj.features.length) {
                console.log('no results!')
                return
            }

            var bbox = turf.bbox(geoj)

            if (!map.getSource('locations')) {
                map.addSource('locations', {
                    "type": "geojson",
                    "data": geoj
                });
            } else {
                map.getSource('locations').setData(geoj)
            }

            if (!map.getLayer('eventsLayer')) {

                map.addLayer({
                    "id": "eventslayer",
                    "type": "symbol",
                    "source": 'locations',
                    "layout": {
                        "icon-image": "marker-101",
                        "icon-size": 0.2
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

            map.on('mousemove', function(e) {
                let buffer = 8
                minpoint = new Array(e.point['x'] - buffer, e.point['y'] - buffer)
                maxpoint = new Array(e.point['x'] + buffer, e.point['y'] + buffer)
                var fs = map.queryRenderedFeatures([minpoint, maxpoint], {
                    layers: ["eventslayer"]
                });

                map.getCanvas().style.cursor = (fs.length) ? "pointer" : "";
                if (!fs.length) {
                    popup.remove();
                    return;
                };

                if ((navigator.platform.indexOf("iPhone") != -1) || (navigator.platform.indexOf("iPod") != -1) || (navigator.platform.indexOf("iPad") != -1))
                    window.open("maps://maps.google.com/maps?daddr=lat,long&amp;ll=");
                else
                    window.open("http://maps.google.com/maps?daddr=lat,long&amp;ll=");
                console.log(fs)
                if (fs.length > 1) {
                    popuphtml = "";
                    fs.forEach(function(f) {
                        navlink = 'maps://maps.google.com/maps?daddr=' + f.geometry.coordinates[1] + "," + f.geometry.coordinates[0]
                        titl = "<a href=" + navlink + " target='_sxswsessiondesc'>" + f.properties.name + "</a>"
                        popuphtml += "<span class='popup-title'>" + titl + "</span><p>" + f.properties.description.substring(0, 50) + "...</p>";
                    }, this);
                    popup.setLngLat(fs[0].geometry.coordinates).setHTML(popuphtml).addTo(map);
                } else {
                    var f = fs[0];
                    navlink = 'maps://maps.google.com/maps?daddr=' + f.geometry.coordinates[1] + "," + f.geometry.coordinates[0]
                    titl = "<a href=" + navlink + " target='_sxswsessiondesc'>" + " Navigtate to: " + f.properties.name  + "</a>"
                    popuphtml = "<div class='popup-title'>" + titl + "</div><div>";
                    if (f.properties.img_url && f.properties.img_url != 'undefined')
                        popuphtml += "<img class='popup-image' src='" + f.properties.img_url + "'>";
                    popuphtml += f.properties.description + "</div>";
                    popup.setLngLat(f.geometry.coordinates).setHTML(popuphtml).addTo(map);
                }
            });
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
    console.log(events)

})();
