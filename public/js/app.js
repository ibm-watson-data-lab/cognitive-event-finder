var botUsername = '<img src="watson_avatar_new.png">'; //'bot';
var app = new Vue({
    el: '#app',
    data: {
        webSocketProtocol: webSocketProtocol,
        webSocket: null,
        webSocketConnected: false,
        webSocketPingTimer: null,
        message: '',
        messages: [],
        awaitingResponse: false
    },
    methods: {
        isMatch : function(msg, strLowers) {
            var msgLower = msg.toLowerCase();
            for (var i=0; i<strLowers.length; i++) {
                if (strLowers[i].indexOf(msgLower) >= 0) {
                    return true;
                }
            }
            return false;
        },
        submitMessage: function() {
            app.messages.unshift({
                user: 'Me',
                ts: new Date(),
                key: new Date().getTime() + '',
                data: {type:'msg', text:app.message}
            });
            if (! app.webSocketConnected) {
                app.showOfflineMessage();
            }
            else {
                app.webSocket.send(JSON.stringify({type: 'msg', text: app.message}));
                app.awaitingResponse = true;
            }
            app.message = '';
        },
        init() {
            // init mapbox
            mapboxgl.accessToken = mapboxAccessToken;
            setTimeout(app.onTimer, 1);
        },
        onTimer() {
            if (! app.webSocketConnected) {
                app.connect();
            }
            else {
                app.webSocket.send(JSON.stringify({type: 'ping'}));
            }
            setTimeout(app.onTimer, 5000);
        },
        connect() {
            if ("WebSocket" in window) {
                let webSocketUrl = app.webSocketProtocol + window.location.host;
                app.webSocket = new WebSocket(webSocketUrl);
                app.webSocket.onopen = function() {
                    console.log('Web socket connected.');
                    app.webSocketConnected = true;
                };
                app.webSocket.onmessage = function(evt)  {
                    //console.log('Message received: ' + evt.data);
                    app.awaitingResponse = false;
                    app.webSocketConnected = true;
                    var data = JSON.parse(evt.data);
                    if (data.type == 'msg' || data.type == 'map') {
                        app.messages.unshift({
                            user: botUsername,
                            ts: new Date(),
                            key: new Date().getTime() + '',
                            data: data
                        });
                    }
                    else if (data.type == 'ping') {
                        //console.log('Received ping.');
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
        // if (this.msg.data.type == 'msg') {
            return createElement('div', {
                domProps: {
                    innerHTML: this.msg.data.text
                }
            });
        // }
        // else {
        //     return createElement('div', {}, [
        //         createElement('pre', this.msg.data.text),
        //         createElement('div',
        //             {
        //                 style: {
        //                     width: "500px",
        //                     height: "200px",
        //                     display: true
        //                 },
        //                 attrs: {
        //                     id: 'map' + this.msg.key
        //                 }
        //             }
        //         )]
        //     );
        // }
    },
    mounted: function() {
        if (this.msg.data.type == 'map') {
            var geoj = {
                type: "FeatureCollection"
            };
            var features = [];
            var points = [];
            var point;
            var feature;
            var min = [];
            var max = [];
            for (var i=0; i<this.msg.data.points.length; i++) {
                point = this.msg.data.points[i];
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
                            if ( point.geometry.coordinates[0]<0) // 0 is x
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
                if (i==0) { // set initial bbox
                    min[0] = max[0] = x;
                    min[1] = max[1] = y;
                } else {
                    if (x<min[0]) min[0] = x;
                    if (x>max[0]) max[0] = x;
                    if (y<min[1]) min[1] = y;
                    if (y>max[1]) max[1] = y;
                }

                features.push(feature);
            }
            geoj.features = features;
            // console.log(geoj);

            document.getElementById('map').setAttribute("style", "display:inline");
            var popup = new mapboxgl.Popup({closeButton: false,closeOnClick: true});
            var map = new mapboxgl.Map({
                container: "map",
                style: "mapbox://styles/mapbox/light-v9", 
                center: [ -97.74306, 30.26715], 
                zoom: 12
            });
            map.fitBounds([min, max], {"padding":12});

            map.on('load', function(){
                map.addLayer({
                    "id":"eventslayer",
                    "type":"circle", 
                    "source": {
                        "type":"geojson",
                        "cluster": true, 
                        "clusterMaxZoom": 11, 
                        "clusterRadius": 20, 
                        "data":geoj
                    }, 
                    "paint": {
                        "circle-radius":8,
                        "circle-color":"#ff0000"
                    }
                });
            });

            map.on('mousemove', function(e) {
                var fs = map.queryRenderedFeatures(e.point,{layers:["eventslayer"]});
                map.getCanvas().style.cursor=(fs.length)?"pointer":"";
                if (!fs.length) {popup.remove();return;};
                var f = fs[0];
                // var keylength = Object.keys(f.properties).length;
                // popuphtml = "";
                // for (var key in f.properties) {
                //     popuphtml += "<b>"+key+": </b> "+f.properties[key]+"<br/>"
                // }
                popuphtml = "<b>"+f.properties.name+"</b><p>"+f.properties.description+"</p>";
                popup.setLngLat(f.geometry.coordinates).setHTML(popuphtml).addTo(map);
            });
        }
    }
});