'use strict';

const ConversationV1 = require('watson-developer-cloud/conversation/v1');
const WebSocketBot = require('./WebSocketBot');
const uuidV4 = require('uuid/v4');
const Bitly = require('bitly');

class EventBot {

    constructor(eventStore, userStore, dialogStore, conversationUsername, conversationPassword, conversationWorkspaceId, twilioClient, twilioPhoneNumber, httpServer, baseUrl, bitlyAccessToken) {
        this.userStateMap = {};
        this.eventStore = eventStore;
        this.userStore = userStore;
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
        this.clientIdsByToken = {};
        this.defaultUserName = 'human';
        this.bitly = new Bitly(bitlyAccessToken);
    }

    run() {
        this.eventStore.init()
            .then(() => {
                return this.userStore.init();
            })
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
            this.onWebSocketClientDisconnect(client);
        });
        this.webSocketBot.on('message', (client, msg) => {
            this.onWebSocketClientMessage(client, msg)
        });
    }

    onWebSocketClientDisconnect(client) {
        for (let key in this.clientsById) {
            if (this.clientsById[key] == client) {
                delete this.clientsById[key];
                break;
            }
        }
    }

    onWebSocketClientMessage(client, msg) {
        if (msg.type == 'ping') {
            this.webSocketBot.sendMessageToClient(client, {type: 'ping'});
        }
        else {
            this.getClientIdForToken(msg.token)
                .then((clientId) => {
                    this.setClientIdForToken(msg.token, clientId);
                    this.processWebSocketClientMessageForClient(client, msg, clientId);
                });
        }
    }

    processWebSocketClientMessageForClient(client, msg, clientId) {
        this.clientsById[clientId] = client;
        if (msg.startOver) {
            this.clearUserStateForUser(clientId);
        }
        if (msg.type == 'msg') {
            // get or create state for the user
            if (msg.text.toLowerCase().startsWith('p:')) {
                let phoneNumber = this.formatPhoneNumber(msg.text.substring(2));
                let data = {
                    user: phoneNumber,
                    text: 'hi'
                };
                this.userStore.getUserForId(phoneNumber)
                    .then((user) => {
                        if (!user) {
                            // create a new user - generate a token (uuid)
                            return this.userStore.addUser(phoneNumber, uuidV4())
                        }
                        else {
                            return Promise.resolve(user);
                        }
                    })
                    .then((user) => {
                        this.setClientIdForToken(user.token, user._id);
                        this.setClientIdForPhoneNumber(data.user, clientId);
                        this.clearUserStateForUser(data.user);
                        this.processMessage(data)
                            .then((reply) => {
                                if (reply.points) {
                                    this.sendMapMessageToClient(client, reply);
                                }
                                else {
                                    this.sendTextMessageToClient(client, reply);
                                }
                                let url = this.baseUrl + '/chat?token=' + encodeURIComponent(user.token);
                                return this.bitly.shorten(url)
                                    .then((response) => {
                                        let text = reply.text.replace(/\s+$/g, '');
                                        text += ' You can send text messages to me directly, or go here: ';
                                        text += response.data.url;
                                        return this.sendTextMessage(data.user, text);
                                    });
                            });
                    });
            }
            else {
                let data = {
                    user: clientId,
                    text: msg.text
                };
                let phoneNumberSet = this.removePhoneNumbersForClientId(clientId);
                if (phoneNumberSet) {
                    this.clearUserStateForUser(data.user);
                }
                let contextVars = {skip_name: true};
                let controlClientId = null;
                if (msg.mobile) {
                    // on mobile we ask for the user's name
                    contextVars = null;
                    // if this is controlling another client update that client
                    controlClientId = this.getClientIdForPhoneNumber(data.user);
                    if (controlClientId) {
                        this.sendInputMessageToClientId(controlClientId, data.text, data.user);
                    }
                }
                this.processMessage(data, contextVars)
                    .then((reply) => {
                        if (msg.mobile && controlClientId) {
                            // if this is controlling another client update that client
                            this.sendOutputMessageToClientId(controlClientId, reply);
                        }
                        if (reply.points) {
                            this.sendMapMessageToClient(client, reply);
                            if (msg.mobile) {
                                this.clearUserStateForUser(data.user);
                            }
                        }
                        else {
                            this.sendTextMessageToClient(client, reply);
                        }
                    });
            }
        }
    }

    setClientIdForToken(token, clientId) {
        this.clientIdsByToken[token] = clientId;
    }

    getClientIdForToken(token) {
        let clientId = this.clientIdsByToken[token];
        if (! clientId) {
            return this.userStore.getUserForToken(token)
                .then((user) => {
                    if (user) {
                        return Promise.resolve(user._id);
                    }
                    else {
                        return Promise.resolve(uuidV4());
                    }
                });
        }
        else {
            return Promise.resolve(clientId);
        }
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
        this.webSocketBot.sendMessageToClient(client, {type: 'map', text:message.text, username:message.username, points:message.points, url:message.url});
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
        let userId = data.user;
        let state = this.userStateMap[userId];
        if (! contextVars) {
            contextVars = {};
        }
        if (!state) {
            return this.userStore.getUserForId(userId)
                .then((user) => {
                    let name = null;
                    if (user) {
                        name = user.name;
                    }
                    state = {
                        userId: userId,
                        username: name,
                        conversationContext: {},
                        dialogQueue: []
                    };
                    this.userStateMap[userId] = state;
                    if (name) {
                        contextVars['returning_user'] = true;
                    }
                    return this.processMessageForUser(message, state, contextVars);
                });
        }
        else {
            let returningUser = false;
            if (state.username) {
                returningUser = true;
            }
            contextVars['returning_user'] = returningUser;
            return this.processMessageForUser(message, state, contextVars);
        }
    }

    processMessageForUser(message, state, contextVars) {
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
                else if (action == 'get_search_type') {
                    return this.handleGetSearchTypeMessage(state, response, message);
                }
                else if (action == 'search_retry') {
                    return this.handleSearchRetryMessage(state, response, message);
                }
                else if (action == 'recent_searches') {
                    return this.handleRecentSearches(state, response, message);
                }
                else if (action == 'recent_search_selected') {
                    return this.handleRecentSearchSelected(state, response, message);
                }
                else if (action == 'recent_search_invalid_selection') {
                    return this.handleRecentSearchInvalidSelection(state, response, message);
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
                if (reply.moveToNextDialog) {
                    return this.processMessage({user:state.userId, text:reply.nextDialogInputText}, reply.nextDialogContextVars);
                }
                else {
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
                }
            })
            .catch((err) => {
                console.log(`Error: ${JSON.stringify(err)}`);
                this.clearUserState(state);
                const reply = {
                    text: 'Sorry, something went wrong! Say anything to me to start over...',
                    username: state.username
                };
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
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleGetNameMessage(state, response, message) {
        this.logDialog(state, "get_name", message, false);
        return this.userStore.setNameForUser(state.userId, message)
            .then(() => {
                state.username = message;
                let reply = '';
                for (let i = 0; i < response.output['text'].length; i++) {
                    reply += response.output['text'][i] + '\n';
                }
                return Promise.resolve(reply);
            });
    }

    handleGetSearchTypeMessage(state, response, message) {
        this.logDialog(state, "get_search_type", message, false);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleSearchRetryMessage(state, response, message) {
        this.logDialog(state, "search_retry", message, true);
        let reply = '';
        for (let i = 0; i < response.output['text'].length; i++) {
            reply += response.output['text'][i] + '\n';
        }
        return Promise.resolve(reply);
    }

    handleRecentSearches(state, response, message) {
        this.logDialog(state, "recent_searches", message, false);
        state.conversationContext['recent_no_results'] = false;
        return this.dialogStore.getRecentSearchesForUserId(state.userId, 5)
            .then((searches) => {
                if (! searches || searches.length == 0) {
                    const reply = {
                        moveToNextDialog: true,
                        nextDialogInputText: null,
                        nextDialogContextVars: {recent_no_results: true}
                    };
                    return Promise.resolve(reply);
                }
                else {
                    let reply = {
                        text: 'Here is a list of your recent searches:\n',
                        searches: []
                    };
                    reply.text += '<ul>';
                    let i = 0;
                    for (const search of searches) {
                        i++;
                        reply.text += '<li>' + i + '. ' + search.type + ': ' + search.message + '</li>';
                        reply.searches.push(search);
                    }
                    reply.text += '</ul>';
                    state.recentSearches = reply.searches
                    return Promise.resolve(reply);
                }
            });
    }

    handleRecentSearchSelected(state, response, message) {
        this.logDialog(state, "recent_search_selected", message, false);
        let index = response.entities[0].value;
        index--;
        if (state.recentSearches && state.recentSearches.length > 0 && index < state.recentSearches.length) {
            if (state.recentSearches[index].type == 'topic') {
                return this.handleSearchTopicMessage(state, response, state.recentSearches[index].message);
            }
            else if (state.recentSearches[index].type == 'speaker') {
                return this.handleSearchSpeakerMessage(state, response, state.recentSearches[index].message);
            }
            else if (state.recentSearches[index].type == 'suggest') {
                return this.handleSearchSuggestionMessage(state, response, state.recentSearches[index].message);
            }
        }
        // if we got here it was an invalid selection
        const reply = {
            moveToNextDialog: true,
            nextDialogInputText: null,
            nextDialogContextVars: {recent_invalid_selection: true}
        };
        return Promise.resolve(reply);
    }

    handleRecentSearchInvalidSelection(state, response, message) {
        this.logDialog(state, "recent_search_invalid_selection", message, false);
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
        state.conversationContext['search_no_results'] = false;
        let speaker = message;
        return this.eventStore.findEventsBySpeaker(speaker, 5)
            .then((events) => {
                let filteredEvents = [];
                if (events) {
                    for (const event of events) {
                        if (event.geometry && event.geometry.coordinates && event.geometry.coordinates.length == 2) {
                            filteredEvents.push(event);
                        }
                    }
                }
                if (filteredEvents.length == 0) {
                    const reply = {
                        moveToNextDialog: true,
                        nextDialogInputText: null,
                        nextDialogContextVars: {search_no_results: true}
                    };
                    return Promise.resolve(reply);
                }
                else {
                    let reply = {
                        text: '<b>Here are events featuring this speaker today:</b><br/>',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    reply.text += '<ul>';
                    let first = true
                    for (const event of filteredEvents) {
                        reply.text += '<li>' + event.name + '</li>';
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.url += '%2C';
                        }
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    reply.text += '</ul>';
                    state.lastReply = reply;
                    return Promise.resolve(reply);
                }
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
        state.conversationContext['search_no_results'] = false;
        let topic = message;
        return this.eventStore.findEventsByTopic(topic, 5)
            .then((events) => {
                let filteredEvents = [];
                if (events) {
                    for (const event of events) {
                        if (event.geometry && event.geometry.coordinates && event.geometry.coordinates.length == 2) {
                            filteredEvents.push(event);
                        }
                    }
                }
                if (filteredEvents.length == 0) {
                    const reply = {
                        moveToNextDialog: true,
                        nextDialogInputText: null,
                        nextDialogContextVars: {search_no_results: true}
                    };
                    return Promise.resolve(reply);
                }
                else {
                    let reply = {
                        text: '<b>Here is a list of events happening today:</b><br/>',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    reply.text += '<ul>';
                    let first = true;
                    for (const event of events) {
                        reply.text += '<li>' + event.name + '</li>';
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.url += '%2C';
                        }
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    reply.text += '</ul>';
                    state.lastReply = reply;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchSuggestionMessage(state, response, message) {
        this.logDialog(state, "search_suggestion", message, false);
        state.conversationContext['search_no_results'] = false;
        return this.eventStore.findSuggestedEvents(5)
            .then((events) => {
                let filteredEvents = [];
                if (events) {
                    for (const event of events) {
                        if (event.geometry && event.geometry.coordinates && event.geometry.coordinates.length == 2) {
                            filteredEvents.push(event);
                        }
                    }
                }
                if (filteredEvents.length == 0) {
                    const reply = {
                        moveToNextDialog: true,
                        nextDialogInputText: null,
                        nextDialogContextVars: {search_no_results: true}
                    };
                    return Promise.resolve(reply);
                }
                else {
                    let reply = {
                        text: 'Here is a list of event suggestions for today:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    reply.text += '<ul>';
                    let first = true;
                    for (const event of events) {
                        reply.text += '<li>' + event.name + '</li>';
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.url += '%2C';
                        }
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    reply.text += '</ul>';
                    state.lastReply = reply;
                    return Promise.resolve(reply);
                }
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
        // do not clear out dialog state, userId, or username
        // they are used for logging which is done asynchronously
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