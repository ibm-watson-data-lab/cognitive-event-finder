'use strict';

const cfenv = require('cfenv');
const cloudant = require('cloudant');
const dotenv = require('dotenv');
const express = require('express');
const CloudantDialogStore = require('./CloudantDialogStore');
const CloudantEventStore = require('./CloudantEventStore');
const CloudantUserStore = require('./CloudantUserStore');
const EventBot = require('./EventBot');
const TwilioRestClient = require('twilio').RestClient;
const uuidV4 = require('uuid/v4');

const appEnv = cfenv.getAppEnv();
appEnv.bind = '192.168.1.70';
const app = express();
const http = require('http').Server(app);

let cloudantDialogStore;
let cloudantEventStore;
let cloudantUserStore;
let eventBot;

(function() {
    // load environment variables
    dotenv.config();
    // cloudant
    let cloudantClient = cloudant({
        url: process.env.CLOUDANT_URL,
        plugin:'promises'
    });
    cloudantDialogStore = new CloudantDialogStore(cloudantClient, process.env.CLOUDANT_DIALOG_DB_NAME);
    cloudantEventStore = new CloudantEventStore(cloudantClient, process.env.CLOUDANT_EVENT_DB_NAME || process.env.CLOUDANT_DB_NAME);
    cloudantUserStore = new CloudantUserStore(cloudantClient, process.env.CLOUDANT_USER_DB_NAME);
    eventBot = new EventBot(
        cloudantEventStore,
        cloudantUserStore,
        cloudantDialogStore,
        process.env.CONVERSATION_USERNAME,
        process.env.CONVERSATION_PASSWORD,
        process.env.CONVERSATION_WORKSPACE_ID,
        new TwilioRestClient(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN),
        process.env.TWILIO_PHONE_NUMBER,
        http,
        appEnv.url,
        process.env.BITLY_ACCESS_TOKEN
    );
    eventBot.run();
})();

app.use(express.static(__dirname + '/public'));

// set view engine and map views directory
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// map requests
app.get('/', (req, res) => {
    res.render('index.ejs', {
        webSocketProtocol: appEnv.url.indexOf('http://') == 0 ? 'ws://' : 'wss://',
        mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
        token: req.query.token || uuidV4()
    });
});

app.get('/chat', (req, res) => {
    res.render('chat.ejs', {
        webSocketProtocol: appEnv.url.indexOf('http://') == 0 ? 'ws://' : 'wss://',
        token: req.query.token || uuidV4()
    });
});

app.get('/events', (req, res) => {
    let promise;
    let ids = req.query.ids;
    if (ids) {
        promise = cloudantEventStore.getEventsForIds(ids.split(","));
    }
    else {
        promise = cloudantEventStore.findSuggestedEvents(5);
    }
    promise.then((events) => {
        let text = 'Here is a list of events:\n';
        for (var event of events) {
            text += '\n' + event.name;
        }
        res.render('events.ejs', {
            text: text,
            events: JSON.stringify(events),
            mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN
        });
    });
});

app.get('/eventList', (req, res) => {
    let promise;
    let ids = req.query.ids;
    if (ids) {
        promise = cloudantEventStore.getEventsForIds(ids.split(","));
    }
    else {
        promise = cloudantEventStore.findSuggestedEvents(5);
    }
    promise.then((events) => {
        res.render('eventList.ejs', {
            events: events,
            eventJson: JSON.stringify(events),
            mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN
        });
    });
});

app.get('/sms', (req, res) => {
    let data = {
        user: req.query.From,
        text: req.query.Body
    };
    const remoteControlId = eventBot.getRemoteControlForUserId(data.user);
    if (remoteControlId) {
        eventBot.sendInputMessageToUserId(remoteControlId, data.text, data.user);
    }
    eventBot.processMessage(data, {skip_name: true})
        .then((reply) => {
            res.setHeader('Content-Type', 'text/plain');
            if (remoteControlId) {
                eventBot.sendOutputMessageToUserId(remoteControlId, reply);
            }
            if (reply.points) {
                // send
                let body = 'Tap here to see some matching events: ' + reply.url;
                res.send(body);
            }
            else if (reply.searches) {
                let body = 'Recent searches:\n';
                let i = 0;
                for (const search of reply.searches) {
                    i++;
                    body += + i + '. ' + search.type + ': ' + search.message + '\n';
                }
                res.send(body);
            }
            else {
                res.send(reply.text);
            }
        })
        .catch((err) => {
            console.log(`Error: ${err}`);
        });
});

// start server on the specified port and binding host
http.listen(appEnv.port, appEnv.bind, () => {
    console.log("Server starting on " + appEnv.url);
});

//require("cf-deployment-tracker-client").track();