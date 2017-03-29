'use strict';

class CloudantUserStore {

    /**
     * Creates a new instance of CloudantUserStore.
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
        console.log('Getting user database...');
        this.db = this.cloudant.db.use(this.dbName);
        // crate the date/userId index
        var index = {
            type: 'json',
            index: {
                fields: ['token']
            }
        };
        return this.db.index(index);
    }

    /**
     * Adds a new user to Cloudant.
     * @param userId - The id of the user.
     * @param userId - The token for the user.
     * @returns {Promise.<TResult>}
     */
    addUser(userId, token) {
        var userDoc = {
            _id: userId,
            token: token,
            date: Date.now()
        };
        return this.db.insert(userDoc)
            .then(() => {
                return this.getUserForId(userId);
            });
    }

    /**
     * Set the name of the user with the specified ID.
     * @param userId - The id of the user.
     * @param name - The name of the user.
     * @returns {Promise.<TResult>}
     */
    setNameForUser(userId, name) {
        return this.getUserForId(userId)
            .then((userDoc) => {
                if (userDoc) {
                    userDoc.name = name;
                    return this.db.insert(userDoc);
                }
                else {
                    return Promise.resolve();
                }
            });
    }

    /**
     * Gets the user with the specified ID.
     * @param userId - The ID associated with the user
     * @returns {Promise.<TResult>}
     */
    getUserForId(userId) {
        return this.db.get(userId)
            .then((userDoc) => {
                return Promise.resolve(userDoc);
            })
            .catch((err) => {
                if (err.statusCode == 404) {
                    return Promise.resolve(null);
                }
                else {
                    return Promise.reject(err);
                }
            });
    }

    /**
     * Gets the user with the specified token.
     * @param token - The token associated with the user
     * @returns {Promise.<TResult>}
     */
    getUserForToken(token) {
        const selector = {
            'token': token
        };
        return this.db.find({selector: selector})
            .then((result) => {
                if (result.docs && result.docs.length > 0) {
                    return Promise.resolve(result.docs[0]);
                }
                else {
                    return Promise.resolve();
                }
            });
    }
}

module.exports = CloudantUserStore;