const globals = {
    selectedHeuristic: "",
    loadedGraph: new DisjointSetGraph(0)
};

const selectHeuristic = (heuristic) => {
    globals.selectHeuristic = heuristic;
    let btn = document.getElementById("dropdownMenu2");
    btn.innerHTML = heuristic;
};

const runHeuristic = () => {
  if(globals.selectHeuristic == "Greedy") {
    console.log(runGreedy(globals.loadedGraph));
  }
};

const jsonFileSelector = document.getElementById('jsonInputFile');
jsonFileSelector.addEventListener('change', (event) => {
  const fileList = event.target.files;
  if(fileList.length > 0) {
    parseJSONToGraph(fileList[0])
  }
});

