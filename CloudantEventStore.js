'use strict';

class CloudantEventStore {

    /**
     * Creates a new instance of CloudantEventStore.
     * @param {Object} cloudant - The instance of cloudant to connect to
     * @param {string} dbName - The name of the database to use
     */
    constructor(cloudant, dbName, maxSearchTimeHours, timeWarpHours) {
        this.cloudant = cloudant;
        this.dbName = dbName;
        this.db = null;
        this.maxSearchTimeHours = maxSearchTimeHours;
        this.millisPerHour = 60 * 60 * 1000;
        this.timeWarpMillis = timeWarpHours * this.millisPerHour;
    }

    /**
     * Creates and initializes the database.
     * @returns {Promise.<TResult>}
     */
    init() {
        console.log('Getting event database...');
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
                                index: 'function (doc) { \nif (! doc.music) { \nif (doc.time_start) { \nindex("date", Date.parse(doc.time_start), {}); \n} \nif (doc.name) { \nindex("name", doc.name, {boost: 2}); \n} \nif (doc.description) { \nindex("description", doc.description, {boost: 1}); \n} \nif (doc.track) { \nindex("track", doc.track, {boost: 2}); \n} \nif (doc.tags && doc.tags.length && doc.tags.length > 0) { \nfor (var i=0; i<doc.tags.length; i++) { \nindex("tag", doc.tags[i].name, {boost: 10}); \n} \n} \n} \n}'
                            },
                            by_speaker: {
                                index: 'function (doc) { \nif (! doc.music) { \nif (doc.time_start) { \nindex("date", Date.parse(doc.time_start), {}); \n} \nif (doc.speakers && doc.speakers.length && doc.speakers.length > 0) { \nfor (var i=0; i<doc.speakers.length; i++) { \nindex("speaker", doc.speakers[i].name, {}); \n} \n} \n} \n}'
                            },
                            by_music_topic: {
                                index: 'function (doc) { \nif (doc.music) { \nif (doc.time_start) { \nindex("date", Date.parse(doc.time_start), {}); \n} \nif (doc.genre) { \nindex("genre", doc.genre, {boost: 5}); \n} \nif (doc.name) { \nindex("name", doc.name, {boost: 2}); \n} \nif (doc.description) { \nindex("description", doc.description, {boost: 1}); \n} \nif (doc.speakers && doc.speakers.length && doc.speakers.length > 0) { \nfor (var i=0; i<doc.speakers.length; i++) { \nindex("artist", doc.speakers[i].name, {boost: 5}); \n} \n} \n} \n}'
                            },
                            by_music_artist: {
                                index: 'function (doc) { \nif (doc.music && doc._id.substring(0,2) == "ms") { \nif (doc.time_start) { \nindex("date", Date.parse(doc.time_start), {}); \n} \nindex("artist", doc.name, {boost: 10}); \n} \n}'
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
    findEventsByTopic(searchStr, searchTimeHours, count) {
        let query = `name:${searchStr} OR description:${searchStr} OR track:${searchStr} OR tag:${searchStr}`;
        return this.findEvents('search', 'by_topic', query, searchTimeHours, count);
    }

    /**
     * Searches for events based on speaker.
     * @param searchStr - The search string
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findEventsBySpeaker(searchStr, searchTimeHours, count) {
        return this.findEvents('search', 'by_speaker', `speaker:${searchStr}`, searchTimeHours, count);
    }

    /**
     * Finds a list of suggested events based on ???
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findSuggestedEvents(searchTerms, searchTimeHours, count) {
        let query = '';
        let first = true;
        for (const searchTerm of searchTerms) {
            if (first) {
                first = false;
            }
            else {
                query += 'OR ';
            }
            query += `(name:${searchTerm} OR description:${searchTerm} OR track:${searchTerm} OR tag:${searchTerm})`;
        }
        return this.findEvents('search', 'by_topic', query, searchTimeHours, count);
    }

    /**
     * Searches for music events based on topic.
     * @param searchStr - The search string
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findMusicEventsByTopic(searchStr, searchTimeHours, count) {
        let query = `name:${searchStr} OR description:${searchStr} OR genre:${searchStr} OR artist:${searchStr}`;
        return this.findEvents('search', 'by_music_topic', query, searchTimeHours, count);
    }

    /**
     * Searches for events based on topic.
     * @param searchStr - The search string
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findMusicEventsByArtist(searchStr, searchTimeHours, count) {
        return this.findEvents('search', 'by_music_artist', `artist:${searchStr}`, searchTimeHours, count);
    }

    /**
     * Queries the specified design doc and search index
     * @param designDoc
     * @param searchIndex
     * @param query
     * @param searchTimeHours
     * @param count
     * @returns {Promise.<TResult>}
     */
    findEvents(designDoc, searchIndex, query, searchTimeHours, count) {
        const from = Date.now() + this.timeWarpMillis;
        const to = from + (this.millisPerHour * searchTimeHours);
        const queryWithDate = `date:[${from} TO ${to}] AND (${query})`;
        return this.db.search(designDoc, searchIndex, {q:queryWithDate, include_docs:true})
            .then((result) => {
                if (result.rows) {
                    let events = [];
                    let i = -1;
                    for (const row of result.rows) {
                        if (count <= 0 || ++i < count) {
                            events.push(row.doc);
                        }
                        else {
                            break;
                        }
                    }
                    if (events.length >= 1 || searchTimeHours >= this.maxSearchTimeHours) {
                        return Promise.resolve(events);
                    }
                    else {
                        return this.findEvents(designDoc, searchIndex, query, (searchTimeHours*2), count);
                    }
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