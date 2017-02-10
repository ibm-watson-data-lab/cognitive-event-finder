'use strict';

class MockGraphDialogStore {

    /**
     * Creates a new instance of MockGraphDialogStore.
     */
    constructor() {
    }

    /**
     * Creates and initializes the Graph and Graph schema.
     * @param {String} dialogTypes - Array of dialog types that will be used
     * @returns {Promise.<TResult>}
     */
    init(dialogTypes) {
        return Promise.resolve();
    }

    // Dialogs

    /**
     * Finds the dialog based on the specified name in Graph.
     * @param label - The dialog type
     * @param name - The unique name for the dialog
     * @returns {Promise.<TResult>}
     */
    findDialog(type, name) {
        return Promise.resolve(null);
    }

    /**
     * Adds a new dialog to Graph if it does not already exist.
     * @param type - The dialog type
     * @param name - The unique name for the dialog
     * @param detail - A JSON object specifying any details associated with the dialog
     * @param previousDialogVertex - The previous dialog Graph vertex to link from
     * @returns {Promise.<TResult>}
     */
    addDialog(type, name, detail, previousDialogVertex) {
        return Promise.resolve(null);
    }
}

module.exports = MockGraphDialogStore;