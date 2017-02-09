'use strict';

const http = require('http');
const WebSocketClient = require('./WebSocketClient');
const WebSocketServer = require('websocket').server;
const EventEmitter = require('events');

class WebSocketBot extends EventEmitter {

    constructor() {
        super();
        this.clients = [];
    }

    start(httpServer) {
        this.webSocketServer = new WebSocketServer({httpServer: httpServer, autoAcceptConnections: false});
        this.webSocketServer.on('request', (request) => {
            this.onWebSocketConnection(request);
        });
    }

    onWebSocketConnection(request) {
        console.log(`${new Date()} WebSocket connection accepted.`);
        let connection = request.accept(null, request.origin);
        let client = new WebSocketClient(connection);
        this.clients.push(client);
        connection.on('message', (message) => {
            if (message.type === 'utf8') {
                console.log(`${new Date()} WebSocket server received message: ${message.utf8Data}`);
                let data = JSON.parse(message.utf8Data);
                this.onMessageReceivedFromClient(client, data);
            }
        });
        connection.on('close', () => {
            let index = this.clients.indexOf(client);
            if (index >=0 ) {
                this.clients.splice(index, 1);
                console.log(`${new Date()} WebSocket client ${connection.remoteAddress} disconnected.`);
            }
        });
    }

    onMessageReceivedFromClient(client, message) {
        this.emit('message', client, message);
    }

    sendMessageToClient(client, message) {
        client.send(message);
    }
}

module.exports = WebSocketBot;