var botUsername = '<img src="watson_avatar_new.png">'; //'bot';
var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true
});
var map;

var app = new Vue({
    el: '#app',
    data: {
        webSocketProtocol: webSocketProtocol,
        webSocket: null,
        webSocketConnected: false,
        webSocketPingTimer: null,
        message: '',
        messages: [],
        awaitingResponse: false,
        username: null
    },
    methods: {
        isMatch: function(msg, strLowers) {
            var msgLower = msg.toLowerCase();
            for (var i = 0; i < strLowers.length; i++) {
                if (strLowers[i].indexOf(msgLower) >= 0) {
                    return true;
                }
            }
            return false;
        },
        submitMessage: function() {
            app.messages.unshift({
                user: app.username || '<img src="anon_avatar.png">',
                ts: new Date(),
                key: new Date().getTime() + '',
                data: {
                    type: 'msg',
                    text: app.message
                },
                userStyle: {
                    
                },
                msgStyle: {
                    'color': '#929292'
                }
            });
            app.webSocket.send(JSON.stringify({
                type: 'msg',
                text: app.message
            }));
            app.awaitingResponse = true;
            app.message = '';
        },
        init() {
            // init mapbox
            mapboxgl.accessToken = mapboxAccessToken;
            var bounds = [
                    [-98, 29],
                    [-97, 31]
                ] // Austin city bounds

            map = new mapboxgl.Map({
                container: "map",
                style: "mapbox://styles/mapbox/streets-v9",
                center: [-97.74306, 30.26715],
                zoom: 15,
                pitch: 30,
                minZoom: 12
            });

            setTimeout(app.onTimer, 1);
        },
        onTimer() {
            if (!app.webSocketConnected) {
                if (app.webSocket) {
                    try {
                        app.webSocket.close();
                    } catch (e) {
                        console.log(e)
                    }
                }
                app.connect();
            } else {
                app.webSocket.send(JSON.stringify({
                    type: 'ping'
                }));
            }
            setTimeout(app.onTimer, 5000);
        },
        connect() {
            if ("WebSocket" in window) {
                let webSocketUrl = app.webSocketProtocol + window.location.host;
                app.webSocket = new WebSocket(webSocketUrl);
                app.webSocket.onopen = function() {
                    console.log('Web socket connected.');
                    app.webSocketConnected = (app.webSocket.readyState == 1);
                };
                app.webSocket.onmessage = function(evt) {
                    app.awaitingResponse = false;
                    app.webSocketConnected = true;
                    var data = JSON.parse(evt.data);
                    if (data.type == 'msg' || data.type == 'map') {
                        console.log('Message received: ' + evt.data);
                        app.username = data.username;
                        app.messages.unshift({
                            user: botUsername,
                            ts: new Date(),
                            key: new Date().getTime() + '',
                            data: data,
                            userStyle: {
                                
                            },
                            msgStyle: {
                                'color': '#000000',
                                'font-size': '10pt'
                            }
                        });
                        if (data.type == 'map') {
                            app.updateMap(data);
                        }
                    } else if (data.type == 'ping') {
                        console.log('Received ping.');
                    }
                };
                app.webSocket.onclose = function() {
                    console.log('Websocket closed.');
                    if (app.awaitingResponse) {
                        app.awaitingResponse = false;
                    }
                    app.webSocketConnected = false;
                    app.webSocket = null;
                };
            }
            else {
                alert("WebSocket not supported browser.");
            }
        },
        updateMap(data) {
            var geoj = {
                type: "FeatureCollection"
            };
            var features = [];
            var point;
            var feature;
            var min = [];
            var max = [];
            for (var i = 0; i < data.points.length; i++) {
                point = data.points[i];
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

                if (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates.length == 2 && feature.geometry.coordinates[0] && feature.geometry.coordinates[1]) {
                    features.push(feature);
                }
            }
            geoj.features = features;

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
                    "type": "circle",
                    "source": 'locations',
                    "paint": {
                        "circle-radius": 16,
                        "circle-color": "#ff0000", 
                        "circle-opacity": 0.5, 
                        "circle-stroke-width": 2, 
                        "circle-stroke-color": "#ff0000"
                    }
                }, 'events-label');
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
                }, 'buildings-label');
            }

            try {
                //If no results are returned, don't fail on fitBounds()
                map.fitBounds([min, max], {
                    "padding": 256
                });
            } catch (e) {
                console.log(e)
            }


            function easing(t) {
                return t * (5 - t);
            }

            try {
                map.easeTo({
                    pitch: 60,
                    easing: easing
                });
            } catch (e) {
                console.log(e)
            }

            map.on('mousemove', function(e) {
                try {
                    var fs = map.queryRenderedFeatures(e.point, {
                        layers: ["eventslayer"]
                    });
                    map.getCanvas().style.cursor = (fs.length) ? "pointer" : "";
                    if (!fs.length) {
                        popup.remove();
                        return;
                    };
                    if (fs.length>1) {
                        popuphtml = "";
                        fs.forEach(function(f) {
                            popuphtml += "<span class='popup-title'>" + f.properties.name + "</span><p>" + f.properties.description.substring(0, 50) + "...</p>";
                        }, this);
                        popup.setLngLat(fs[0].geometry.coordinates).setHTML(popuphtml).addTo(map);
                    } else {
                        var f = fs[0];
                        popuphtml = "<span class='popup-title'>" + f.properties.name + "</span><p>" + f.properties.description + "</p>";
                        popup.setLngLat(f.geometry.coordinates).setHTML(popuphtml).addTo(map);
                    }
                } catch (e) {
                    console.log(e)
                }
            });
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();

Vue.component('chat-message', {
    props: ['msg'],
    render: function(createElement) {
        return createElement('div', {
            domProps: {
                innerHTML: this.msg.data.text
            }
        });
    }
});
