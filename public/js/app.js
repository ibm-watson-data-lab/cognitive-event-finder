var botUsername = '<img src="img/watson_avatar_new.png">'; //'bot';
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
                user: app.username || '<img src="img/anon_avatar.png">',
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
                clientId: clientId,
                type: 'msg',
                text: app.message
            }));
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
                style: "mapbox://styles/rajrsingh/cizhoy8xk000i2socld7of1m1",
                center: [-97.74306, 30.26715],
                zoom: 12,
                pitch: 30
            });

            map.on('load', function() {
                setTimeout(app.onTimer, 1);
            })

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
                    clientId: clientId,
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
                    }
                    else if (data.type == 'input') {
                        app.username = data.username;
                        app.messages.unshift({
                            user: app.username || '<img src="img/anon_avatar.png">',
                            ts: new Date(),
                            key: new Date().getTime() + '',
                            data: {
                                type: 'msg',
                                text: data.text
                            },
                            userStyle: {
                            },
                            msgStyle: {
                                'color': '#929292'
                            }
                        });
                        app.message = '';
                    }
                    else if (data.type == 'ping') {
                        console.log('Received ping.');
                    }
                };
                app.webSocket.onclose = function() {
                    console.log('Websocket closed.');
                    app.webSocketConnected = false;
                    app.webSocket = null;
                };
            } else {
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

                if (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates.length == 2 && feature.geometry.coordinates[0] && feature.geometry.coordinates[1]) {
                    features.push(feature);
                }
            }
            geoj.features = features;
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
                    let buffer = 3
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

                    console.log(fs.properties)

                    if (fs.length > 1) {
                        popuphtml = "";
                        fs.forEach(function(f) {
                            titl = "<a href='http://schedule.sxsw.com/2017/events/" + f.properties._id + "' target='_sxswsessiondesc'>" + f.properties.name + "</a>"
                            popuphtml += "<span class='popup-title'>" + titl + "</span><p>" + f.properties.description.substring(0, 50) + "...</p>";
                        }, this);
                        popup.setLngLat(fs[0].geometry.coordinates).setHTML(popuphtml).addTo(map);
                    } else {
                        var f = fs[0];
                        titl = "<a href='http://schedule.sxsw.com/2017/events/" + f.properties._id + "' target='_sxswsessiondesc'>" + f.properties.name + "</a>"
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
