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
        return this.cloudant.db.list()
            .then((dbNames) => {
                let exists = false;
                for (let dbName of dbNames) {
                    if (dbName == this.dbName) {
                        exists = true;
                    }
                }
                if (!exists) {
                    console.log(`Creating database ${this.dbName}...`);
                    return this.cloudant.db.create(this.dbName);
                }
                else {
                    return Promise.resolve();
                }
            })
            .then(() => {
                this.db = this.cloudant.db.use(this.dbName);
                return Promise.resolve();
            })
            .then(() => {
                // see if the by_popularity design doc exists, if not then create it
                return this.db.find({selector: {'_id': '_design/by_keyword'}});
            })
            .then((result) => {
                if (result && result.docs && result.docs.length > 0) {
                    return Promise.resolve();
                }
                else {
                    let designDoc = {
                        _id: '_design/by_keyword',
                        indexes: {
                            searchidx: {
                                index: 'function (doc) { \nif (doc.name) { \nindex("name", doc.name, {store: true, boost: 2}); \n} \nif (doc.description) { \nindex("description", doc.description, {store: true, boost: 1}); \n} \nif (doc.track) { \nindex("track", doc.track, {store: true, boost: 2}); \n} \nif (doc.tags && doc.tags.length && doc.tags.length > 0) { \nfor (var i=0; i<doc.tags.length; i++) { \nindex("tag", doc.tags[i].name, {store: true, boost: 10}); \n} \n} \n}'
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
     * Finds a list of events based on keywords.
     * @param keywords - Keywords to search for
     * @param count - Max number of events to return
     * @returns {Promise.<TResult>}
     */
    findEvents(keywords, count) {
        var query = `name:${keywords} OR description:${keywords} OR track:${keywords} OR tag:${keywords}`;
        return this.db.search('by_keyword', 'searchidx', {q:query, include_docs:true})
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
        return this.db.search('by_keyword', 'searchidx', {q:query, include_docs:true})
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