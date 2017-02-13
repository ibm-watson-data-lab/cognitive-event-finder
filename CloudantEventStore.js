'use strict';

class CloudantEventStore {

    /**
     * Creates a new instance of CloudantEventStore.
     * @param {Object} cloudant - The instance of cloudant to connect to
     * @param {string} dbName - The name of the database to use
     */
    constructor(cloudant, dbName) {
        this.cloudant = cloudant;
        this.dbName = dbName;
        this.db = null;
    }

    /**
     * Creates and initializes the database.
     * @returns {Promise.<TResult>}
     */
    init() {
        console.log('Getting database...');
        this.db = this.cloudant.db.use(this.dbName);
        // see if the by_popularity design doc exists, if not then create it
        return this.db.find({selector: {'_id': '_design/search'}})
            .then((result) => {
                if (result && result.docs && result.docs.length > 0) {
                    return Promise.resolve();
                }
                else {
                    let designDoc = {
                        _id: '_design/search',
                        indexes: {
                            by_topic: {
                                index: 'function (doc) { \nif (doc.name) { \nindex("name", doc.name, {boost: 2}); \n} \nif (doc.description) { \nindex("description", doc.description, {boost: 1}); \n} \nif (doc.track) { \nindex("track", doc.track, {boost: 2}); \n} \nif (doc.tags && doc.tags.length && doc.tags.length > 0) { \nfor (var i=0; i<doc.tags.length; i++) { \nindex("tag", doc.tags[i].name, {boost: 10}); \n} \n} \n}'
                            },
                            by_speaker: {
                                index: 'function (doc) { \nif (doc.speakers && doc.speakers.length && doc.speakers.length > 0) { \nfor (var i=0; i<doc.speakers.length; i++) { \nindex("speaker", doc.speakers[i].name, {}); \n} \n} \n}'
                            }
                        }
                    };
                    return this.db.insert(designDoc);
                }
            })
            .catch((err) => {
                console.log(`Cloudant error: ${JSON.stringify(err)}`);
            });
    }

    /**
     * Searches for events based on topic.
     * @param searchStr - The search string
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findEventsByTopic(searchStr, count) {
        var query = `name:${searchStr} OR description:${searchStr} OR track:${searchStr} OR tag:${searchStr}`;
        return this.db.search('search', 'by_topic', {q:query, include_docs:true})
            .then((result) => {
                if (result.rows) {
                    var events = [];
                    var i = -1;
                    for (var row of result.rows) {
                        if (count <= 0 || ++i < count) {
                            events.push(row.doc);
                        }
                        else {
                            break;
                        }
                    }
                    return Promise.resolve(events);
                }
                else {
                    return Promise.resolve();
                }
            });
    }

    /**
     * Searches for events based on speaker.
     * @param searchStr - The search string
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findEventsBySpeaker(searchStr, count) {
        var query = `speaker:${searchStr}`;
        return this.db.search('search', 'by_speaker', {q:query, include_docs:true})
            .then((result) => {
                if (result.rows) {
                    var events = [];
                    var i = -1;
                    for (var row of result.rows) {
                        if (count <= 0 || ++i < count) {
                            events.push(row.doc);
                        }
                        else {
                            break;
                        }
                    }
                    return Promise.resolve(events);
                }
                else {
                    return Promise.resolve();
                }
            });
    }

    /**
     * Finds a list of suggested events based on ???
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findSuggestedEvents(count) {
        var query = '*:*';
        return this.db.search('search', 'by_topic', {q:query, include_docs:true})
            .then((result) => {
                if (result.rows) {
                    var events = [];
                    var i = -1;
                    for (var row of result.rows) {
                        if (count <= 0 || ++i < count) {
                            events.push(row.doc);
                        }
                        else {
                            break;
                        }
                    }
                    return Promise.resolve(events);
                }
                else {
                    return Promise.resolve();
                }
            });
    }

    /**
     * Finds a list of events based on id.
     * @param ids - IDs of the events to retrieve
     * @returns {Promise.<TResult>}
     */
    getEventsForIds(ids) {
        let selector = {
            '_id': {'$in': ids}
        };
        return this.db.find({selector: selector})
            .then((result) => {
                if (result.docs) {
                    return Promise.resolve(result.docs);
                }
                else {
                    return Promise.resolve();
                }
            });
    }
}

module.exports = CloudantEventStore;