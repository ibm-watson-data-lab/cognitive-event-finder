'use strict';

class CloudantDialogStore {

    /**
     * Creates a new instance of CloudantDialogStore.
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
        console.log('Getting dialog database...');
        this.db = this.cloudant.db.use(this.dbName);
        // // crate the date/userId index
        // var index = {
        //     type: 'json',
        //     index: {
        //         fields: ['date',"userId"]
        //     }
        // };
        // return this.db.index(index);
        return Promise.resolve(true);
    }

    /**
     * Adds a new conversation to Cloudant.
     * @param dialog - The first dialog in the conversation.
     * @returns {Promise.<TResult>}
     */
    addConversation(userId, dialog) {
        var conversationDoc = {
            userId: userId,
            date: Date.now(),
            dialogs: [dialog]
        };
        return this.db.insert(conversationDoc);
    }

    /**
     * Adds a new dialog to the conversation.
     * @param conversationId - The ID of the conversation in Cloudant
     * @param dialog - The dialog to add to the conversation
     * @returns {Promise.<TResult>}
     */
    addDialog(conversationId, dialog) {
        return this.db.get(conversationId)
            .then((conversationDoc) => {
                conversationDoc.dialogs.push(dialog);
                return this.db.insert(conversationDoc);
            });
    }

    /**
     * Gets the most recent searches for a userId.
     * @param userId - The ID of the user
     * @param count - Max number of searches to return
     * @returns {Promise.<TResult>}
     */
    getRecentSearchesForUserId(userId, count) {
        const selector = {
            'date': {'$gt': 0},
            'userId': userId
        };
        const sort = [{"date": "desc"}];
        return this.db.find({selector: selector, sort: sort})
            .then((result) => {
                let searches = [];
                if (result.docs && result.docs.length > 0) {
                    for(let doc of result.docs) {
                        for (let dialog of doc.dialogs) {
                            if (! dialog.message) {
                                continue;
                            }
                            let search = null;
                            if (dialog.name == 'search_topic') {
                                search = {type: 'topic', message: dialog.message};
                            }
                            else if (dialog.name == 'search_speaker') {
                                search = {type: 'speaker', message: dialog.message};
                            }
                            else if (dialog.name == 'search_suggest') {
                                search = {type: 'suggest', message: dialog.message};
                            }
                            if (search) {
                                const matchingSearches = searches.filter((s) => {
                                    return (s.type == search.type && s.message == search.message);
                                });
                                if (matchingSearches.length == 0) {
                                    searches.push(search);
                                }
                            }
                        }
                        if (searches.length >= count) {
                            break;
                        }
                    }
                }
                return Promise.resolve(searches);
            });
    }
}

module.exports = CloudantDialogStore;