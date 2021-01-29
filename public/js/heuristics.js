const runGreedy = (disjointSetGraph) => {
    if(disjointSetGraph.vertices < 1){
        return -1
    }
    let combinationsList = new Array(disjointSetGraph.vertices);
    for (let i = 0; i < combinationsList.length; i++) {
        combinationsList[i] = new Array(0);
    }
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
            let BreakException = {};
            try {
            combination['activities'].forEach(activity=>{
                let score = graphToRender.testUnion(combination['person'], activity);
                if(goal == score){
                    graphToRender.union(combination['person'], activity);
                    smallestScore = -1;
                    throw BreakException;
                }
                if(smallestScore > score) {
                    smallestScore = score;
                }
            });
            } catch(err) {
                // Do nothing
            }
            if(smallestScore > 0){
                combinationsList[smallestScore - 1].push(combinations);
            }
        });
        goal++;
    });
    return graphToRender;
};
