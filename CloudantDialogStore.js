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
        // return this.cloudant.db.list()
        //     .then((dbNames) => {
        //         var exists = false;
        //         for (var dbName of dbNames) {
        //             if (dbName == this.dbName) {
        //                 exists = true;
        //             }
        //         }
        //         if (!exists) {
        //             console.log(`Creating database ${this.dbName}...`);
        //             return this.cloudant.db.create(this.dbName);
        //         }
        //         else {
        //             return Promise.resolve();
        //         }
        //     })
        //     .then(() => {
        //         this.db = this.cloudant.db.use(this.dbName);
        //         return Promise.resolve();
        //     })
        //     .then(() => {
        //         // see if the by_popularity design doc exists, if not then create it
        //         return this.db.find({selector: {'_id': '_design/by_user_id'}});
        //     })
            // .then((result) => {
            //     if (result && result.docs && result.docs.length > 0) {
            //         return Promise.resolve();
            //     }
            //     else {
            //         var designDoc = {
            //             _id: '_design/by_user_id',
            //             views: {
            //                 ingredients: {
            //                     map: 'function (doc) {\n  if (doc.type && doc.type==\'userIngredientRequest\') {\n    emit(doc.ingredient_name, 1);\n  }\n}',
            //                     reduce: '_sum'
            //                 },
            //                 cuisines: {
            //                     map: 'function (doc) {\n  if (doc.type && doc.type==\'userCuisineRequest\') {\n    emit(doc.cuisine_name, 1);\n  }\n}',
            //                     reduce: '_sum'
            //                 },
            //                 recipes: {
            //                     map: 'function (doc) {\n  if (doc.type && doc.type==\'userRecipeRequest\') {\n    emit(doc.recipe_title, 1);\n  }\n}',
            //                     reduce: '_sum'
            //                 }
            //             },
            //             'language': 'javascript'
            //         };
            //         return this.db.insert(designDoc);
            //     }
            // })
            // .then(() => {
            //     // see if the by_day_of_week design doc exists, if not then create it
            //     return this.db.find({selector: {'_id': '_design/by_day_of_week'}});
            // })
            // .then((result) => {
            //     if (result && result.docs && result.docs.length > 0) {
            //         return Promise.resolve();
            //     }
            //     else {
            //         var designDoc = {
            //             _id: '_design/by_day_of_week',
            //             views: {
            //                 ingredients: {
            //                     map: 'function (doc) {\n  if (doc.type && doc.type==\'userIngredientRequest\') {\n    var weekdays = [\'Sunday\',\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\'];\n    emit(weekdays[new Date(doc.date).getDay()], 1);\n  }\n}',
            //                     reduce: '_sum'
            //                 },
            //                 cuisines: {
            //                     map: 'function (doc) {\n  if (doc.type && doc.type==\'userCuisineRequest\') {\n    var weekdays = [\'Sunday\',\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\'];\n    emit(weekdays[new Date(doc.date).getDay()], 1);\n  }\n}',
            //                     reduce: '_sum'
            //                 },
            //                 recipes: {
            //                     map: 'function (doc) {\n  if (doc.type && doc.type==\'userRecipeRequest\') {\n    var weekdays = [\'Sunday\',\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\'];\n    emit(weekdays[new Date(doc.date).getDay()], 1);\n  }\n}',
            //                     reduce: '_sum'
            //                 }
            //             },
            //             'language': 'javascript'
            //         };
            //         return this.db.insert(designDoc);
            //     }
            // })
            // .catch((err) => {
            //     console.log(`Cloudant error: ${JSON.stringify(err)}`);
            // });
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
}

module.exports = CloudantDialogStore;