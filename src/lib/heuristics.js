import { DisjointSet, NODE_TYPES, buildSolution, getPersonChoices, validateGraph } from './graph.js';

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function comparePairScore(candidate, best) {
  if (!best) return true;
  if (candidate.component !== best.component) return candidate.component < best.component;
  if (candidate.maxLoad !== best.maxLoad) return candidate.maxLoad < best.maxLoad;
  if (candidate.totalLoad !== best.totalLoad) return candidate.totalLoad < best.totalLoad;
  return candidate.random < best.random;
}

function compareLoadScore(candidate, best) {
  if (!best) return true;
  if (candidate.maxLoad !== best.maxLoad) return candidate.maxLoad < best.maxLoad;
  if (candidate.totalLoad !== best.totalLoad) return candidate.totalLoad < best.totalLoad;
  if (candidate.component !== best.component) return candidate.component < best.component;
  return candidate.random < best.random;
}

function getPeopleIndices(graph) {
  return graph.nodes.filter((node) => node.type === NODE_TYPES.people).map((node) => node.index);
}

function scoreSelectedEdges(graph, selectedEdges) {
  const dsu = new DisjointSet(graph.nodes);
  selectedEdges.forEach((edge) => dsu.union(edge.from, edge.to));
  return dsu.largestPeopleComponent;
}

function createPairGreedySolution(graph, seed, peopleOrder, compareScore, algorithmName) {
  validateGraph(graph);

  const random = createRandom(seed);
  const dsu = new DisjointSet(graph.nodes);
  const selectedEdges = [];
  const activityLoads = new Array(graph.nodes.length).fill(0);

  peopleOrder.forEach((personIndex) => {
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    let best = null;

    gyms.forEach((gymIndex) => {
      stores.forEach((storeIndex) => {
        const score = {
          gymIndex,
          storeIndex,
          component: dsu.previewUnion([personIndex, gymIndex, storeIndex]),
          maxLoad: Math.max(activityLoads[gymIndex] + 1, activityLoads[storeIndex] + 1),
          totalLoad: activityLoads[gymIndex] + activityLoads[storeIndex],
          random: random(),
        };

        if (compareScore(score, best)) {
          best = score;
        }
      });
    });

    selectedEdges.push({ from: personIndex, to: best.gymIndex });
    selectedEdges.push({ from: personIndex, to: best.storeIndex });
    activityLoads[best.gymIndex] += 1;
    activityLoads[best.storeIndex] += 1;
    dsu.union(personIndex, best.gymIndex);
    dsu.union(personIndex, best.storeIndex);
  });

  return buildSolution(graph, selectedEdges, { algorithm: algorithmName, seed });
}

function buildAdjacency(graph) {
  const adjacency = graph.nodes.map(() => new Map());
  graph.links.forEach((edge) => {
    adjacency[edge.from].set(edge.to, (adjacency[edge.from].get(edge.to) || 0) + 1);
    adjacency[edge.to].set(edge.from, (adjacency[edge.to].get(edge.from) || 0) + 1);
  });
  return adjacency;
}

export function detectLouvainCommunities(graph, seed = Date.now()) {
  const random = createRandom(seed);
  const adjacency = buildAdjacency(graph);
  const degrees = adjacency.map((neighbors) => {
    let degree = 0;
    neighbors.forEach((weight) => {
      degree += weight;
    });
    return degree;
  });
  const totalWeight = graph.links.length;
  const communities = graph.nodes.map((node) => node.index);
  const communityDegree = new Map(degrees.map((degree, index) => [index, degree]));

  if (totalWeight === 0) {
    return communities;
  }

  for (let pass = 0; pass < 18; pass += 1) {
    let moved = false;
    const nodeOrder = shuffled(
      graph.nodes.map((node) => node.index),
      random,
    );

    nodeOrder.forEach((nodeIndex) => {
      const currentCommunity = communities[nodeIndex];
      const degree = degrees[nodeIndex];
      const neighborCommunityWeights = new Map();

      adjacency[nodeIndex].forEach((weight, neighborIndex) => {
        const community = communities[neighborIndex];
        neighborCommunityWeights.set(community, (neighborCommunityWeights.get(community) || 0) + weight);
      });

      communityDegree.set(currentCommunity, (communityDegree.get(currentCommunity) || 0) - degree);

      let bestCommunity = currentCommunity;
      let bestGain = 0;

      neighborCommunityWeights.forEach((internalWeight, community) => {
        const gain = internalWeight - (degree * (communityDegree.get(community) || 0)) / (2 * totalWeight);
        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = community;
        }
      });

      communityDegree.set(bestCommunity, (communityDegree.get(bestCommunity) || 0) + degree);
      if (bestCommunity !== currentCommunity) {
        communities[nodeIndex] = bestCommunity;
        moved = true;
      }
    });

    if (!moved) {
      break;
    }
  }

  const normalized = new Map();
  let nextCommunity = 0;
  return communities.map((community) => {
    if (!normalized.has(community)) {
      normalized.set(community, nextCommunity);
      nextCommunity += 1;
    }
    return normalized.get(community);
  });
}

function filterGraphByCommunities(graph, communities) {
  const filteredLinks = [];
  const filteredNeighborSets = graph.nodes.map(() => new Set());

  graph.nodes.forEach((node) => {
    if (node.type !== NODE_TYPES.people) {
      return;
    }

    const choices = getPersonChoices(graph, node.index);
    const localGyms = choices.gyms.filter((gymIndex) => communities[gymIndex] === communities[node.index]);
    const localStores = choices.stores.filter((storeIndex) => communities[storeIndex] === communities[node.index]);
    const gyms = localGyms.length > 0 ? localGyms : choices.gyms;
    const stores = localStores.length > 0 ? localStores : choices.stores;

    [...gyms, ...stores].forEach((activityIndex) => {
      filteredLinks.push({ from: node.index, to: activityIndex });
      filteredNeighborSets[node.index].add(activityIndex);
      filteredNeighborSets[activityIndex].add(node.index);
    });
  });

  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      neighbors: Array.from(filteredNeighborSets[node.index]),
    })),
    links: filteredLinks,
    counts: graph.counts,
  };
}

export function solveBalancedGreedy(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const people = shuffled(
    getPeopleIndices(graph),
    random,
  );

  return createPairGreedySolution(graph, seed, people, comparePairScore, 'Balanced Greedy');
}

export function solveLoadBalanced(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const people = shuffled(
    getPeopleIndices(graph),
    random,
  );

  return createPairGreedySolution(graph, seed, people, compareLoadScore, 'Load Balanced Greedy');
}

export function solveDegreeOrderedGreedy(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const people = shuffled(getPeopleIndices(graph), random).sort((a, b) => {
    const choicesA = getPersonChoices(graph, a);
    const choicesB = getPersonChoices(graph, b);
    return choicesA.gyms.length * choicesA.stores.length - choicesB.gyms.length * choicesB.stores.length;
  });

  return createPairGreedySolution(graph, seed, people, comparePairScore, 'Degree Ordered Greedy');
}

export function solveLeastLoaded(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const selectedEdges = [];
  const activityLoads = new Array(graph.nodes.length).fill(0);
  const people = shuffled(getPeopleIndices(graph), random);

  people.forEach((personIndex) => {
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    const gymIndex = gyms.reduce((best, candidate) => {
      if (activityLoads[candidate] !== activityLoads[best]) return activityLoads[candidate] < activityLoads[best] ? candidate : best;
      return random() < 0.5 ? candidate : best;
    }, gyms[0]);
    const storeIndex = stores.reduce((best, candidate) => {
      if (activityLoads[candidate] !== activityLoads[best]) return activityLoads[candidate] < activityLoads[best] ? candidate : best;
      return random() < 0.5 ? candidate : best;
    }, stores[0]);

    selectedEdges.push({ from: personIndex, to: gymIndex });
    selectedEdges.push({ from: personIndex, to: storeIndex });
    activityLoads[gymIndex] += 1;
    activityLoads[storeIndex] += 1;
  });

  return buildSolution(graph, selectedEdges, { algorithm: 'Least Loaded', seed });
}

export function solveRandomAssignment(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const selectedEdges = [];
  const people = shuffled(
    graph.nodes.filter((node) => node.type === NODE_TYPES.people).map((node) => node.index),
    random,
  );

  people.forEach((personIndex) => {
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    const gymIndex = gyms[Math.floor(random() * gyms.length)];
    const storeIndex = stores[Math.floor(random() * stores.length)];
    selectedEdges.push({ from: personIndex, to: gymIndex });
    selectedEdges.push({ from: personIndex, to: storeIndex });
  });

  return buildSolution(graph, selectedEdges, { algorithm: 'Random Valid Assignment', seed });
}

function bestSingleActivity(dsu, activityLoads, personIndex, activities, random) {
  let best = null;

  activities.forEach((activityIndex) => {
    const candidate = {
      activityIndex,
      component: dsu.previewUnion([personIndex, activityIndex]),
      maxLoad: activityLoads[activityIndex] + 1,
      totalLoad: activityLoads[activityIndex],
      random: random(),
    };

    if (comparePairScore(candidate, best)) {
      best = candidate;
    }
  });

  return best.activityIndex;
}

export function solveLegacyGreedy(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const dsu = new DisjointSet(graph.nodes);
  const selectedEdges = [];
  const activityLoads = new Array(graph.nodes.length).fill(0);
  const people = shuffled(
    graph.nodes.filter((node) => node.type === NODE_TYPES.people).map((node) => node.index),
    random,
  );

  people.forEach((personIndex) => {
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    const firstTypeIsGym = random() >= 0.5;
    const firstOptions = firstTypeIsGym ? gyms : stores;
    const secondOptions = firstTypeIsGym ? stores : gyms;
    const firstActivity = bestSingleActivity(dsu, activityLoads, personIndex, firstOptions, random);
    selectedEdges.push({ from: personIndex, to: firstActivity });
    activityLoads[firstActivity] += 1;
    dsu.union(personIndex, firstActivity);

    const secondActivity = bestSingleActivity(dsu, activityLoads, personIndex, secondOptions, random);
    selectedEdges.push({ from: personIndex, to: secondActivity });
    activityLoads[secondActivity] += 1;
    dsu.union(personIndex, secondActivity);
  });

  return buildSolution(graph, selectedEdges, { algorithm: 'Legacy Greedy', seed });
}

export function solveLouvainBalanced(graph, seed = Date.now()) {
  validateGraph(graph);

  const communities = detectLouvainCommunities(graph, seed);
  const filteredGraph = filterGraphByCommunities(graph, communities);
  const solution = solveBalancedGreedy(filteredGraph, seed);
  const communityCount = new Set(communities).size;

  return {
    ...solution,
    graph,
    meta: {
      ...solution.meta,
      algorithm: 'Louvain + Balanced Greedy',
      communities,
      communityCount,
      seed,
    },
  };
}

export function solveLouvainLoadBalanced(graph, seed = Date.now()) {
  validateGraph(graph);

  const communities = detectLouvainCommunities(graph, seed);
  const filteredGraph = filterGraphByCommunities(graph, communities);
  const solution = solveLoadBalanced(filteredGraph, seed);
  const communityCount = new Set(communities).size;

  return {
    ...solution,
    graph,
    meta: {
      ...solution.meta,
      algorithm: 'Louvain + Load Balanced',
      communities,
      communityCount,
      seed,
    },
  };
}

export function solveLocalImprovement(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const people = shuffled(getPeopleIndices(graph), random);
  const pairByPerson = new Map();
  let currentEdges = solveBalancedGreedy(graph, seed).selectedEdges;
  for (let index = 0; index < currentEdges.length; index += 2) {
    pairByPerson.set(currentEdges[index].from, [currentEdges[index].to, currentEdges[index + 1].to]);
  }

  let currentScore = scoreSelectedEdges(graph, currentEdges);
  const maxPeopleToTry = Math.min(people.length, 120);

  people.slice(0, maxPeopleToTry).forEach((personIndex) => {
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    let bestPair = pairByPerson.get(personIndex);
    let bestScore = currentScore;

    gyms.forEach((gymIndex) => {
      stores.forEach((storeIndex) => {
        const trialEdges = [];
        pairByPerson.forEach((pair, candidatePerson) => {
          if (candidatePerson === personIndex) {
            trialEdges.push({ from: candidatePerson, to: gymIndex }, { from: candidatePerson, to: storeIndex });
          } else {
            trialEdges.push({ from: candidatePerson, to: pair[0] }, { from: candidatePerson, to: pair[1] });
          }
        });
        const trialScore = scoreSelectedEdges(graph, trialEdges);
        if (trialScore < bestScore || (trialScore === bestScore && random() < 0.015)) {
          bestScore = trialScore;
          bestPair = [gymIndex, storeIndex];
        }
      });
    });

    pairByPerson.set(personIndex, bestPair);
    if (bestScore <= currentScore) {
      currentScore = bestScore;
    }
  });

  currentEdges = [];
  pairByPerson.forEach((pair, personIndex) => {
    currentEdges.push({ from: personIndex, to: pair[0] }, { from: personIndex, to: pair[1] });
  });

  return buildSolution(graph, currentEdges, { algorithm: 'Local Improvement', seed });
}

export function solveSimulatedAnnealing(graph, seed = Date.now()) {
  validateGraph(graph);

  const random = createRandom(seed);
  const people = getPeopleIndices(graph);
  const pairByPerson = new Map();
  people.forEach((personIndex) => {
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    pairByPerson.set(personIndex, [
      gyms[Math.floor(random() * gyms.length)],
      stores[Math.floor(random() * stores.length)],
    ]);
  });

  const buildEdges = () => {
    const edges = [];
    pairByPerson.forEach((pair, personIndex) => {
      edges.push({ from: personIndex, to: pair[0] }, { from: personIndex, to: pair[1] });
    });
    return edges;
  };

  let currentEdges = buildEdges();
  let currentScore = scoreSelectedEdges(graph, currentEdges);
  let bestEdges = currentEdges;
  let bestScore = currentScore;
  const steps = Math.min(500, Math.max(80, people.length * 3));

  for (let step = 0; step < steps; step += 1) {
    const personIndex = people[Math.floor(random() * people.length)];
    const previousPair = pairByPerson.get(personIndex);
    const { gyms, stores } = getPersonChoices(graph, personIndex);
    const nextPair = [
      gyms[Math.floor(random() * gyms.length)],
      stores[Math.floor(random() * stores.length)],
    ];
    pairByPerson.set(personIndex, nextPair);
    const trialEdges = buildEdges();
    const trialScore = scoreSelectedEdges(graph, trialEdges);
    const temperature = Math.max(0.1, 8 * (1 - step / steps));
    const acceptWorse = Math.exp((currentScore - trialScore) / temperature) > random();

    if (trialScore <= currentScore || acceptWorse) {
      currentEdges = trialEdges;
      currentScore = trialScore;
      if (trialScore < bestScore) {
        bestEdges = trialEdges;
        bestScore = trialScore;
      }
    } else {
      pairByPerson.set(personIndex, previousPair);
    }
  }

  return buildSolution(graph, bestEdges, { algorithm: 'Simulated Annealing', seed });
}

const SOLVERS = {
  balanced: solveBalancedGreedy,
  degree: solveDegreeOrderedGreedy,
  leastLoaded: solveLeastLoaded,
  load: solveLoadBalanced,
  legacy: solveLegacyGreedy,
  louvain: solveLouvainBalanced,
  louvainLoad: solveLouvainLoadBalanced,
  local: solveLocalImprovement,
  random: solveRandomAssignment,
  anneal: solveSimulatedAnnealing,
};

function getSolver(algorithm) {
  return SOLVERS[algorithm] || solveBalancedGreedy;
}

function shouldReplaceBest(solution, bestSolution) {
  return (
    !bestSolution ||
    solution.largestPeopleComponent < bestSolution.largestPeopleComponent ||
    (solution.largestPeopleComponent === bestSolution.largestPeopleComponent &&
      solution.selectedEdges.length < bestSolution.selectedEdges.length)
  );
}

function finalizeSolution(graph, bestSolution, iterations, runtimeMs) {
  const visualizationCommunities = bestSolution.meta.communities || detectLouvainCommunities(graph, bestSolution.meta.seed);

  return {
    ...bestSolution,
    meta: {
      ...bestSolution.meta,
      communities: visualizationCommunities,
      communityCount: bestSolution.meta.communityCount || new Set(visualizationCommunities).size,
      clusteringRole: bestSolution.meta.communities ? 'solver' : 'visualization',
      iterations,
      runtimeMs,
    },
  };
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function runMultiStart(graph, algorithm, iterations) {
  const solver = getSolver(algorithm);
  const startedAt = performance.now();
  let bestSolution = null;

  for (let index = 0; index < iterations; index += 1) {
    const solution = solver(graph, Date.now() + index * 2654435761);
    if (shouldReplaceBest(solution, bestSolution)) {
      bestSolution = solution;
    }
  }
  return finalizeSolution(graph, bestSolution, iterations, performance.now() - startedAt);
}

export async function runMultiStartAsync(graph, algorithm, iterations, options = {}) {
  const solver = getSolver(algorithm);
  const startedAt = performance.now();
  const total = Math.max(1, Math.floor(iterations));
  const timeSliceMs = options.timeSliceMs || 24;
  let lastYieldAt = performance.now();
  let bestSolution = null;

  for (let index = 0; index < total; index += 1) {
    if (options.signal?.aborted) {
      throw new DOMException('Algorithm run cancelled.', 'AbortError');
    }

    const solution = solver(graph, Date.now() + index * 2654435761);
    if (shouldReplaceBest(solution, bestSolution)) {
      bestSolution = solution;
    }

    options.onProgress?.({
      completed: index + 1,
      total,
      bestScore: bestSolution.largestPeopleComponent,
      elapsedMs: performance.now() - startedAt,
    });

    if (performance.now() - lastYieldAt >= timeSliceMs) {
      await yieldToBrowser();
      lastYieldAt = performance.now();
    }
  }

  return finalizeSolution(graph, bestSolution, total, performance.now() - startedAt);
}
