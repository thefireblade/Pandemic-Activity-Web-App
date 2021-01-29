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


const jsonFileSelector = document.getElementById('jsonInputFile');
jsonFileSelector.addEventListener('change', (event) => {
  const fileList = event.target.files;
  if(fileList.length > 0) {
    parseJSONToGraph(fileList[0])
  }
});