var botUsername = 'bot';
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
            L.mapbox.accessToken = mapboxAccessToken;
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
        if (this.msg.data.type == 'msg') {
            return createElement('pre', this.msg.data.text);
        }
        else {
            return createElement('div', {}, [
                createElement('pre', this.msg.data.text),
                createElement('div',
                    {
                        style: {
                            width: "500px",
                            height: "200px",
                            display: true
                        },
                        attrs: {
                            id: 'map' + this.msg.key
                        }
                    }
                )]
            );
        }
    },
    mounted: function() {
        if (this.msg.data.type == 'map') {
            var points = [];
            var point;
            for (var i=0; i<this.msg.data.points.length; i++) {
                point = this.msg.data.points[i];
                if (point.geometry) {
                    if (!point.type) {
                        point.type = "Feature";
                    }
                    points.push({type: point.type, geometry: point.geometry});
                }
            }
            var map = L.mapbox.map('map'+this.msg.key, 'mapbox.light').setView([30.26715, -97.74306], 14);
            L.mapbox.featureLayer().setGeoJSON(points).addTo(map);
            map.scrollWheelZoom.disable();
        }
    }
});