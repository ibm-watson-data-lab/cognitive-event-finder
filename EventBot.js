'use strict';

const ConversationV1 = require('watson-developer-cloud/conversation/v1');
const MapboxClient = require('./MapboxClient');
const WebSocketBot = require('./WebSocketBot');

class EventBot {

    constructor(eventStore, dialogStore, mapboxClientApiKey, conversationUsername, conversationPassword, conversationWorkspaceId, twilioClient, twilioPhoneNumber, httpServer, baseUrl) {
        this.userStateMap = {};
        this.eventStore = eventStore;
        this.dialogStore = dialogStore;
        this.dialogTypes = ["start","name","search_speaker","speaker","search_topic","topic","suggestion","no_text","start_text","text","session"];
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
                this.dialogStore.init(this.dialogTypes);
            })
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
                userId: messageSender,
                dialogQueue: []
            };
            this.userStateMap[messageSender] = state;
        }
        // make call to conversation service
        let request = {
            input: {text: message},
            context: state.conversationContext,
            workspace_id: this.conversationWorkspaceId,
        };
        let restart = false;
        this.sendRequestToConversation(request)
            .then((response) => {
                state.conversationContext = response.context;
                let action = state.conversationContext['action'];
                if (! action) {
                    action = 'start_search';
                }
                if (action == 'start_over') {
                    restart = true;
                    return this.handleGenericMessage(state, response);
                }
                else if (action == 'get_name') {
                    return this.handleGetNameMessage(state, response, message);
                }
                else if (action == 'search_suggestion') {
                    return this.handleSearchSuggestionMessage(state, response);
                }
                else if (action == 'get_topic') {
                    return this.handleGetTopicMessage(state, response);
                }
                else if (action == 'search_topic') {
                    return this.handleSearchTopicMessage(state, response, message);
                }
                else if (action == 'get_speaker') {
                    return this.handleGetSpeakerMessage(state, response);
                }
                else if (action == 'search_speaker') {
                    return this.handleSpeakerMessage(state, response, message);
                }
                else if (action == 'finish_no_text') {
                    restart = true;
                    return this.handleNoTextMessage(state, response);
                }
                else if (action == 'get_phone_number') {
                    return this.handleStartTextMessage(state, response);
                }
                else if (action == 'text') {
                    restart = true;
                    return this.handleTextMessage(state, response, message);
                }
                else {
                    return this.handleGenericMessage(state, response);
                }
            })
            .then((reply) => {
                if ((typeof reply) == 'string') {
                    reply = this.searchReplaceReply(reply, state);
                    if (restart) {
                        this.clearUserState(state);
                    }
                    this.sendTextMessageToClient(data, reply);
                }
                else {
                    reply.text = this.searchReplaceReply(reply.text, state);
                    if (restart) {
                        this.clearUserState(state);
                    }
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

    searchReplaceReply(reply, state) {
        let name = state.name || 'human';
        return reply.replace('__Name__', name);
    }

    handleGenericMessage(state, response) {
        this.logDialog(state, "start", state.userId, null, true);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleGetNameMessage(state, response, message) {
        this.logDialog(state, "name", "name", {}, false);
        state.name = message;
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleGetSpeakerMessage(state, response) {
        this.logDialog(state, "search_speaker", "search_speaker", {}, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleSpeakerMessage(state, response, message) {
        let speaker = message;
        this.logDialog(state, "speaker", speaker, {}, false);
        var reply = {
            text: '<b>Here is a list of events happening today:</b><br/>',
            points: []
        };
        return this.eventStore.findEventsBySpeaker(speaker, 5)
            .then((events) => {
                reply.text += '<ul>';
                for (var event of events) {
                    reply.text += '<li>' + event.name + '</li>';
                    reply.points.push(event);
                }
                reply.text += '</ul>';
                reply.text += '<p>Would you like me to text you the results?</p>'
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleGetTopicMessage(state, response) {
        this.logDialog(state, "search_topic", "search_topic", {}, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleSearchTopicMessage(state, response, message) {
        let topic = message;
        this.logDialog(state, "topic", topic, {}, false);
        var reply = {
            text: '<b>Here is a list of events happening today:</b><br/>',
            points: []
        };
        return this.eventStore.findEventsByTopic(topic, 5)
            .then((events) => {
                reply.text += '<ul>';
                for (var event of events) {
                    reply.text += '<li>' + event.name + '</li>';
                    reply.points.push(event);
                }
                reply.text += '</ul>';
                reply.text += '<p>Would you like me to text you the results?</p>'
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleSearchSuggestionMessage(state, response) {
        this.logDialog(state, "suggestion", "suggestion", {}, false);
        var reply = {
            text: 'Here is a list of event suggestions for today:\n',
            points: []
        };
        return this.eventStore.findSuggestedEvents(5)
            .then((events) => {
                reply.text += '<ul>';
                for (var event of events) {
                    reply.text += '<li>' + event.name + '</li>';
                    reply.points.push(event);
                }
                reply.text += '</ul>';
                reply.text += '<p>Would you like me to text you the results?</p>'
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleNoTextMessage(state, response) {
        this.logDialog(state, "no_text", "no_text", {}, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleStartTextMessage(state, response) {
        this.logDialog(state, "start_text", "start_text", {}, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleTextMessage(state, response, message) {
        this.logDialog(state, "text", "text", {}, false);
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

    logDialog(state, type, name, detail, newConversation) {
        // queue up dialog to be saved asynchronously
        state.dialogQueue.push({type: type, name: name, detail: detail, newConversation: newConversation});
        if (state.dialogQueue.length > 1) {
            return;
        }
        else {
            this.saveQueuedDialog(state);
        }
    }

    saveQueuedDialog(state) {
        let dialog = state.dialogQueue.shift();
        let lastDialogVertex = dialog.newConversation ? null : state.lastDialogVertex;
        this.dialogStore.addDialog(dialog.type, dialog.name, dialog.detail, lastDialogVertex)
            .then((dialogVertex) => {
                state.lastDialogVertex = dialogVertex;
                if (state.dialogQueue.length > 0) {
                    this.saveQueuedDialog(state);
                }
            });
    }

    clearUserState(state) {
        state.name = null;
        state.lastReply = null;
        state.conversationContext = null;
        state.conversationStarted = false;
    }
}

module.exports = EventBot;