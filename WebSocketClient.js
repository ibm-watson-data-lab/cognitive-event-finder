'use strict';

class WebSocketClient {

    constructor(connection) {
        this.connection = connection;
    }

    /**
     * Sends a message to the connected web socket client.
     * @param {Object} message
     * @param {string} message.type
     * @param {string} message.text
     */
    send(message) {
        this.connection.sendUTF(JSON.stringify(message));
    }
}

module.exports = WebSocketClient;