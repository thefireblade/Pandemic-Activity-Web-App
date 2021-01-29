const greedy = (disjointSetGraph) => {
    if(disjointSetGraph.vertices < 1){
        return -1
    }
    let combinationsList = new Array(disjointSetGraph.vertices);
    disjointSetGraph.nodes.forEach(node => {
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
            'activities': storeList,
            'person': node.index
         });
    });
    let goal = 1;
    let graphToRender = new DisjointSetGraph(disjointSetGraph.vertices, disjointSetGraph.numPeople, disjointSetGraph.numStores, disjointSetGraph.numGyms);
    combinationsList.forEach(combinations => {
        combinations.forEach(combination => {
            let smallestScore = disjointSetGraph.vertices;
            combination['activities'].forEach(activity=>{
                let score = graphToRender.testUnion(combination['person'], activity);
                if(goal == score){
                    graphToRender.union(combination['person'], activity);
                    smallestScore = -1;
                    break;
                }
                if(smallestScore > score) {
                    smallestScore = score;
                }
            });
            if(smallestScore > 0){
                combinations[smallestScore - 1].push(combination);
            }
        });
        goal++;
    });
    return graphToRender;
};
