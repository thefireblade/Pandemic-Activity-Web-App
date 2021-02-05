const globals = {
    selectedHeuristic: "",
    loadedGraph: new DisjointSetGraph(0)
};
const updateScore = (graph = globals.loadedGraph) => {
  document.getElementById('score').innerHTML = graph.largestConnectComponent;
};

const displayError = () => {
  let classes = document.getElementById('error-msg').classList;
  if(classes.contains('hidden')){
    classes.remove('hidden');
  }
};

const hideError = () => {
  let classes = document.getElementById('error-msg').classList;
  if(!classes.contains('hidden')){
    classes.add('hidden')
  }
};

const selectHeuristic = (heuristic) => {
    globals.selectHeuristic = heuristic;
    let btn = document.getElementById("dropdownMenu2");
    btn.innerHTML = heuristic;
};

const loadGraph = (graphToRender) => {
  renderGraph(graphToRender);
  updateScore(graphToRender);
};

const runHeuristic = () => {
  let iterations = parseInt(document.getElementById('iterations').value);
  let bestGraph = null;
  hideError();
  if(globals.selectHeuristic == "Greedy") {
    try {
      let graphToRender = globals.loadedGraph;
      for(let i = 0; i < iterations; i++) {
        graphToRender = runGreedy(globals.loadedGraph);
        if(!bestGraph || graphToRender.largestConnectComponent < bestGraph.largestConnectComponent){
          bestGraph = graphToRender;
        }
      }
      loadGraph(bestGraph);
    } catch (err) {
      console.log(err);
      displayError();
    }
  } else {
    displayError();
  }
};

const renderOriginal = () => {
  loadGraph(globals.loadedGraph);
};
const jsonFileSelector = document.getElementById('jsonInputFile');
jsonFileSelector.addEventListener('change', (event) => {
  hideError();
  const fileList = event.target.files;
  if(fileList.length > 0) {
    try {
      parseJSONFileToGraph(fileList[0]);
      updateScore();
    } catch(err) {
      console.log(err);
      displayError();
    }
  }
});

fetch("./assets/test_graph_n=100_k=3_stores=20_gyms=20.json")
  .then(response => response.json())
  .then(json => {
    parseJSONToGraph(json);
    updateScore();
  });