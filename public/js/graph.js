class DisjointVertex {
    constructor(index, rank, componentSize, type, neighbors = []) {
        this.index = index;
        this.rank = rank;
        this.type = type;
        this.componentSize = componentSize;
        this.neighbors = neighbors;
        this.parent = this;
    }
}

class DisjointSetGraph {
    constructor(vertices = 0, numPeople = 0, numStores = 0, numGyms = 0){
        this.vertices = vertices; // Total number of nodes
        this.numPeople = numPeople; // Number of people in the graph
        this.numStores = numStores; // Number of stores in the graph
        this.numGyms = numGyms; // Number of gyms in the graph
        let i = 0;
        this.largestConnectComponent = 1;
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
            temp = bot_parent;
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
}
/**
 * 
 * @param {File} file The actual file of the gml. 
 */
const parseJSONToGraph = (file) => {  
    const reader = new FileReader();
    const parser = new FileReader();
    reader.addEventListener('load', (event) => {
        let content = event.target.result;
        renderGraph(content);
    });
    reader.readAsDataURL(file); 
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
            globals.loadedGraph.find(from).neighbors.push(globals.loadedGraph.find(to))
            globals.loadedGraph.find(to).neighbors.push(globals.loadedGraph.find(from))
        });
    });
    parser.readAsText(file);
    // console.log(file);

};

const renderGraph = (file) => {
    let svg = d3.select("svg")
                .attr("width",  1920)
                .attr("height",  1080)
                .call(d3.zoom().on("zoom", function () {
                    svg.attr("transform", d3.event.transform)
                }));
    let width = window.innerWidth;
    let height = window.innerHeight;

    let simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(function(d) { return d.id; }))
        .force("charge", d3.forceManyBody().strength(-400))
        .force("center", d3.forceCenter(width / 2, height / 2));

    d3.json(file, function(error, graph) {
        if (error) throw error;
        
        graph.links.forEach(function(d){
            d.source = d.from;    
            d.target = d.to;
        });           
        
        var link = svg.append("g")
                        .style("stroke", "#aaa")
                        .selectAll("line")
                        .data(graph.links)
                        .enter().append("line");
        
        var node = svg.append("g")
                    .attr("class", "nodes")
        .selectAll("circle")
                    .data(graph.nodes)
        .enter().append("circle")
                .attr("r", 6)
        
        var label = svg.append("g")
            .attr("class", "labels")
            .selectAll("text")
            .data(graph.nodes)
            .enter().append("text")
                .attr("class", "label")
                .text(function(d) { return d.type; });
        
        simulation
            .nodes(graph.nodes)
            .on("tick", ticked);
        
        simulation.force("link")
            .links(graph.links);
        
        function ticked() {
            link
                .attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });
        
            node
                .attr("r", 20)
                .style("fill", "#d9d9d9")
                .style("stroke", "#969696")
                .style("stroke-width", "2px")
                .attr("cx", function (d) { return d.x+6; })
                .attr("cy", function(d) { return d.y-6; });
            
            label
                .attr("x", function(d) { return d.x; })
                .attr("y", function (d) { return d.y; })
                .style("font-size", "10px").style("fill", "#4393c3");
        }
    });
};