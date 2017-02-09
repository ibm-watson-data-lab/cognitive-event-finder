'use strict';

const uuidV4 = require('uuid/v4');

class WebSocketClient {

    constructor(connection) {
        this.connection = connection;
        this.id = uuidV4();
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