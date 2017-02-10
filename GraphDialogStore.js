'use strict';

class GraphDialogStore {

    /**
     * Creates a new instance of GraphDialogStore.
     * @param {Object} graphClient - The instance of the IBM Graph Client to use
     * @param {String} graphId - The id of the graph to use
     */
    constructor(graphClient, graphId) {
        this.graphClient = graphClient; // Note: this library cannot be promisified using promisifyAll
        this.graphId = graphId;
    }

    /**
     * Creates and initializes the Graph and Graph schema.
     * @param {String} dialogTypes - Array of dialog types that will be used
     * @returns {Promise.<TResult>}
     */
    init(dialogTypes) {
        return new Promise((resolve, reject) => {
            this.graphClient.session((error, token) => {
                this.graphClient.config.session = token;
                this.initGraph()
                    .then(() => {
                        return this.initGraphSchema(dialogTypes);
                    })
                    .then(() => {
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });
    }

    initGraph() {
        return new Promise((resolve, reject) => {
            this.graphClient.graphs().get((err, graphIds) => {
                let graphExists = (graphIds.indexOf(this.graphId) >= 0);
                if (graphExists) {
                    this.updateGraphUrl();
                    resolve();
                }
                else {
                    this.graphClient.graphs().create(this.graphId, (err, response) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            this.updateGraphUrl();
                            resolve();
                        }
                    });
                }
            });
        });
    }

    updateGraphUrl() {
        let url = this.graphClient.config.url;
        this.graphClient.config.url = url.substring(0,url.lastIndexOf('/')+1) + this.graphId
    }

    initGraphSchema(dialogTypes) {
        return new Promise((resolve, reject) => {
            // Set the schema
            console.log('Getting graph schema...');
            this.graphClient.schema().get((error, body) => {
                if (error) {
                    reject(error);
                }
                else {
                    let schema;
                    if (body.result && body.result.data && body.result.data.length > 0) {
                        schema = body.result.data[0];
                    }
                    let schemaExists = (schema && schema.propertyKeys && schema.propertyKeys.length > 0);
                    if (!schemaExists) {
                        console.log('Creating graph schema...');
                        this.graphClient.schema().set(this.getGraphSchema(dialogTypes), (error, body) => {
                            if (error) {
                                reject(error);
                            }
                            else {
                                resolve(schema);
                            }
                        });
                    }
                    else {
                        console.log('Graph schema exists.');
                        resolve(schema);
                    }
                };
            });
        });
    }

    getGraphSchema(dialogTypes) {
        var vertexLabels = [];
        for (var dialogType of dialogTypes) {
            vertexLabels.push({name: dialogType});
        }
        return {
            propertyKeys: [
                {name: 'name', dataType: 'String', cardinality: 'SINGLE'},
                {name: 'detail', dataType: 'String', cardinality: 'SINGLE'}
            ],
            vertexLabels: vertexLabels,
            edgeLabels: [
                {name: 'to'},
                {name: 'from'}
            ],
            vertexIndexes: [
                {name: 'vertexByName', propertyKeys: ['name'], composite: true, unique: true}
            ],
            edgeIndexes: []
        };
    }

    // Dialogs

    /**
     * Gets the unique name for the dialog to be stored in Graph.
     * @param name - The name for the dialog
     * @returns {string}
     */
    getUniqueDialogName(name) {
        return name.trim().toLowerCase();
    }

    /**
     * Finds the dialog based on the specified name in Graph.
     * @param label - The dialog type
     * @param name - The unique name for the dialog
     * @returns {Promise.<TResult>}
     */
    findDialog(type, name) {
        return this.findVertex(type, 'name', this.getUniqueDialogName(name));
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
        let dialogVertex = {label: type};
        dialogVertex['name'] = this.getUniqueDialogName(name);
        if (detail) {
            dialogVertex['detail'] = JSON.stringify(detail).replace(/'/g, '\\\'');
        }
        return this.addVertexIfNotExists(dialogVertex, 'name')
            .then((vertex) => {
                return this.recordDialogRequest(vertex, previousDialogVertex)
                    .then(() => {
                        return Promise.resolve(vertex);
                    });
            });
    }

    /**
     * Creates or updates an edge between a vertex and the dialog vertex.
     * Stores the number of times the dialog has been accessed in the edge.
     * @param dialogVertex - The existing Graph vertex for the dialog
     * @param outVertex - The existing Graph vertex to link from
     * @returns {Promise.<TResult>}
     */
    recordDialogRequest(dialogVertex, previousDialogVertex) {
        if (! previousDialogVertex) {
            return Promise.resolve();
        }
        let edge = {
            label: 'to',
            outV: previousDialogVertex.id,
            inV: dialogVertex.id,
            properties: {'count': 1}
        };
        return this.addUpdateEdge(edge)
            .then(() => {
                edge = {
                    label: 'from',
                    outV: dialogVertex.id,
                    inV: previousDialogVertex.id
                };
                return this.addEdgeIfNotExists(edge)
            });
    }

    /**
     * Finds popular recipes using the specified dialog.
     * @param type - The dialog or comma-separated list of dialogs specified by the user
     * @param type - The dialog or comma-separated list of dialogs specified by the user
     * @param outVertex - The Graph vertex for the user requesting recommended recipes
     * @param count - The max number of recipes to return
     * @returns {Promise.<TResult>}
     */
    findMostAccessedDialogsFromDialog(type, name, fromDialogVertex, count) {
        name = this.getUniqueDialogName(name);
        let query = `g.V().hasLabel("${type}").has("name","${name}")`;
        query += `.in("from")`;
        query += `.inE().has("count",gt(1)).order().by("count", decr)`;
        query += `.outV().hasLabel("${fromDialogVertex.label}").has("name",neq("${fromDialogVertex.properties.name[0].value}"))`;
        query += `.path()`;
        return this.getMostAccessedDialogs(query, count);
    }

    getMostAccessedDialogs(query, count) {
        return new Promise((resolve, reject) => {
            this.graphClient.gremlin(`def g = graph.traversal(); ${query}`, (error, response) => {
                if (error) {
                    console.log(`Error finding Vertexes: ${error}`);
                    reject(error);
                }
                else if (response.result && response.result.data && response.result.data.length > 0) {
                    let dialogs = [];
                    let dialogHash = {};
                    let paths = response.result.data;
                    for (let path of paths) {
                        let dialogVertex = path.objects[1];
                        let dialogId = dialogVertex.properties.name[0].value;
                        let dialog = dialogHash[dialogId];
                        if (! dialog) {
                            if (dialogs.length >= count) {
                                continue;
                            }
                            dialog = {
                                id: dialogId,
                                title: dialogVertex.properties.title[0].value,
                                recommendedUserCount: 1
                            };
                            dialogs.push(dialog);
                            dialogHash[dialogId] = dialog;
                        }
                        else {
                            dialog.recommendedUserCount += 1;
                        }
                    }
                    resolve(dialogs);
                }
                else {
                    resolve([]);
                }
            });
        });
    }

    // Graph Helper Methods

    /**
     * Finds a vertex based on the specified label, propertyName, and propertyValue.
     * @param label - The label value of the vertex stored in Graph
     * @param propertyName - The property name to search for
     * @param propertyValue - The value that should match for the specified property name
     * @returns {Promise.<TResult>}
     */
    findVertex(label, propertyName, propertyValue) {
        return new Promise((resolve, reject) => {
            let query = `g.V().hasLabel("${label}").has("${propertyName}", "${propertyValue}")`;
            this.graphClient.gremlin(`def g = graph.traversal(); ${query}`, (error, response) => {
                if (error) {
                    console.log(`Error finding Vertex: ${error}`);
                    reject(error);
                }
                else if (response.result && response.result.data && response.result.data.length > 0) {
                    resolve(response.result.data[0]);
                }
                else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * Adds a new vertex to Graph if a vertex with the same value for uniquePropertyName does not exist.
     * @param vertex - The vertex to add
     * @param uniquePropertyName - The name of the property used to search for an existing vertex (the value will be extracted from the vertex provided)
     * @returns {Promise.<TResult>}
     */
    addVertexIfNotExists(vertex, uniquePropertyName) {
        return new Promise((resolve, reject) => {
            let propertyValue = `${vertex[uniquePropertyName]}`;
            let query = `g.V().hasLabel("${vertex.label}").has("${uniquePropertyName}", "${propertyValue}")`;
            this.graphClient.gremlin(`def g = graph.traversal(); ${query}`, (error, response) => {
                if (error) {
                    console.log(`Error finding Vertex: ${error}`);
                    reject(error);
                }
                else if (response.result && response.result.data && response.result.data.length > 0) {
                    console.log(`Returning ${vertex.label} vertex where ${uniquePropertyName}=${propertyValue}`);
                    resolve(response.result.data[0]);
                }
                else {
                    console.log(`Creating ${vertex.label} vertex where ${uniquePropertyName}=${propertyValue}`);
                    this.graphClient.vertices().create(vertex, (error, body) => {
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve(body.result.data[0]);
                        }
                    });
                }
            });
        });
    }

    /**
     * Adds a new edge to Graph if an edge with the same out_v and in_v does not exist.
     * @param edge - The edge to add
     * @returns {Promise}
     */
    addEdgeIfNotExists(edge) {
        return new Promise((resolve, reject) => {
            let query = `g.V(${edge.outV}).outE().inV().hasId(${edge.inV}).path()`;
            this.graphClient.gremlin(`def g = graph.traversal(); ${query}`, (error, response) => {
                if (error) {
                    console.log(`Error finding Edge: ${error}`);
                    reject(error);
                }
                else if (response.result && response.result.data && response.result.data.length > 0) {
                    console.log(`Edge from ${edge.outV} to ${edge.inV} exists.`);
                    resolve(null);
                }
                else {
                    console.log(`Creating edge from ${edge.outV} to ${edge.inV}`);
                    this.graphClient.edges().create(edge.label, edge.outV, edge.inV, edge.properties, (error, body) => {
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve(null);
                        }
                    });
                }
            });
        });
    }

    /**
     * Adds a new edge to Graph if an edge with the same out_v and in_v does not exist.
     * Increments the count property on the edge.
     * @param edge - The edge to add
     * @returns {Promise}
     */
    addUpdateEdge(edge) {
        return new Promise((resolve, reject) => {
            let query = `g.V(${edge.outV}).outE().inV().hasId(${edge.inV}).path()`;
            this.graphClient.gremlin(`def g = graph.traversal(); ${query}`, (error, response) => {
                if (error) {
                    console.log(`Error finding Edge: ${error}`);
                    reject(error);
                }
                else if (response.result && response.result.data && response.result.data.length > 0) {
                    console.log(`Edge from ${edge.outV} to ${edge.inV} exists.`);
                    edge = response.result.data[0].objects[1];
                    let count = 0;
                    if (!edge.properties) {
                        edge.properties = {};
                    }
                    if (edge.properties.count) {
                        count = edge.properties.count;
                    }
                    edge.properties['count'] = count + 1;
                    this.graphClient.edges().update(edge.id, edge, (error, body) => {
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve(null);
                        }
                    });
                }
                else {
                    console.log(`Creating edge from ${edge.outV} to ${edge.inV}`);
                    this.graphClient.edges().create(edge.label, edge.outV, edge.inV, edge.properties, (error, body) => {
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve(null);
                        }
                    });
                }
            });
        });
    }
}

module.exports = GraphDialogStore;