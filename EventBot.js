'use strict';

const ConversationV1 = require('watson-developer-cloud/conversation/v1');
const WebSocketBot = require('./WebSocketBot');
const Bitly = require('bitly');
const uuidV4 = require('uuid/v4');

class EventBot {

    constructor(searchResultCount, searchTimeHours, suggestedSearchTerms, eventStore, userStore, dialogStore, conversationUsername, conversationPassword, conversationWorkspaceId, twilioClient, twilioPhoneNumber, httpServer, baseUrl, bitlyAccessToken) {
        this.searchResultCount = searchResultCount;
        this.searchTimeHours = searchTimeHours;
        this.suggestedSearchTerms = suggestedSearchTerms;
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
        this.webSocketClientsByUserId = {};
        this.remoteControlIdsByUserId = {};
        this.userIdsByToken = {};
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
        for (let key in this.webSocketClientsByUserId) {
            if (this.webSocketClientsByUserId[key] == client) {
                delete this.webSocketClientsByUserId[key];
                break;
            }
        }
    }

    onWebSocketClientMessage(client, msg) {
        if (msg.type == 'ping') {
            this.webSocketBot.sendMessageToClient(client, {type: 'ping'});
        }
        else {
            this.getUserIdForToken(msg.token)
                .then((userId) => {
                    this.setUserIdForToken(msg.token, userId);
                    this.processWebSocketClientMessageForClient(client, msg, userId);
                });
        }
    }

    processWebSocketClientMessageForClient(client, msg, userId) {
        this.webSocketClientsByUserId[userId] = client;
        if (msg.startOver) {
            this.clearUserStateForUser(userId);
        }
        if (msg.type == 'msg') {
            // look for a phone number to push the conversation to a phone via text messaging/mobile app
            if (msg.text.toLowerCase().startsWith('p:')) {
                let remoteControlUserId = userId;
                let phoneNumber = this.formatPhoneNumber(msg.text.substring(2));
                let data = {
                    user: phoneNumber,
                    text: 'hi'
                };
                let user = null;
                this.userStore.getUserForId(phoneNumber)
                    .then((userDoc) => {
                        if (!userDoc) {
                            // create a new user
                            // use the phoneNumber as the ID and generate a token
                            let token = uuidV4();
                            return this.userStore.addUser(phoneNumber, token);
                        }
                        else {
                            return Promise.resolve(userDoc);
                        }
                    })
                    .then((userDoc) => {
                        user = userDoc;
                        this.setUserIdForToken(user.token, user._id);
                        this.setRemoteControlForUserId(data.user, remoteControlUserId);
                        this.clearUserStateForUser(data.user);
                        return this.processMessage(data);
                    })
                    .then((reply) => {
                        this.sendMessageToClient(client, reply);
                        let url = this.baseUrl + '?token=' + encodeURIComponent(user.token);
                        return this.bitly.shorten(url)
                            .then((response) => {
                                let text = reply.text.replace(/\s+$/g, '');
                                text += ' You can send text messages to me directly, or go here: ';
                                text += response.data.url;
                                return this.sendTextMessage(data.user, text);
                            });
                    });
            }
            else {
                let data = {
                    user: userId,
                    text: msg.text
                };
                let remoteControlId = null;
                let remoteControlEnabled = this.removeRemoteControl(data.user);
                if (remoteControlEnabled) {
                    this.clearUserStateForUser(data.user);
                }
                let contextVars = {skip_name: true};
                if (msg.mobile) {
                    // on mobile we ask for the user's name
                    contextVars = null;
                    // if this is controlling another client update that client
                    remoteControlId = this.getRemoteControlForUserId(data.user);
                    if (remoteControlId) {
                        this.sendInputMessageToUserId(remoteControlId, data.text, data.user);
                    }
                }
                this.processMessage(data, contextVars)
                    .then((reply) => {
                        if (msg.mobile && remoteControlId) {
                            // if this is controlling another client update that client
                            this.sendOutputMessageToUserId(remoteControlId, reply);
                        }
                        this.sendMessageToClient(client, reply);
                    });
            }
        }
    }

    setUserIdForToken(token, userId) {
        this.userIdsByToken[token] = userId;
    }

    getUserIdForToken(token) {
        let userId = this.userIdsByToken[token];
        if (! userId) {
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
            return Promise.resolve(userId);
        }
    }

    setRemoteControlForUserId(userId, remoteControlUserId) {
        this.remoteControlIdsByUserId[userId] = remoteControlUserId;
    }

    getRemoteControlForUserId(userId) {
        return this.remoteControlIdsByUserId[userId];
    }

    removeRemoteControl(userId) {
        let remoteControlEnabled = false;
        for(let key in this.remoteControlIdsByUserId) {
            if (this.remoteControlIdsByUserId[key] == userId) {
                delete this.remoteControlIdsByUserId[key];
                remoteControlEnabled = true;
            }
        }
        return remoteControlEnabled;
    }

    sendMessageToClient(client, message) {
        this.webSocketBot.sendMessageToClient(client, {type: 'msg', text:message.text, username:message.username, points:message.points, url:message.url, searches:message.searches});
    }

    sendOutputMessageToUserId(userId, message) {
        if (this.webSocketClientsByUserId[userId]) {
            this.sendMessageToClient(this.webSocketClientsByUserId[userId], message);
        }
    }

    sendInputMessageToUserId(userId, text, username) {
        if (this.webSocketClientsByUserId[userId]) {
            this.webSocketBot.sendMessageToClient(this.webSocketClientsByUserId[userId], {type: 'input', text:text, username:username});
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
        return this.sendRequestToConversation(request)
            .then((response) => {
                state.conversationContext = response.context;
                let action = state.conversationContext['action'];
                if (! action) {
                    action = 'start_search';
                }
                if (action == 'get_name') {
                    return this.handleGetNameMessage(state, response, message);
                }
                else if (action == 'recent_searches') {
                    return this.handleRecentSearches(state, response, message);
                }
                else if (action == 'recent_search_selected') {
                    return this.handleRecentSearchSelected(state, response, message);
                }
                else if (action == 'search_topic') {
                    return this.handleSearchTopicMessage(state, response, message);
                }
                else if (action == 'search_speaker') {
                    return this.handleSearchSpeakerMessage(state, response, message);
                }
                else if (action == 'search_suggestion') {
                    return this.handleSearchSuggestionMessage(state, response, message);
                }
                else if (action == 'search_music_topic') {
                    return this.handleSearchMusicTopicMessage(state, response, message);
                }
                else if (action == 'search_music_artist') {
                    return this.handleSearchMusicArtistMessage(state, response, message);
                }
                else if (action == 'search_film_topic') {
                    return this.handleSearchFilmTopicMessage(state, response, message);
                }
                else if (action == 'search_film_cast') {
                    return this.handleSearchFilmCastMessage(state, response, message);
                }
                else if (action == 'text') {
                    return this.handleTextMessage(state, response, message);
                }
                else {
                    return this.handleGenericActionMessage(state, response, message, action);
                }
            })
            .then((reply) => {
                if (reply.moveToNextDialog) {
                    return this.processMessage({user:state.userId, text:reply.nextDialogInputText}, reply.nextDialogContextVars);
                }
                else {
                    if ((typeof reply) == 'string') {
                        reply = this.searchReplaceReply(reply, state);
                        reply = {
                            text: reply,
                            username: state.username
                        }
                    }
                    else {
                        reply.text = this.searchReplaceReply(reply.text, state);
                        reply.username = state.username;
                    }
                    return Promise.resolve(reply);
                }
            })
            .catch((err) => {
                console.log(`Error: ${JSON.stringify(err)}`);
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

    handleGenericActionMessage(state, response, message, action) {
        this.logDialog(state, action, message, true);
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

    handleRecentSearches(state, response, message) {
        this.logDialog(state, "recent_searches", message, false);
        state.conversationContext['recent_no_results'] = false;
        return this.dialogStore.getRecentSearchesForUserId(state.userId, this.searchResultCount)
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
                    let i = 0;
                    for (const search of searches) {
                        if (i > 0) {
                            reply.text += '\n';
                        }
                        i++;
                        reply.text += i + '. ' + search.typeFriendly + ': ' + search.message;
                        reply.searches.push(search);
                    }
                    state.recentSearches = reply.searches;
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
            else if (state.recentSearches[index].type == 'music_topic') {
                return this.handleSearchMusicTopicMessage(state, response, state.recentSearches[index].message);
            }
            else if (state.recentSearches[index].type == 'music_artist') {
                return this.handleSearchMusicArtistMessage(state, response, state.recentSearches[index].message);
            }
            else if (state.recentSearches[index].type == 'film_topic') {
                return this.handleSearchFilmTopicMessage(state, response, state.recentSearches[index].message);
            }
            else if (state.recentSearches[index].type == 'film_cast') {
                return this.handleSearchFilmCastMessage(state, response, state.recentSearches[index].message);
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

    handleSearchTopicMessage(state, response, message) {
        this.logDialog(state, "search_topic", message, false);
        state.conversationContext['search_no_results'] = false;
        let topic = message;
        return this.eventStore.findEventsByTopic(topic, this.searchTimeHours, this.searchResultCount)
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
                        text: 'Here is a list of events happening today:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    let first = true;
                    for (const event of events) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchSpeakerMessage(state, response, message) {
        this.logDialog(state, "search_speaker", message, false);
        state.conversationContext['search_no_results'] = false;
        let speaker = message;
        return this.eventStore.findEventsBySpeaker(speaker, this.searchTimeHours, this.searchResultCount)
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
                        text: 'Here are events featuring this speaker today:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    let first = true;
                    for (const event of filteredEvents) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchSuggestionMessage(state, response, message) {
        this.logDialog(state, "search_suggestion", message, false);
        state.conversationContext['search_no_results'] = false;
        return this.eventStore.findSuggestedEvents(this.suggestedSearchTerms, this.searchTimeHours, this.searchResultCount)
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
                    let first = true;
                    for (const event of events) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchMusicTopicMessage(state, response, message) {
        this.logDialog(state, "search_music_topic", message, false);
        state.conversationContext['search_no_results'] = false;
        let topic = message;
        return this.eventStore.findMusicEventsByTopic(topic, this.searchTimeHours, this.searchResultCount)
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
                        text: 'Here are some matching music events today:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    let first = true;
                    for (const event of filteredEvents) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchMusicArtistMessage(state, response, message) {
        this.logDialog(state, "search_music_artist", message, false);
        state.conversationContext['search_no_results'] = false;
        let artist = message;
        return this.eventStore.findMusicEventsByArtist(artist, this.searchTimeHours, this.searchResultCount)
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
                        text: 'Here are events featuring this artist today:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    let first = true;
                    for (const event of filteredEvents) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchFilmTopicMessage(state, response, message) {
        this.logDialog(state, "search_film_topic", message, false);
        state.conversationContext['search_no_results'] = false;
        let topic = message;
        return this.eventStore.findFilmEventsByTopic(topic, this.searchTimeHours, this.searchResultCount)
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
                        text: 'Here are some matching film events:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    let first = true;
                    for (const event of filteredEvents) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleSearchFilmCastMessage(state, response, message) {
        this.logDialog(state, "search_film_cast", message, false);
        state.conversationContext['search_no_results'] = false;
        let cast = message;
        return this.eventStore.findFilmEventsByCast(cast, this.searchTimeHours, this.searchResultCount)
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
                        text: 'Here are some matching film events:\n',
                        url: this.baseUrl + '/eventList?ids=',
                        points: []
                    };
                    let first = true;
                    for (const event of filteredEvents) {
                        event.name = this.decodeHtmlSpecialChars(event.name);
                        if (first) {
                            first = false;
                        }
                        else {
                            reply.text += '\n';
                            reply.url += '%2C';
                        }
                        reply.text += event.name;
                        reply.url += event._id;
                        reply.points.push(event);
                    }
                    state.lastSearchResults = reply.points;
                    return Promise.resolve(reply);
                }
            });
    }

    handleTextMessage(state, response, message) {
        this.logDialog(state, "text", message, false);
        let phoneNumber = this.formatPhoneNumber(message);
        return this.userStore.getUserForId(phoneNumber)
            .then((userDoc) => {
                let url = this.baseUrl + '/eventList';
                if (userDoc && userDoc.token) {
                    url += '?token=';
                    url += encodeURIComponent(userDoc.token);
                    url += '&';
                }
                else {
                    url += '?';
                    url += '?';
                }
                if (state.lastSearchResults && state.lastSearchResults.length > 0) {
                    url += 'ids=';
                    let first = true;
                    for(const point of state.lastSearchResults) {
                        if (first) {
                            first = false;
                        }
                        else {
                            url += '%2C';
                        }
                        url += point._id;
                    }
                }
                return this.bitly.shorten(url)
                    .then((bitlyResponse) => {
                        let body = 'Go here to view your events: ';
                        body += bitlyResponse.data.url;
                        console.log(`Sending ${body} to ${phoneNumber}...`);
                        return this.sendTextMessage(phoneNumber, url)
                            .then(() => {
                                let reply = '';
                                for (let i = 0; i < response.output['text'].length; i++) {
                                    reply += response.output['text'][i] + '\n';
                                }
                                return Promise.resolve(reply);
                            });
                    });
                
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
        state.conversationContext = {};
    }

    clearUserStateForUser(userId) {
        const state = this.userStateMap[userId];
        if (state) {
            this.clearUserState(state);
        }
    }

    decodeHtmlSpecialChars(text) {
        var entities = [
            ['amp', '&'],
            ['apos', '\''],
            ['#x27', '\''],
            ['#x2F', '/'],
            ['#39', '\''],
            ['#47', '/'],
            ['lt', '<'],
            ['gt', '>'],
            ['nbsp', ' '],
            ['quot', '"']
        ];
        for (var i=0; i<entities.length; i++) {
            text = text.replace(new RegExp('&' + entities[i][0] + ';', 'g'), entities[i][1]);
        }
        return text;
    }
}

module.exports = EventBot;