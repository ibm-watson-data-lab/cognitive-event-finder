var botUsername = '<img class="watson_avatar" src="img/Watson_Avatar_Rev_RGB.png">'; //'bot';
var app = new Vue({
    el: '#app',
    data: {
        webSocketProtocol: webSocketProtocol,
        webSocket: null,
        webSocketConnected: false,
        webSocketPingTimer: null,
        message: '',
        messages: [],
        startMessageSent: false
    },
    methods: {
        submitMessage: function() {
            app.messages.unshift({
                user: '<img class="anon_avatar" src="img/Ic_insert_emoticon_48px.png">',
                ts: new Date(),
                key: new Date().getTime() + '',
                data: {
                    type: 'msg',
                    text: app.message
                },
                isUser: true, 
                userStyle: {
                    'float': 'right', 
                    'padding-right': '0px', 
                    'width': '28px'
                },
                msgStyle: {
                }
            });
            app.sendMessage(app.message, false);
            app.message = '';
        },
        sendMessage(text, startOver) {
            app.webSocket.send(JSON.stringify({
                token: token,
                type: 'msg',
                text: text,
                mobile: true,
                startOver: startOver
            }));
        },
        init() {
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
                    token: token,
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
                    if (app.webSocketConnected && ! app.startMessageSent) {
                        app.startMessageSent = true;
                        app.sendMessage('Hi', true);
                    }
                };
                app.webSocket.onmessage = function(evt) {
                    app.webSocketConnected = true;
                    var data = JSON.parse(evt.data);
                    if (data.type == 'msg' || data.type == 'map') {
                        console.log('Message received: ' + evt.data);
                        if (data.type == 'map') {
                            data.text += '<a href="' +  data.url + '">Tap here for more info.</a>'
                        }
                        app.messages.unshift({
                            user: botUsername,
                            ts: new Date(),
                            key: new Date().getTime() + '',
                            data: data,
                            isUser: false, 
                            userStyle: {

                            },
                            msgStyle: {
                            }
                        });
                        // if (data.type == 'map') {
                        //     window.location = data.url;
                        // }
                    }
                    else if (data.type == 'input') {
                        app.messages.unshift({
                            user: '<img class="anon_avatar" src="img/Ic_insert_emoticon_48px.png">',
                            ts: new Date(),
                            key: new Date().getTime() + '',
                            data: {
                                type: 'msg',
                                text: data.text
                            },
                            isUser: true, 
                            userStyle: {
                                'float': 'right', 
                                'padding-right': '0px', 
                                'width': '28px'
                            },
                            msgStyle: {
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
