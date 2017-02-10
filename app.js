'use strict';

const cfenv = require('cfenv');
const cloudant = require('cloudant');
const dotenv = require('dotenv');
const express = require('express');
const CloudantEventStore = require('./CloudantEventStore');
const EventBot = require('./EventBot');
const GDS = require('ibm-graph-client');
const GraphDialogStore = require('./GraphDialogStore');
const MockGraphDialogStore = require('./MockGraphDialogStore');
const TwilioRestClient = require('twilio').RestClient;

const appEnv = cfenv.getAppEnv();
const app = express();
const http = require('http').Server(app);

let cloudantEventStore;
let graphDialogStore;

(function() {
    // load environment variables
    dotenv.config();
    // cloudant
    let cloudantClient = cloudant({
        url: process.env.CLOUDANT_URL,
        plugin:'promises'
    });
    cloudantEventStore = new CloudantEventStore(cloudantClient, process.env.CLOUDANT_DB_NAME)
    // graph
    // let graphUrl = process.env.GRAPH_API_URL || config.credentials.apiURL;
    // graphUrl = graphUrl.substring(0,graphUrl.lastIndexOf('/')+1) + process.env.GRAPH_ID;
    // let graphClient = new GDS({
    //     url: process.env.GRAPH_API_URL || config.credentials.apiURL,
    //     username: process.env.GRAPH_USERNAME || config.credentials.username,
    //     password: process.env.GRAPH_PASSWORD || config.credentials.password,
    // });
    // let graphDialogStore = new GraphDialogStore(graphClient, process.env.GRAPH_ID);
    let graphDialogStore = new MockGraphDialogStore();
    let eventBot = new EventBot(
        cloudantEventStore,
        graphDialogStore,
        process.env.SPOONACULAR_KEY,
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
app.get('/', function(req, res) {
    res.render('index.ejs', {
        webSocketProtocol: appEnv.url.indexOf('http://') == 0 ? 'ws://' : 'wss://',
        mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN
    });
});

// map requests
app.get('/events', function(req, res) {
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

// start server on the specified port and binding host
http.listen(appEnv.port, appEnv.bind, () => {
    console.log("Server starting on " + appEnv.url);
});

//require("cf-deployment-tracker-client").track();