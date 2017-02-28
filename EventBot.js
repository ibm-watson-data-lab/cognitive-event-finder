'use strict';

const ConversationV1 = require('watson-developer-cloud/conversation/v1');
const WebSocketBot = require('./WebSocketBot');

class EventBot {

    constructor(eventStore, dialogStore, conversationUsername, conversationPassword, conversationWorkspaceId, twilioClient, twilioPhoneNumber, httpServer, baseUrl) {
        this.userStateMap = {};
        this.eventStore = eventStore;
        this.dialogStore = dialogStore;
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
        this.clientsById = {};
        this.clientIdsByPhoneNumber = {};
        this.defaultUserName = 'human';
    }

    run() {
        this.eventStore.init()
            .then(() => {
                return this.dialogStore.init();
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
        this.webSocketBot.on('disconnect', (client) => {
            for (let key in this.clientsById) {
                if (this.clientsById[key] == client) {
                    delete this.clientsById[key];
                    break;
                }
            }
        });
        this.webSocketBot.on('message', (client, msg) => {
            if (msg.clientId) {
                this.clientsById[msg.clientId] = client;
            }
            if (msg.type == 'msg') {
                // get or create state for the user
                if (msg.text.toLowerCase().startsWith('p:')) {
                    let phoneNumber = this.formatPhoneNumber(msg.text.substring(2));
                    let data = {
                        user: phoneNumber,
                        text: 'hi'
                    };
                    this.setClientIdForPhoneNumber(data.user, msg.clientId);
                    this.clearUserStateForUser(data.user);
                    this.processMessage(data, {skip_name: true})
                        .then((reply) => {
                            if (reply.points) {
                                this.sendMapMessageToClient(client, reply);
                            }
                            else {
                                this.sendTextMessageToClient(client, reply);
                            }
                            return this.sendTextMessage(data.user, reply.text);
                        });
                }
                else {
                    let data = {
                        user: client.id,
                        text: msg.text
                    };
                    let phoneNumberSet = this.removePhoneNumbersForClientId(msg.clientId);
                    if (phoneNumberSet) {
                        this.clearUserStateForUser(data.user);
                    }
                    this.processMessage(data)
                        .then((reply) => {
                            if (reply.points) {
                                this.sendMapMessageToClient(client, reply);
                            }
                            else {
                                this.sendTextMessageToClient(client, reply);
                            }
                        });
                }
            }
            else if (msg.type == 'ping') {
                this.webSocketBot.sendMessageToClient(client, {type: 'ping'});
            }
        });
    }

    setClientIdForPhoneNumber(phoneNumber, clientId) {
        this.clientIdsByPhoneNumber[phoneNumber] = clientId;
    }

    getClientIdForPhoneNumber(phoneNumber) {
        return this.clientIdsByPhoneNumber[phoneNumber];
    }

    removePhoneNumbersForClientId(clientId) {
        let phoneNumberSet = false;
        for(let key in this.clientIdsByPhoneNumber) {
            if (this.clientIdsByPhoneNumber[key] == clientId) {
                delete this.clientIdsByPhoneNumber[key];
                phoneNumberSet = true;
            }
        }
        return phoneNumberSet;
    }

    sendTextMessageToClient(client, message) {
        this.webSocketBot.sendMessageToClient(client, {type: 'msg', text:message.text, username:message.username});
    }

    sendMapMessageToClient(client, message) {
        this.webSocketBot.sendMessageToClient(client, {type: 'map', text:message.text, username:message.username, points:message.points});
    }

    sendOutputMessageToClientId(clientId, message) {
        if (this.clientsById[clientId]) {
            if (message.points) {
                this.sendMapMessageToClient(this.clientsById[clientId], message);
            }
            else {
                this.sendTextMessageToClient(this.clientsById[clientId], message);
            }
        }
    }

    sendInputMessageToClientId(clientId, text, username) {
        if (this.clientsById[clientId]) {
            this.webSocketBot.sendMessageToClient(this.clientsById[clientId], {type: 'input', text:text, username:username});
        }
    }

    processMessage(data, contextVars) {
        let message = data.text;
        let messageSender = data.user;
        let state = this.userStateMap[messageSender];
        if (!state) {
            state = {
                userId: messageSender,
                conversationContext: {},
                dialogQueue: []
            };
            this.userStateMap[messageSender] = state;
        }
        // add additional contextVars
        if (contextVars) {
            for (let key in contextVars) {
                state.conversationContext[key] = contextVars[key];
            }
        }
        // make call to conversation service
        let request = {
            input: {text: message},
            context: state.conversationContext,
            workspace_id: this.conversationWorkspaceId,
        };
        let restart = false;
        return this.sendRequestToConversation(request)
            .then((response) => {
                state.conversationContext = response.context;
                let action = state.conversationContext['action'];
                if (! action) {
                    action = 'start_search';
                }
                if (action == 'start_over') {
                    restart = true;
                    return this.handleGenericMessage(state, response, message);
                }
                else if (action == 'skip_name') {
                    return this.handleSkipNameMessage(state, response, message);
                }
                else if (action == 'get_name') {
                    return this.handleGetNameMessage(state, response, message);
                }
                else if (action == 'search_suggestion') {
                    return this.handleSearchSuggestionMessage(state, response, message);
                }
                else if (action == 'get_topic') {
                    return this.handleGetTopicMessage(state, response, message);
                }
                else if (action == 'search_topic') {
                    return this.handleSearchTopicMessage(state, response, message);
                }
                else if (action == 'get_speaker') {
                    return this.handleGetSpeakerMessage(state, response, message);
                }
                else if (action == 'search_speaker') {
                    return this.handleSearchSpeakerMessage(state, response, message);
                }
                else if (action == 'finish_no_text') {
                    restart = true;
                    return this.handleNoTextMessage(state, response, message);
                }
                else if (action == 'get_phone_number') {
                    return this.handleGetPhoneNumberMessage(state, response);
                }
                else if (action == 'text') {
                    restart = true;
                    return this.handleTextMessage(state, response, message);
                }
                else {
                    return this.handleGenericMessage(state, response, message);
                }
            })
            .then((reply) => {
                if ((typeof reply) == 'string') {
                    reply = this.searchReplaceReply(reply, state);
                    if (restart) {
                        this.clearUserState(state);
                    }
                    // set username after clearing
                    reply = {
                        text: reply,
                        username: state.username
                    }
                }
                else {
                    reply.text = this.searchReplaceReply(reply.text, state);
                    if (restart) {
                        this.clearUserState(state);
                    }
                    // set username after clearing
                    reply.username = state.username;
                }
                return Promise.resolve(reply);
            })
            .catch((err) => {
                console.log(`Error: ${JSON.stringify(err)}`);
                this.clearUserState(state);
                const reply = {
                    text: 'Sorry, something went wrong! Say anything to me to start over...',
                    username: state.username
                }
                this.clearUserState(state);
                return Promise.resolve(reply);
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
        let name = state.username || this.defaultUserName;
        return reply.replace(/__Name__/g, name);
    }

    handleGenericMessage(state, response, message) {
        this.logDialog(state, "start", message, true);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleSkipNameMessage(state, response, message) {
        this.logDialog(state, "skip_name", message, true);
        state.username = this.defaultUserName;
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleGetNameMessage(state, response, message) {
        this.logDialog(state, "get_name", message, false);
        state.username = message;
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleGetSpeakerMessage(state, response, message) {
        this.logDialog(state, "get_speaker", message, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleSearchSpeakerMessage(state, response, message) {
        this.logDialog(state, "search_speaker", message, false);
        let speaker = message;
        let reply = {
            text: '<b>Here are events featuring this speaker today:</b><br/>',
            points: []
        };
        return this.eventStore.findEventsBySpeaker(speaker, 5)
            .then((events) => {
                reply.text += '<ul>';
                for (const event of events) {
                    reply.text += '<li>' + event.name + '</li>';
                    reply.points.push(event);
                }
                reply.text += '</ul>';
                reply.text += '<div class="textme">May I text you the results?</div>';
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleGetTopicMessage(state, response, message) {
        this.logDialog(state, "get_topic", message, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleSearchTopicMessage(state, response, message) {
        this.logDialog(state, "search_topic", message, false);
        let topic = message;
        let reply = {
            text: '<b>Here is a list of events happening today:</b><br/>',
            points: []
        };
        return this.eventStore.findEventsByTopic(topic, 5)
            .then((events) => {
                reply.text += '<ul>';
                for (const event of events) {
                    reply.text += '<li>' + event.name + '</li>';
                    reply.points.push(event);
                }
                reply.text += '</ul>';
                reply.text += '<div class="textme">May I text you the results?</div>'
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleSearchSuggestionMessage(state, response, message) {
        this.logDialog(state, "search_suggestion", message, false);
        let reply = {
            text: 'Here is a list of event suggestions for today:\n',
            points: []
        };
        return this.eventStore.findSuggestedEvents(5)
            .then((events) => {
                reply.text += '<ul>';
                for (const event of events) {
                    reply.text += '<li>' + event.name + '</li>';
                    reply.points.push(event);
                }
                reply.text += '</ul>';
                reply.text += '<div class="textme">May I text you the results?</div>';
                state.lastReply = reply;
                return Promise.resolve(reply);
            });
    }

    handleNoTextMessage(state, response, message) {
        this.logDialog(state, "no_text", message, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleGetPhoneNumberMessage(state, response, message) {
        this.logDialog(state, "get_phone_number", message, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleTextMessage(state, response, message) {
        this.logDialog(state, "text", message, false);
        let phoneNumber = this.formatPhoneNumber(message);
        let body = this.baseUrl + '/eventList';
        if (state.lastReply && state.lastReply.points && state.lastReply.points.length > 0) {
            body += '?ids=';
            let first = true;
            for(const point of state.lastReply.points) {
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
        return this.sendTextMessage(phoneNumber, body)
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

    formatPhoneNumber(phoneNumber) {
        if (phoneNumber.startsWith('+')) {
            phoneNumber = '+' + phoneNumber.replace(/\D/g,'');
        }
        else {
            phoneNumber = phoneNumber.replace(/\D/g,'');
            if (! phoneNumber.startsWith('1')) {
                phoneNumber = '1' + phoneNumber;
            }
            phoneNumber = '+' + phoneNumber;
        }
        return phoneNumber;
    }

    sendTextMessage(phoneNumber, text) {
        return new Promise((resolve, reject) => {
            this.twilioClient.messages.create({
                body: text,
                to: phoneNumber,
                from: this.twilioPhoneNumber
            }, (err, message) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(message);
                }
            });
        });
    }

    logDialog(state, name, message, newConversation) {
        // queue up dialog to be saved asynchronously
        state.dialogQueue.push({name: name, message: message, date: Date.now(), newConversation: newConversation});
        if (state.dialogQueue.length > 1) {
            return;
        }
        else {
            setTimeout( () => {
                this.saveQueuedDialog(state);
            }, 1);
        }
    }

    saveQueuedDialog(state) {
        let dialog = state.dialogQueue.shift();
        let dialogDoc = {name:dialog.name, message:dialog.message, date:dialog.date};
        if (dialog.newConversation) {
            this.dialogStore.addConversation(state.userId, dialogDoc)
                .then((conversationDoc) => {
                    state.conversationId = conversationDoc.id;
                    if (state.dialogQueue.length > 0) {
                        this.saveQueuedDialog(state);
                    }
                });
        }
        else {
            this.dialogStore.addDialog(state.conversationId, dialogDoc)
                .then(() => {
                    if (state.dialogQueue.length > 0) {
                        this.saveQueuedDialog(state);
                    }
                });
        }
    }

    clearUserState(state) {
        // do not clear out dialog state or userId
        // they are used for logging which is done asynchronously
        state.username = null;
        state.lastReply = null;
        state.conversationContext = {};
        state.conversationStarted = false;
    }

    clearUserStateForUser(userId) {
        const state = this.userStateMap[userId];
        if (state) {
            this.clearUserState(state);
        }
    }
}

module.exports = EventBot;