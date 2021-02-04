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
