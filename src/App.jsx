import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Gauge, GitBranch, Moon, Play, RotateCcw, Square, Sun, Upload } from 'lucide-react';
import GraphCanvas from './components/GraphCanvas';
import { buildSolution, generateActivityGraph, parseGraphJson } from './lib/graph';
import { runMultiStartAsync } from './lib/heuristics';

const SAMPLE_GRAPH = '/assets/test_graph_n=100_k=3_stores=20_gyms=20.json';

const ALGORITHM_SUMMARIES = {
  balanced: {
    title: 'Balanced Greedy',
    body: 'Tests every gym/store pair for each person, minimizes the predicted largest people component, then breaks ties by activity load. Communities are computed for visualization only.',
  },
  degree: {
    title: 'Degree Ordered Greedy',
    body: 'Runs the balanced greedy scorer on the most constrained people first: people with fewer valid gym/store pair choices are assigned earlier.',
  },
  louvain: {
    title: 'Louvain + Balanced',
    body: 'Clusters the graph by modularity first, prefers same-community activities where possible, then applies the same balanced pair scoring.',
  },
  louvainLoad: {
    title: 'Louvain + Load',
    body: 'Clusters first, keeps same-community choices when possible, then prioritizes spreading attendance evenly across activities.',
  },
  load: {
    title: 'Load Balanced',
    body: 'Chooses gym/store pairs that keep activity attendance as even as possible, using component size only as a tie-breaker.',
  },
  leastLoaded: {
    title: 'Least Loaded',
    body: 'Chooses the currently least-used gym and least-used store independently. It is a simple crowd-balancing baseline.',
  },
  local: {
    title: 'Local Improvement',
    body: 'Starts from Balanced Greedy, then tries replacing individual people’s assignments when the replacement lowers the score.',
  },
  anneal: {
    title: 'Simulated Annealing',
    body: 'Starts from a random valid assignment and repeatedly mutates assignments, sometimes accepting worse moves to escape local traps.',
  },
  legacy: {
    title: 'Legacy Greedy',
    body: 'Selects gym and store edges independently with the same component-size score. Communities are shown for comparison, not used by the solver.',
  },
  random: {
    title: 'Random Baseline',
    body: 'Chooses one valid gym and store uniformly at random for each person. Use it to compare the heuristics against an unoptimized assignment.',
  },
};

const ALGORITHM_OPTIONS = [
  { value: 'balanced', label: 'Balanced Greedy' },
  { value: 'degree', label: 'Degree Ordered Greedy' },
  { value: 'louvain', label: 'Louvain + Balanced' },
  { value: 'louvainLoad', label: 'Louvain + Load' },
  { value: 'load', label: 'Load Balanced' },
  { value: 'leastLoaded', label: 'Least Loaded' },
  { value: 'local', label: 'Local Improvement' },
  { value: 'anneal', label: 'Simulated Annealing' },
  { value: 'legacy', label: 'Legacy Greedy' },
  { value: 'random', label: 'Random Baseline' },
];

const RUN_LIMIT = 500000;

const COMPLEXITY_SUMMARIES = {
  balanced: 'Time per run: O(P * Gp * Sp * α(N)). Space: O(N + P).',
  degree: 'Time per run: O(P log P + P * Gp * Sp * α(N)). Space: O(N + P).',
  louvain: 'Time per run: O(L * E + P * Gp * Sp * α(N)). Space: O(N + E).',
  louvainLoad: 'Time per run: O(L * E + P * Gp * Sp * α(N)). Space: O(N + E).',
  load: 'Time per run: O(P * Gp * Sp * α(N)). Space: O(N + P).',
  leastLoaded: 'Time per run: O(P * (Gp + Sp)). Space: O(N + P).',
  local: 'Time per run: roughly O(P * Gp * Sp * P) on a bounded subset. Space: O(N + P).',
  anneal: 'Time per run: O(S * P * α(N)). Space: O(N + P).',
  legacy: 'Time per run: O(P * (Gp + Sp) * α(N)). Space: O(N + P).',
  random: 'Time per run: O(P * α(N)). Space: O(N + P).',
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function NumberField({ label, help, min, max, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <em>{help}</em> : null}
    </label>
  );
}

function parseIntegerField(value, label, min, max) {
  if (value === '' || value === null || value === undefined) {
    throw new Error(`${label} is required.`);
  }
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be a whole number.`);
  }
  if (number < min || number > max) {
    throw new Error(`${label} must be between ${formatNumber(min)} and ${formatNumber(max)}.`);
  }
  return number;
}

function validateGraphConfig(config) {
  const parsed = {
    people: parseIntegerField(config.people, 'People', 1, 2000),
    gyms: parseIntegerField(config.gyms, 'Gyms', 1, 500),
    stores: parseIntegerField(config.stores, 'Stores', 1, 500),
    gymsPerPerson: parseIntegerField(config.gymsPerPerson, 'Gym choices', 1, 500),
    storesPerPerson: parseIntegerField(config.storesPerPerson, 'Store choices', 1, 500),
    seed: parseIntegerField(config.seed, 'Seed', 1, 2147483647),
  };

  if (parsed.gymsPerPerson > parsed.gyms) {
    throw new Error('Gym choices cannot be greater than the number of gyms.');
  }
  if (parsed.storesPerPerson > parsed.stores) {
    throw new Error('Store choices cannot be greater than the number of stores.');
  }

  return parsed;
}

function getProjectedEdges(config) {
  try {
    const parsed = validateGraphConfig(config);
    return parsed.people * (parsed.gymsPerPerson + parsed.storesPerPerson);
  } catch {
    return null;
  }
}

function getConfigFromGraph(graph, fallback) {
  const people = graph.nodes.filter((node) => node.type === 'people');
  const totals = people.reduce(
    (counts, person) => {
      person.neighbors.forEach((neighborIndex) => {
        const type = graph.nodes[neighborIndex].type;
        if (type === 'gym') counts.gyms += 1;
        if (type === 'store') counts.stores += 1;
      });
      return counts;
    },
    { gyms: 0, stores: 0 },
  );

  return {
    ...fallback,
    people: graph.counts.people,
    gyms: graph.counts.gym,
    stores: graph.counts.store,
    gymsPerPerson: Math.max(1, Math.round(totals.gyms / Math.max(1, graph.counts.people))),
    storesPerPerson: Math.max(1, Math.round(totals.stores / Math.max(1, graph.counts.people))),
  };
}

function getScoreExplanation(score, peopleCount) {
  if (peopleCount === 0) {
    return 'No people are in this graph.';
  }
  if (score <= 1) {
    return 'No person is linked to another person through the chosen gyms or stores.';
  }
  if (score === peopleCount) {
    return `All ${formatNumber(peopleCount)} people are linked together through chains of shared chosen gyms or stores.`;
  }
  return `${formatNumber(score)} people are in the biggest group linked together through shared chosen gyms or stores.`;
}

function getScoreDeltaText(delta) {
  if (delta > 0) {
    return `${formatNumber(delta)} fewer people in the biggest linked group than the original graph`;
  }
  return 'Run an algorithm to try to split the graph into smaller linked groups';
}

export default function App() {
  const [graph, setGraph] = useState(null);
  const [solution, setSolution] = useState(null);
  const [algorithm, setAlgorithm] = useState('balanced');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [iterations, setIterations] = useState(40);
  const [graphConfig, setGraphConfig] = useState({
    people: 100,
    gyms: 20,
    stores: 20,
    gymsPerPerson: 3,
    storesPerPerson: 3,
    seed: 2026,
  });
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(null);
  const abortControllerRef = useRef(null);
  const graphRef = useRef(null);

  // Lets an in-flight run tell whether the graph it was started on is still the
  // one on screen; scoring one graph while drawing another reports a score the
  // visualization cannot explain.
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    fetch(SAMPLE_GRAPH)
      .then((response) => response.json())
      .then((json) => {
        const parsed = parseGraphJson(json);
        setGraph(parsed);
        setSolution(buildSolution(parsed, parsed.links, { algorithm: 'Original graph' }));
        setGraphConfig((current) => getConfigFromGraph(parsed, current));
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const scoreDelta = useMemo(() => {
    if (!graph || !solution) return null;
    const original = buildSolution(graph, graph.links);
    return original.largestPeopleComponent - solution.largestPeopleComponent;
  }, [graph, solution]);

  function loadGraphFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseGraphJson(JSON.parse(reader.result));
        abortControllerRef.current?.abort();
        setGraph(parsed);
        setSolution(buildSolution(parsed, parsed.links, { algorithm: 'Original graph' }));
        setGraphConfig((current) => getConfigFromGraph(parsed, current));
        setError('');
      } catch (fileError) {
        setError(fileError.message);
      }
    };
    reader.onerror = () => setError('Could not read the selected file.');
    reader.readAsText(file);
  }

  async function runSolver() {
    if (!graph) return;
    let runs;
    try {
      runs = parseIntegerField(iterations, 'Runs', 1, RUN_LIMIT);
    } catch (runError) {
      setError(runError.message);
      return;
    }
    const targetGraph = graph;
    setIsRunning(true);
    setRunProgress({ completed: 0, total: runs, bestScore: null, elapsedMs: 0 });
    setError('');
    abortControllerRef.current = new AbortController();

    try {
      const nextSolution = await runMultiStartAsync(targetGraph, algorithm, runs, {
        signal: abortControllerRef.current.signal,
        timeSliceMs: 18,
        onProgress: setRunProgress,
      });
      if (graphRef.current === targetGraph) {
        setSolution(nextSolution);
      }
    } catch (runError) {
      if (runError.name !== 'AbortError') {
        setError(runError.message);
      }
    } finally {
      abortControllerRef.current = null;
      setIsRunning(false);
      setRunProgress(null);
    }
  }

  function cancelRun() {
    abortControllerRef.current?.abort();
  }

  function resetGraph() {
    if (!graph) return;
    setSolution(buildSolution(graph, graph.links, { algorithm: 'Original graph' }));
    setError('');
  }

  function updateGraphConfig(key, value) {
    setGraphConfig((current) => ({ ...current, [key]: value }));
  }

  function generateGraph() {
    try {
      const parsedConfig = validateGraphConfig(graphConfig);
      const nextGraph = generateActivityGraph(parsedConfig);
      abortControllerRef.current?.abort();
      setGraph(nextGraph);
      setSolution(buildSolution(nextGraph, nextGraph.links, { algorithm: 'Generated graph' }));
      setGraphConfig((current) => ({ ...current, seed: parsedConfig.seed + 1 }));
      setError('');
    } catch (generateError) {
      setError(generateError.message);
    }
  }

  if (!graph || !solution) {
    return (
      <main className="loading-screen">
        <Activity size={28} />
        <span>Loading graph</span>
      </main>
    );
  }

  const projectedEdges = getProjectedEdges(graphConfig);
  const algorithmSummary = ALGORITHM_SUMMARIES[algorithm];

  return (
    <main className="app" data-theme={theme}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-logo" aria-hidden="true">
            <img src="/jason-logo.png" alt="" />
          </span>
          <div>
            <p className="eyebrow">Pandemic Activity Problem</p>
            <h1>Activity graph solver</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-action"
            aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <label className="file-button">
            <Upload size={17} />
            <span>Import JSON</span>
            <input type="file" accept="application/json,.json" onChange={(event) => loadGraphFile(event.target.files[0])} />
          </label>
        </div>
      </header>

      <section className="workspace">
        <section className="visual-panel">
          <div className="visual-panel-header">
            <div>
              <strong>Visualization</strong>
              <span>
                Each bubble is one disjoint set left after the unchosen edges are dropped. Everyone keeps exactly one gym
                and one store; the score is the people count of the biggest set.
              </span>
            </div>
            <div className="method-summary">
              <strong>{algorithmSummary.title}</strong>
              <span>{algorithmSummary.body}</span>
            </div>
          </div>

          <GraphCanvas graph={graph} solution={solution} theme={theme} />

          <section className="result-strip">
            <div className="result-metric">
              <Gauge size={18} />
              <div>
                <span>Score</span>
                <strong>{formatNumber(solution.largestPeopleComponent)}</strong>
              </div>
            </div>
            <div className="result-copy">
              <span className="score-detail">
                {getScoreExplanation(solution.largestPeopleComponent, graph.counts.people)}
              </span>
              <span className={scoreDelta > 0 ? 'delta positive' : 'delta'}>
                {getScoreDeltaText(scoreDelta)}
              </span>
            </div>
          </section>
          <footer className="author-credit">
            <a href="https://github.com/thefireblade/Pandemic-Activity-Web-App" target="_blank" rel="noreferrer">
              Pandemic Activity Problem demo · Jason Huang · introduced 2022 · GitHub
            </a>
          </footer>
        </section>
      </section>

      <aside className="sidebar">
        <section className="panel graph-editor">
          <div className="panel-title split-title">
            <GitBranch size={18} />
            <span>Graph</span>
            <strong>{formatNumber(graph.links.length)} edges</strong>
          </div>
          <div className="graph-editor-grid">
            <NumberField label="People" help="People who need assignments." min={1} max={2000} value={graphConfig.people} onChange={(value) => updateGraphConfig('people', value)} />
            <NumberField label="Gyms" help="Available gym locations." min={1} max={500} value={graphConfig.gyms} onChange={(value) => updateGraphConfig('gyms', value)} />
            <NumberField label="Stores" help="Available store locations." min={1} max={500} value={graphConfig.stores} onChange={(value) => updateGraphConfig('stores', value)} />
            <NumberField
              label="Gym choices"
              help="Gym options each person can choose from."
              min={1}
              max={500}
              value={graphConfig.gymsPerPerson}
              onChange={(value) => updateGraphConfig('gymsPerPerson', value)}
            />
            <NumberField
              label="Store choices"
              help="Store options each person can choose from."
              min={1}
              max={500}
              value={graphConfig.storesPerPerson}
              onChange={(value) => updateGraphConfig('storesPerPerson', value)}
            />
            <NumberField label="Seed" help="Same seed recreates the same graph." min={1} max={2147483647} value={graphConfig.seed} onChange={(value) => updateGraphConfig('seed', value)} />
          </div>
          <div className="graph-editor-footer">
            <span>{projectedEdges === null ? 'Fix graph values to preview edges' : `Next generated graph: ${formatNumber(projectedEdges)} edges`}</span>
            <button className="secondary-action compact-action" onClick={generateGraph}>
              Apply graph
            </button>
          </div>
        </section>

        <section className="panel controls">
          <label className="field">
            <span>Algorithm</span>
            <select value={algorithm} disabled={isRunning} onChange={(event) => setAlgorithm(event.target.value)}>
              {ALGORITHM_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Runs</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={iterations}
              disabled={isRunning}
              onChange={(event) => setIterations(event.target.value)}
            />
            <em>Runs the algorithm with different random orderings and keeps the best score.</em>
          </label>

          {runProgress ? (
            <div className="run-progress" aria-live="polite">
              <div>
                <span>
                  Run {formatNumber(runProgress.completed)} of {formatNumber(runProgress.total)}
                </span>
                <strong>
                  {runProgress.bestScore === null ? 'Finding first result' : `Best score ${formatNumber(runProgress.bestScore)}`}
                </strong>
              </div>
              <progress value={runProgress.completed} max={runProgress.total} />
            </div>
          ) : null}

          <div className="button-row">
            <button className="primary-action" disabled={isRunning} onClick={runSolver}>
              <Play size={17} />
              <span>{isRunning ? 'Running' : 'Run'}</span>
            </button>
            <button className="icon-action" aria-label={isRunning ? 'Cancel run' : 'Reset graph'} onClick={isRunning ? cancelRun : resetGraph}>
              {isRunning ? <Square size={17} /> : <RotateCcw size={17} />}
            </button>
          </div>

          <div className="complexity-note">
            <span>Complexity</span>
            <strong>{COMPLEXITY_SUMMARIES[algorithm]}</strong>
          </div>

          <div className="run-meta">
            <span>{solution.meta.algorithm}</span>
            <strong>{solution.meta.runtimeMs ? `${solution.meta.runtimeMs.toFixed(1)} ms` : 'Ready'}</strong>
          </div>
          {/* Louvain clusters are a solver input, not the disjoint sets the score counts. */}
          {solution.meta.clusteringRole === 'solver' ? (
            <div className="run-meta">
              <span>Solver clusters</span>
              <strong>{solution.meta.communityCount}</strong>
            </div>
          ) : null}
          <div className="run-meta">
            <span>Selected edges</span>
            <strong>{formatNumber(solution.selectedEdges.length)}</strong>
          </div>
        </section>

        {error ? <div className="error">{error}</div> : null}
      </aside>
    </main>
  );
}
