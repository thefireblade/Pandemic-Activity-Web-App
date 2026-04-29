# Pandemic Activity Web App

Interactive React solver and visualizer for the Pandemic Activity Problem.

Introduced by Jason Huang in 2022, this demo explores how different graph algorithms choose activity assignments. Each person must choose one gym and one store. The objective is to keep people split into smaller linked groups instead of one large group connected through shared venues.

Repository: https://github.com/thefireblade/Pandemic-Activity-Web-App

Live demo: https://pandemic-activity-proble-2abe9.web.app/

## Score

The score is the number of people in the biggest group still linked through chosen gyms and stores after an assignment is made.

People are linked indirectly through activity nodes. For example:

```text
Person A -> Gym 1 -> Person B -> Store 3 -> Person C
```

Those people are in the same linked group even if they do not all share the exact same activity. Lower scores are better because an exposure in one linked group has fewer paths to reach other people through the selected activities.

This is a graph-risk proxy, not a full disease-spread simulation. The best possible non-empty score is `1`.

## Features

- React + Vite app with Firebase Hosting support.
- Canvas-based graph visualization.
- Community cluster visualization for every solver result.
- Louvain-style community detection implemented in JavaScript.
- Editable graph controls for people, gyms, stores, choices, seed, and runs.
- JSON graph import.
- Light and dark themes.
- Header logo and favicon using Jason Huang's project branding.
- Multiple assignment algorithms and baselines.

## Quick Start

```bash
npm install
npm start
```

Open the local URL printed by Vite. `npm start` runs the app directly from `src/` with hot reload.

## Build

```bash
npm run build
```

The production app is written to `dist/`.

Preview the production build:

```bash
npm run preview
```

## Deploy

Firebase Hosting is configured to serve `dist/`.

Live hosting target: https://pandemic-activity-proble-2abe9.web.app/

```bash
firebase deploy
```

`firebase deploy` runs `npm run build` automatically through the hosting `predeploy` hook, then uploads `dist/`.

You can also use:

```bash
npm run deploy
```

## App Controls

Graph controls:

- `People`: number of people who need activity assignments.
- `Gyms`: available gym locations.
- `Stores`: available store locations.
- `Gym choices`: gym options each person can choose from when generating a graph.
- `Store choices`: store options each person can choose from when generating a graph.
- `Seed`: recreates the same generated graph when reused.

Solver controls:

- `Algorithm`: selects the assignment strategy.
- `Runs`: repeats the selected algorithm with different random orderings or tie-breaks, then keeps the lowest score.

Long runs are chunked in the browser. The UI updates progress between runs and lets you cancel, so large run counts do not freeze the page as aggressively as one synchronous loop.

## Graph JSON Format

Imported files must be JSON objects with `nodes` and `links`.

```json
{
  "nodes": [
    { "id": "1", "type": "people" },
    { "id": "2", "type": "gym" },
    { "id": "3", "type": "store" }
  ],
  "links": [
    { "from": "1", "to": "2" },
    { "from": "1", "to": "3" }
  ]
}
```

Supported node types:

- `people`
- `gym`
- `store`

Every person must have at least one adjacent gym and one adjacent store for the solvers to run.

## Visualization

The visualization groups nodes into Louvain-style communities for every solver result.

- Balanced, Load Balanced, Degree Ordered, Least Loaded, Local Improvement, Simulated Annealing, Legacy, and Random compute communities for display only.
- Louvain-based algorithms use communities as part of the assignment strategy.
- Shaded regions show detected communities.
- Colored selected edges show the current assignment.
- The legend lists the largest detected communities.

## Algorithms

All algorithms are implemented in `src/lib/heuristics.js`.

Notation used below:

- `P`: number of people.
- `N`: total nodes.
- `E`: graph edges.
- `Gp`: gym choices per person.
- `Sp`: store choices per person.
- `L`: Louvain passes.
- `S`: simulated annealing mutation steps.
- `α(N)`: inverse Ackermann factor from disjoint set operations, effectively tiny in practice.

### Balanced Greedy

Visits people in randomized order. For each person, tests every valid `(gym, store)` pair and chooses the pair that:

1. Minimizes the predicted largest linked people group.
2. Breaks ties by lower maximum activity load.
3. Breaks remaining ties by lower combined activity load.
4. Uses seeded random tie-breaking if still tied.

Time per run: `O(P * Gp * Sp * α(N))`.

Space: `O(N + P)`.

### Degree Ordered Greedy

Balanced Greedy, but people with the fewest valid `(gym, store)` pair options are assigned first.

Time per run: `O(P log P + P * Gp * Sp * α(N))`.

Space: `O(N + P)`.

### Louvain + Balanced Greedy

Detects communities first, then prefers same-community gyms and stores where possible before running Balanced Greedy on the filtered choices.

Time per run: `O(L * E + P * Gp * Sp * α(N))`.

Space: `O(N + E)`.

### Louvain + Load Balanced

Detects communities first, then prefers same-community gyms and stores where possible before running the load-balanced objective.

Time per run: `O(L * E + P * Gp * Sp * α(N))`.

Space: `O(N + E)`.

### Load Balanced Greedy

Tests every valid `(gym, store)` pair, but prioritizes even attendance across activities before using connected-group size as a tie-breaker.

Time per run: `O(P * Gp * Sp * α(N))`.

Space: `O(N + P)`.

### Least Loaded

Chooses the currently least-used gym and currently least-used store independently for each person. Useful as a simple crowd-balancing baseline.

Time per run: `O(P * (Gp + Sp))`.

Space: `O(N + P)`.

### Local Improvement

Starts from Balanced Greedy, then tries replacing individual people’s chosen gym/store pair when the replacement improves the score.

Time per run: roughly `O(P * Gp * Sp * P)` on a bounded subset of people.

Space: `O(N + P)`.

### Simulated Annealing

Starts from a random valid assignment, repeatedly mutates one person’s pair, and sometimes accepts worse intermediate scores to escape local traps.

Time per run: `O(S * P * α(N))`.

Space: `O(N + P)`.

### Legacy Greedy

Chooses one activity type first, adds its best single edge, then adds the best single edge for the other activity type. This is included as a comparison to the newer paired greedy strategies.

Time per run: `O(P * (Gp + Sp) * α(N))`.

Space: `O(N + P)`.

### Random Valid Assignment

Chooses one valid gym and one valid store uniformly at random for each person. This is the unoptimized baseline.

Time per run: `O(P * α(N))`.

Space: `O(N + P)`.

## Project Layout

```text
src/
  App.jsx                    Main application shell and controls
  components/GraphCanvas.jsx Canvas graph renderer
  lib/graph.js               Graph parser, generator, validation, and disjoint set
  lib/heuristics.js          Solver implementations
  styles.css                 App styling
public/assets/               Static sample graph data
dist/                        Production build output
```

## Git Ignore / Generated Files

The repo ignores generated and local-only files including:

- `node_modules/`
- `dist/`
- `.firebase/`
- `.vite/`
- `.npm-cache/`
- local `.env` files
- debug logs

`dist/` is generated by `npm run build` and should not be edited directly.

## Notes

- The sample graph lives at `public/assets/test_graph_n=100_k=3_stores=20_gyms=20.json`.
- The app runs fully in the browser; no backend is required.
