'use strict';

const cfenv = require('cfenv');
const cloudant = require('cloudant');
const dotenv = require('dotenv');
const express = require('express');
const CloudantEventStore = require('./CloudantEventStore');
const EventBot = require('./EventBot');
const TwilioRestClient = require('twilio').RestClient;

const appEnv = cfenv.getAppEnv();
const app = express();
const http = require('http').Server(app);

let cloudantEventStore;
let eventBot;
let clientIdsByPhoneNumber = {};

(function() {
    // load environment variables
    dotenv.config();
    // cloudant
    let cloudantClient = cloudant({
        url: process.env.CLOUDANT_URL,
        plugin:'promises'
    });
    cloudantEventStore = new CloudantEventStore(cloudantClient, process.env.CLOUDANT_DB_NAME)
    eventBot = new EventBot(
        cloudantEventStore,
        process.env.CONVERSATION_USERNAME,
        process.env.CONVERSATION_PASSWORD,
        process.env.CONVERSATION_WORKSPACE_ID,
        new TwilioRestClient(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN),
        process.env.TWILIO_PHONE_NUMBER,
        http,
        appEnv.url
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
        clientId: req.query.clientId
    });
});

// map requests
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

app.get('/control', (req, res) => {
    const clientId = req.query.clientId;
    const phoneNumber = req.query.phone;
    if (phoneNumber) {
        clientIdsByPhoneNumber[phoneNumber] = clientId;
        let data = {
            user: phoneNumber,
            text: 'hi'
        };
        eventBot.clearUserStateForUser(data.user);
        eventBot.processMessage(data, {skip_name: true})
            .then((reply) => {
                eventBot.sendOutputMessageToClientId(clientIdsByPhoneNumber[data.user], reply);
                return eventBot.sendTextMessage(phoneNumber, reply.text);
            })
            .then(() => {
                res.send('OK');
            })
            .catch((err) => {
                res.send(`Error: ${err}`);
            });
    }
    else if (clientId) {
        for(let key in clientIdsByPhoneNumber) {
            if (clientIdsByPhoneNumber[key] == clientId) {
                delete clientIdsByPhoneNumber[key];
            }
        }
        res.send('OK');
    }

});

app.get('/sms', (req, res) => {
    let data = {
        user: req.query.From,
        text: req.query.Body
    };
    const clientId = clientIdsByPhoneNumber[data.user];
    if (clientId) {
        const username = data.user.substring(1,5) + '*';
        eventBot.sendInputMessageToClientId(clientIdsByPhoneNumber[data.user], data.text, username);
    }
    eventBot.processMessage(data, {skip_name: true})
        .then((reply) => {
            res.setHeader('Content-Type', 'text/plain');
            if (clientId) {
                eventBot.sendOutputMessageToClientId(clientId, reply);
            }
            if (reply.points) {
                // clear user state
                eventBot.clearUserStateForUser(data.user);
                // send
                let body = eventBot.baseUrl + '/events';
                if (reply.points && reply.points.length > 0) {
                    body += '?ids=';
                    let first = true;
                    for(var point of reply.points) {
                        if (first) {
                            first = false;
                        }
                        else {
                            body += '%2C';
                        }
                        body += point._id;
                    }
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