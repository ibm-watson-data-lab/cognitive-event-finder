'use strict';

const ConversationV1 = require('watson-developer-cloud/conversation/v1');
const MapboxClient = require('./MapboxClient');
const WebSocketBot = require('./WebSocketBot');

class EventBot {

    constructor(eventStore, mapboxClientApiKey, conversationUsername, conversationPassword, conversationWorkspaceId, twilioClient, twilioPhoneNumber, httpServer, baseUrl) {
        this.userStateMap = {};
        this.eventStore = eventStore;
        this.mapboxClient = new MapboxClient(mapboxClientApiKey);
        this.twilioClient = twilioClient;
        this.twilioPhoneNumber = twilioPhoneNumber;
        this.conversationService = new ConversationV1({
            username: conversationUsername,
            password: conversationPassword,
            version_date: '2016-07-11'
        });
        this.conversationWorkspaceId = conversationWorkspaceId;
        this.httpServer = httpServer;
        this.baseUrl = baseUrl;
    }

    run() {
        this.eventStore.init()
            .then(() => {
                this.runWebSocketBot();
            })
            .catch((error) => {
                console.log(`Error: ${error}`);
                process.exit();
            });
    }

    runWebSocketBot() {
        this.webSocketBot = new WebSocketBot();
        this.webSocketBot.start(this.httpServer);
        this.webSocketBot.on('start', () => {
            console.log('Web socket is connected and running!')
        });
        this.webSocketBot.on('message', (client, msg) => {
            if (msg.type == 'msg') {
                let data = {
                    client: client,
                    user: client.id,
                    text: msg.text
                };
                this.processMessage(data);
            }
            else if (msg.type == 'ping') {
                this.webSocketBot.sendMessageToClient(client, {type: 'ping'});
            }
        });
    }

    sendTextMessageToClient(data, message) {
        this.webSocketBot.sendMessageToClient(data.client, {type: 'msg', text:message});
    }

    sendMapMessageToClient(data, message) {
        this.webSocketBot.sendMessageToClient(data.client, {type: 'map', text:message.text, points:message.points});
    }

    processMessage(data) {
        // get or create state for the user
        let message = data.text;
        let messageSender = data.user;
        let state = this.userStateMap[messageSender];
        if (!state) {
            state = {
                userId: messageSender
            };
            this.userStateMap[messageSender] = state;
        }
        // make call to conversation service
        let request = {
            input: {text: message},
            context: state.conversationContext,
            workspace_id: this.conversationWorkspaceId,
        };
        this.sendRequestToConversation(request)
            .then((response) => {
                state.conversationContext = response.context;
                if (state.conversationContext['is_no_text']) {
                    return this.handleNoTextMessage(state, response);
                }
                else if (state.conversationContext['is_text']) {
                    return this.handleTextMessage(state, response, message);
                }
                else if (state.conversationContext['is_start_text']) {
                    return this.handleStartTextMessage(state, response);
                }
                else if (state.conversationContext['is_suggestion']) {
                    return this.handleSuggestionMessage(state, response);
                }
                else if (state.conversationContext['is_topic']) {
                    return this.handleTopicMessage(state, response, message);
                }
                else if (state.conversationContext['is_start_topic']) {
                    return this.handleStartTopicMessage(state, response);
                }
                else {
                    return this.handleStartMessage(state, response);
                }
            })
            .then((reply) => {
                if ((typeof reply) == 'string') {
                    this.sendTextMessageToClient(data, reply);
                }
                else {
                    this.sendMapMessageToClient(data, reply);
                }
            })
            .catch((err) => {
                console.log(`Error: ${err}`);
                this.clearUserState(state)
                const reply = "Sorry, something went wrong! Say anything to me to start over...";
                this.sendTextMessageToClient(data, reply);
            });
    }

    sendRequestToConversation(request) {
        return new Promise((resolve, reject) => {
            this.conversationService.message(request, (error, response) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(response);
                }
            });
        });
    }

    handleStartMessage(state, response) {
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleStartTopicMessage(state, response) {
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleTopicMessage(state, response, message) {
        let topic = message;
        var reply = {
            text: 'Here is a list of events:\n',
            points: []
        };
        return this.eventStore.findEvents(topic, 5)
            .then((events) => {
                for (var event of events) {
                    reply.text += '\n' + event.name;
                    reply.points.push(event);
                }
                reply.text += '\n\nWould you like us to text you the results?'
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleSuggestionMessage(state, response) {
        var reply = {
            text: 'Here is a list of events:\n',
            points: []
        };
        return this.eventStore.findSuggestedEvents(5)
            .then((events) => {
                for (var event of events) {
                    reply.text += '\n' + event.name;
                    reply.points.push(event);
                }
                reply.text += '\n\nWould you like us to text you the results?'
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleNoTextMessage(state, response) {
        // clear user state - end of conversation
        this.clearUserState(state);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleStartTextMessage(state, response) {
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleTextMessage(state, response, message) {
        let phoneNumber = message.replace(/\D/g,'');
        if (! phoneNumber.startsWith('+')) {
            if (! phoneNumber.startsWith('1')) {
                phoneNumber = '1' + phoneNumber;
            }
            phoneNumber = '+' + phoneNumber;
        }
        let body = this.baseUrl + '/events';
        if (state.lastReply && state.lastReply.points && state.lastReply.points.length > 0) {
            body += '?ids=';
            let first = true;
            for(var point of state.lastReply.points) {
                if (first) {
                    first = false;
                }
                else {
                    body += '%2C';
                }
                body += point._id;
            }
        }
        console.log(`Sending ${body} to ${phoneNumber}...`);
        return new Promise((resolve, reject) => {
            this.twilioClient.messages.create({
                body: body,
                to: phoneNumber,
                from: this.twilioPhoneNumber
            }, function(err, message) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(message);
                }
            });
        })
            .then(() => {
                // clear user state - end of conversation
                this.clearUserState(state);
                let reply = '';
                for (let i = 0; i < response.output['text'].length; i++) {
                    reply += response.output['text'][i] + '\n';
                }
                return Promise.resolve(reply);
            });
    }

    clearUserState(state) {
        state.lastReply = null;
        state.conversationContext = null;
        state.conversationStarted = false;
    }
}

module.exports = EventBot;