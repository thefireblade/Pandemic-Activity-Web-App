/**
 * Shuffles array in place. Performs Fisher–Yates Shuffle and source to this code can be found here: https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}
/**
 * Runs the algorithm detailed in the documentation on Greedy. This is the "Greedy Queue" implementation 
 * @param {DisjointSetGraph} disjointSetGraph 
 * @returns {DisjointSetGraph} A copy of the graph that contains the result of running the following heuristic.
 */
const runGreedy = (disjointSetGraph) => {
    if(disjointSetGraph.vertices < 1){
        return -1
    }
    let combinationsList = new Array(disjointSetGraph.vertices + 1);
    for (let i = 0; i < combinationsList.length; i++) {
        combinationsList[i] = new Array();
    }
    disjointSetGraph.nodes.forEach(node => {
        if(node.type == "people"){
            let storeList = [];
            let gymList = [];
            node.neighbors.forEach(neighbor => {
                // We assume that the node is a person and is not adjacent to any other person
                if(neighbor.type == "gym") {
                    gymList.push(neighbor.index);
                } else {
                    storeList.push(neighbor.index);
                }
            });
            combinationsList[0].push({
                'activities': storeList,
                'person': node.index
            });
            combinationsList[0].push({
                'activities': gymList,
                'person': node.index
            });
        }
    });
    shuffle(combinationsList[0]);
    let graphToRender = new DisjointSetGraph(disjointSetGraph.vertices, disjointSetGraph.numPeople, disjointSetGraph.numStores, disjointSetGraph.numGyms);
    let goal  = 0;
    for(let goal = 0; goal < combinationsList.length; goal++) {
        let combinations = combinationsList[goal];
        while(combinations.length > 0){
            let combination = combinations.pop();
            let smallestScore = -1;
            for(let i = 0; i < combination['activities'].length; i++) {
                let activity = combination['activities'][i];
                let score = graphToRender.testUnion(combination['person'], activity);
                if(goal + 1 == score){
                    graphToRender.union(combination['person'], activity);
                    smallestScore = -1;
                    break;
                }
                if(smallestScore > score || smallestScore == -1) {
                    smallestScore = score;
                }
            }
            if(smallestScore > 0) {
                combinationsList[smallestScore - 1].push(combination);
            }
        }
    }
    return graphToRender;
};
/**
* This function makes changes to the disjoint Set graph (Partitions the original graph using Louvain)
* @param {DisjointSetGraph} disjointSetGraph Graph to be inputted and run.
* @returns {DisjointSetGraph} A copy of the graph that has been partitioned and fixed.
*/
const runLouvainGreedy = (original) => {
   let disjointSetGraph = original.clone();
   let node_data = [];
   let edge_data = [];
   disjointSetGraph.nodes.forEach(node => {
       node_data.push(node.index)
       if(node.type == "people"){
           node.neighbors.forEach(neighbor => {
               edge_data.push({
                   source: node.index,
                   target: neighbor.index,
                   weight: 1.0
               });
           });
       }
   });
   let community = jLouvain()
   .nodes(node_data)
   .edges(edge_data)();
   disjointSetGraph.nodes.forEach(node => {
       let hasGym = false;
       let hasStore = false;
       node.neighbors.forEach((neighbor, index) => {
           if(community[node.index] !== community[neighbor.index]){
               node.neighbors.splice(index, 1);
           } else {
               if(neighbor.type == "gym"){
                   hasGym = true;
               } else {
                   hasStore = true;
               }
           }
       });
       // Fix illegal people
       if(!hasGym || !hasStore){
           original.nodes[node.index].neighbors.forEach(neighbor =>{
               if(neighbor.type == "gym" && !hasGym){
                   node.neighbors.push(neighbor);
               } else if(neighbor.type == "store" && !hasStore) {
                   node.neighbors.push(neighbor);
               }
           });
       }
   });
   return runGreedy(disjointSetGraph);
};
/**
 * This function makes changes to the disjoint Set graph (Partitions the original graph)
 * @param {} disjointSetGraph 
 */
const runLouvainGreedy2 = (disjointSetGraph) => {
    let node_data = [];
    let edge_data = [];
    disjointSetGraph.nodes.forEach(node => {
        node_data.push(node.index)
        if(node.type == "people"){
            node.neighbors.forEach(neighbor => {
                edge_data.push({
                    source: node.index,
                    target: neighbor.index,
                    weight: 1.0
                });
            });
        }
    });
    let community = jLouvain()
	.nodes(node_data)
	.edges(edge_data)();
    let original = disjointSetGraph.clone();
    disjointSetGraph.nodes.forEach(node => {
        let hasGym = false;
        let hasStore = false;
        node.neighbors.forEach((neighbor, index) => {
            if(community[node.index] !== community[neighbor.index]){
                node.neighbors.splice(index, 1);
            } else {
                if(neighbor.type == "gym"){
                    hasGym = true;
                } else {
                    hasStore = true;
                }
            }
        });
        // Fix illegal people
        if(!hasGym || !hasStore){
            original.nodes[node.index].neighbors.forEach(neighbor =>{
                if(neighbor.type == "gym" && !hasGym){
                    node.neighbors.push(neighbor);
                } else if(neighbor.type == "store" && !hasStore) {
                    node.neighbors.push(neighbor);
                }
            });
        }
    });
    return runGreedy(disjointSetGraph);
};
