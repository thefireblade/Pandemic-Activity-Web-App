const globals = {
    selectedHeuristic: ""
};

const selectHeuristic = (heuristic) => {
    globals.selectHeuristic = heuristic;
    let btn = document.getElementById("dropdownMenu2");
    btn.innerHTML = heuristic;
    console.log(heuristic);
};

const mainGraph = new DisjointSetGraph(10);

