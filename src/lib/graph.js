export const NODE_TYPES = {
  people: 'people',
  gym: 'gym',
  store: 'store',
};

export class DisjointSet {
  constructor(nodes) {
    this.parent = nodes.map((_, index) => index);
    this.rank = nodes.map(() => 0);
    this.peopleSize = nodes.map((node) => (node.type === NODE_TYPES.people ? 1 : 0));
    this.largestPeopleComponent = nodes.some((node) => node.type === NODE_TYPES.people) ? 1 : 0;
  }

  find(index) {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index]);
    }
    return this.parent[index];
  }

  previewUnion(indices) {
    const roots = new Map();
    indices.forEach((index) => {
      const root = this.find(index);
      roots.set(root, this.peopleSize[root]);
    });

    let people = 0;
    roots.forEach((size) => {
      people += size;
    });

    return Math.max(this.largestPeopleComponent, people);
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);

    if (rootA === rootB) {
      return this.largestPeopleComponent;
    }

    if (this.rank[rootB] > this.rank[rootA]) {
      [rootA, rootB] = [rootB, rootA];
    }

    this.parent[rootB] = rootA;
    this.peopleSize[rootA] += this.peopleSize[rootB];

    if (this.rank[rootA] === this.rank[rootB]) {
      this.rank[rootA] += 1;
    }

    this.largestPeopleComponent = Math.max(this.largestPeopleComponent, this.peopleSize[rootA]);
    return this.largestPeopleComponent;
  }
}

const normalizeId = (value) => String(value);

export function parseGraphJson(json) {
  if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.links)) {
    throw new Error('Graph JSON must include nodes and links arrays.');
  }

  const idToIndex = new Map();
  const nodes = json.nodes.map((node, index) => {
    if (!Object.values(NODE_TYPES).includes(node.type)) {
      throw new Error(`Unsupported node type at index ${index}. Expected people, gym, or store.`);
    }

    const id = normalizeId(node.id ?? index + 1);
    idToIndex.set(id, index);

    return {
      id,
      index,
      type: node.type,
      neighbors: [],
    };
  });

  const links = [];
  const seenEdges = new Set();

  json.links.forEach((edge) => {
    const from = idToIndex.has(normalizeId(edge.from))
      ? idToIndex.get(normalizeId(edge.from))
      : Number.parseInt(edge.from, 10) - 1;
    const to = idToIndex.has(normalizeId(edge.to))
      ? idToIndex.get(normalizeId(edge.to))
      : Number.parseInt(edge.to, 10) - 1;

    if (!nodes[from] || !nodes[to]) {
      throw new Error(`Edge ${edge.from} -> ${edge.to} references a missing node.`);
    }

    const [a, b] = from < to ? [from, to] : [to, from];
    const key = `${a}:${b}`;
    if (seenEdges.has(key)) {
      return;
    }

    seenEdges.add(key);
    links.push({ from: a, to: b });
    nodes[a].neighbors.push(b);
    nodes[b].neighbors.push(a);
  });

  return {
    nodes,
    links,
    counts: getTypeCounts(nodes),
  };
}

export function getTypeCounts(nodes) {
  return nodes.reduce(
    (counts, node) => {
      counts[node.type] += 1;
      return counts;
    },
    { people: 0, gym: 0, store: 0 },
  );
}

export function getPersonChoices(graph, personIndex) {
  const gyms = [];
  const stores = [];

  graph.nodes[personIndex].neighbors.forEach((neighborIndex) => {
    const type = graph.nodes[neighborIndex].type;
    if (type === NODE_TYPES.gym) {
      gyms.push(neighborIndex);
    } else if (type === NODE_TYPES.store) {
      stores.push(neighborIndex);
    }
  });

  return { gyms, stores };
}

export function buildSolution(graph, selectedEdges, meta = {}) {
  const dsu = new DisjointSet(graph.nodes);
  selectedEdges.forEach((edge) => dsu.union(edge.from, edge.to));

  return {
    graph,
    selectedEdges,
    largestPeopleComponent: dsu.largestPeopleComponent,
    meta,
  };
}

export function validateGraph(graph) {
  const invalidPeople = graph.nodes
    .filter((node) => node.type === NODE_TYPES.people)
    .filter((node) => {
      const choices = getPersonChoices(graph, node.index);
      return choices.gyms.length === 0 || choices.stores.length === 0;
    });

  if (invalidPeople.length > 0) {
    throw new Error(`${invalidPeople.length} people are missing at least one gym or store option.`);
  }
}

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

function sampleUnique(indices, count, random) {
  const pool = indices.slice();
  const selected = [];
  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    selected.push(pool[index]);
    pool.splice(index, 1);
  }
  return selected;
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || min)));
}

export function generateActivityGraph(config) {
  const people = clampInteger(config.people, 1, 2000);
  const gyms = clampInteger(config.gyms, 1, 500);
  const stores = clampInteger(config.stores, 1, 500);
  const gymsPerPerson = clampInteger(config.gymsPerPerson, 1, gyms);
  const storesPerPerson = clampInteger(config.storesPerPerson, 1, stores);
  const seed = clampInteger(config.seed, 1, 2147483647);
  const random = createRandom(seed);

  const nodes = [];
  for (let index = 0; index < people; index += 1) {
    nodes.push({ id: `p-${index + 1}`, type: NODE_TYPES.people });
  }
  for (let index = 0; index < gyms; index += 1) {
    nodes.push({ id: `g-${index + 1}`, type: NODE_TYPES.gym });
  }
  for (let index = 0; index < stores; index += 1) {
    nodes.push({ id: `s-${index + 1}`, type: NODE_TYPES.store });
  }

  const gymIds = nodes.filter((node) => node.type === NODE_TYPES.gym).map((node) => node.id);
  const storeIds = nodes.filter((node) => node.type === NODE_TYPES.store).map((node) => node.id);
  const links = [];

  nodes
    .filter((node) => node.type === NODE_TYPES.people)
    .forEach((person) => {
      sampleUnique(gymIds, gymsPerPerson, random).forEach((gymId) => {
        links.push({ from: person.id, to: gymId });
      });
      sampleUnique(storeIds, storesPerPerson, random).forEach((storeId) => {
        links.push({ from: person.id, to: storeId });
      });
    });

  return parseGraphJson({ nodes, links });
}
