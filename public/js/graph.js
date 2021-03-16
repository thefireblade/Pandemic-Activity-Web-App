/**
 * The class that constructs the individual nodes that will be within the Disjoint Set graph.
 */
class DisjointVertex {
    /**
     * The constructor for the Disjoint Vertex class.
     * @param {int} index The "id" of the node. This is unique in every graph.
     * @param {int} rank The rank of the node. This will put a node at a higher priority than other nodes.
     * @param {int} componentSize The number of nodes connected to this node. (Increments as we connect nodes)
     * @param {String} type The type of the node. ie. "people", "gym", "store"
     * @param {Array} neighbors The array of Disjoint Vertex Objects of neighbors connected to this node.
     */
    constructor(index, rank, componentSize, type, neighbors = new Array()) {
        this.index = index;
        this.rank = rank;
        this.type = type;
        this.componentSize = componentSize;
        this.neighbors = neighbors;
        this.parent = this;
    }
}
/**
 * The class that constructs the Disjoint graph used to solve this problem.
 */
class DisjointSetGraph {
    /**
     * The constructor for the Disjointset graph object. 
     * @param {int} vertices The number of nodes to be initialized in the graph. You can add more using the addNode method.
     * @param {int} numPeople The number of people to be initialized in the graph.
     * @param {int} numStores The number of stores to be initialized in the graph.
     * @param {int} numGyms The number of gyms to be initialized in the graph.
     */
    constructor(vertices = 0, numPeople = 0, numStores = 0, numGyms = 0){
        this.vertices = vertices; // Total number of nodes
        this.numPeople = numPeople; // Number of people in the graph
        this.numStores = numStores; // Number of stores in the graph
        this.numGyms = numGyms; // Number of gyms in the graph
        let i = 0;
        this.largestConnectComponent = numPeople > 0 ? 1 : 0;
        this.nodes = [];
        while(i < vertices){
            let componentSize = 0;
            let type = "people";
            if(i < numPeople){
                componentSize = 1;
            } else if( i < numPeople + numGyms) {
                type = "gym";
            } else {
                type = "store";
            }
            this.nodes.push(new DisjointVertex(i, 0, componentSize, type));
            i++;
        }
    }
    /**
     * Generate and add a Disjointset vertex node to the graph
     * @param {String} type The type that would be generated and added
     */
    addNode(type){
        let index = this.vertices;
        this.vertices++;
        let componentSize = 0;
        if(type == "people") {
            this.numPeople++;
            componentSize = 1;
        } else if(type == "store") {
            this.numStores++;
        } else {
            this.numGyms++;
        }
        this.nodes.push(new DisjointVertex(index, 0, componentSize, type));
    }
    /**
     * Returns the parent of the node
     * @param {int} i index of the node to find
     */
    find(i){
        if(this.nodes[i].parent == this.nodes[i].parent.parent){
            return this.nodes[i].parent;
        }
        let parent = this.find(this.nodes[i].parent.index);
        this.nodes[i].parent = parent;
        return parent;
    }
    /**
     * Unions the 2 nodes that match the 2 input indices. Returns the resulting largest component size.
     * @param {int} index1 
     * @param {int} index2 
     */
    union(index1, index2) {
        if(index1 == index2) {
            return this.largestConnectComponent;
        }
        // This is where the edge is added
        let node1 = this.nodes[index1];
        let node2 = this.nodes[index2];
        node1.neighbors.push(node2);
        node2.neighbors.push(node1);
        // This is where the disjoint union calculation is performed
        let top_parent = this.find(index1);
        let bot_parent = this.find(index2);
        if(top_parent == bot_parent){
            return this.largestConnectComponent;
        }
        if(bot_parent.rank > top_parent.rank){
            let temp = bot_parent;
            bot_parent = top_parent;
            top_parent = temp;
        }
        bot_parent.parent = top_parent;
        top_parent.rank += 1;
        top_parent.componentSize += bot_parent.componentSize;
        if(this.largestConnectComponent < top_parent.componentSize){
            this.largestConnectComponent = top_parent.componentSize;
        }
        return this.largestConnectComponent;
    }
    /**
     * Returns the theoretical resulting largest component size of the union of the 2 nodes matching the 2 input indices.
     * @param {int} index1 
     * @param {int} index2 
     */
    testUnion(index1, index2) {
        let top_parent = this.find(index1);
        let bot_parent = this.find(index2);
        if(top_parent == bot_parent) {
            return this.largestConnectComponent;
        } 
        let total =  top_parent.componentSize + bot_parent.componentSize;
        if(total > this.largestConnectComponent){
            return total;
        }
        return this.largestConnectComponent;
    }
    /**
     * Returns a copy of the current graph
     */
    clone(){
        let clone = new DisjointSetGraph(this.vertices, this.numPeople, this.numStores, this.numGyms);
        clone.largestConnectComponent = this.largestConnectComponent;
        clone.nodes.forEach((node, index) => {
            let refNode = this.nodes[index];
            node.rank = refNode.rank;
            node.type = refNode.type;
            node.componentSize = refNode.componentSize;
            node.parent = clone.nodes[refNode.parent.index];
            refNode.neighbors.forEach((neighbor) => {
                node.neighbors.push(clone.nodes[neighbor.index]);
            });
        });
        return clone;
    }
}
/**
 * Parse the file into a Graph Object (Takes in a JSON readable file of the correct format.)
 * @param {File} file The actual file of the gml. 
 */
const parseJSONFileToGraph = (file) => {  
    const parser = new FileReader();
    parser.addEventListener('load', (event) => {
        let content = event.target.result;
        let jsonObj = JSON.parse(content);
        globals.loadedGraph = new DisjointSetGraph();
        jsonObj.nodes.forEach((node)=>{
            globals.loadedGraph.addNode(node.type);
        });
        jsonObj.links.forEach((edge)=>{
            let from = parseInt(edge.from) - 1;
            let to = parseInt(edge.to) - 1;
            globals.loadedGraph.union(from, to);
        });
        renderGraph(globals.loadedGraph);
    });
    parser.readAsText(file);
};
/**
 * To render a graph on the main page. There must be a graph component with the id 'graph' on the document.
 * This function is dependent on the library: vis-network.js
 * @param {DisjointSetGraph} graph Graph to be rendered on the main page
 */
const renderGraph = (graph) => {
    let nodes  = new Array();
    let edges = new Array();
    graph.nodes.forEach(node => {
        nodes.push({ 
            id: node.index,
            label: node.type,
            color: node.type == "people" ? "#4ae872" : node.type == "store" ? "#f55156" : "#44aee3",
        });
        if(node.type != "people"){
            node.neighbors.forEach(neighbor => {
                edges.push({ 
                    from: node.index, 
                    to: neighbor.index
                });
            });
        }
    });
    let nodeData = new vis.DataSet(nodes);
    let edgeData = new vis.DataSet(edges);
    let graphToRender = document.getElementById("graph");
    let data = {
        nodes: nodeData,
        edges: edgeData
    };
    
  let options = {};
  let network = new vis.Network(graphToRender, data, options);
};