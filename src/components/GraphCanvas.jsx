import { useEffect, useMemo, useRef, useState } from 'react';
import { getPeopleComponents, NODE_TYPES } from '../lib/graph';

const TYPE_COLORS = {
  [NODE_TYPES.people]: { fill: '#22c55e', stroke: '#166534', label: '#052e16' },
  [NODE_TYPES.gym]: { fill: '#38bdf8', stroke: '#075985', label: '#082f49' },
  [NODE_TYPES.store]: { fill: '#fb7185', stroke: '#9f1239', label: '#4c0519' },
};

const CLUSTER_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
  '#65a30d',
  '#c026d3',
  '#0f766e',
  '#ca8a04',
];

function getClusterColor(community) {
  return CLUSTER_COLORS[community % CLUSTER_COLORS.length];
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function layoutByType(graph, width, height) {
  const paddingX = Math.max(56, width * 0.07);
  const paddingY = Math.max(46, height * 0.08);
  const lanes = {
    [NODE_TYPES.gym]: paddingX,
    [NODE_TYPES.people]: width / 2,
    [NODE_TYPES.store]: width - paddingX,
  };
  const byType = {
    [NODE_TYPES.gym]: [],
    [NODE_TYPES.people]: [],
    [NODE_TYPES.store]: [],
  };

  graph.nodes.forEach((node) => byType[node.type].push(node));

  const positions = new Map();
  Object.entries(byType).forEach(([type, nodes]) => {
    nodes.forEach((node, index) => {
      const progress = nodes.length <= 1 ? 0.5 : index / (nodes.length - 1);
      const wave = Math.sin(progress * Math.PI * 6) * (type === NODE_TYPES.people ? 18 : 10);
      positions.set(node.index, {
        x: lanes[type] + wave,
        y: paddingY + progress * (height - paddingY * 2),
      });
    });
  });

  return positions;
}

function layoutByCommunity(graph, communities, width, height) {
  const padding = 58;
  const communityIds = Array.from(new Set(communities)).sort((a, b) => a - b);
  const columns = Math.ceil(Math.sqrt(communityIds.length));
  const rows = Math.ceil(communityIds.length / columns);
  const cellWidth = (width - padding * 2) / Math.max(1, columns);
  const cellHeight = (height - padding * 2) / Math.max(1, rows);
  const positions = new Map();
  const bounds = new Map();

  communityIds.forEach((communityId, communityIndex) => {
    const nodes = graph.nodes.filter((node) => communities[node.index] === communityId);
    const peopleCount = nodes.filter((node) => node.type === NODE_TYPES.people).length;
    const column = communityIndex % columns;
    const row = Math.floor(communityIndex / columns);
    const centerX = padding + cellWidth * (column + 0.5);
    const centerY = padding + cellHeight * (row + 0.5);
    const radius = Math.max(26, Math.min(cellWidth, cellHeight) * 0.34);

    const byType = {
      [NODE_TYPES.gym]: nodes.filter((node) => node.type === NODE_TYPES.gym),
      [NODE_TYPES.people]: nodes.filter((node) => node.type === NODE_TYPES.people),
      [NODE_TYPES.store]: nodes.filter((node) => node.type === NODE_TYPES.store),
    };

    const typeOffsets = {
      [NODE_TYPES.gym]: -radius * 0.62,
      [NODE_TYPES.people]: 0,
      [NODE_TYPES.store]: radius * 0.62,
    };

    Object.entries(byType).forEach(([type, typeNodes]) => {
      typeNodes.forEach((node, index) => {
        // Spread over [0, 2pi) rather than [0, 2pi]: sharing both endpoints would
        // draw the first and last node of the type on identical coordinates.
        const angle = (index / Math.max(1, typeNodes.length)) * Math.PI * 2;
        const spread = Math.max(7, radius * 0.46);
        positions.set(node.index, {
          x: centerX + typeOffsets[type] + Math.cos(angle) * spread * 0.42,
          y: centerY + Math.sin(angle) * spread,
        });
      });
    });

    bounds.set(communityId, { x: centerX, y: centerY, radius: radius + 18, count: nodes.length, peopleCount });
  });

  return { positions, bounds };
}

function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export default function GraphCanvas({ graph, solution, theme = 'light' }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [hoveredNode, setHoveredNode] = useState(null);

  const selectedKeys = useMemo(() => {
    const keys = new Set();
    solution?.selectedEdges.forEach((edge) => {
      const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
      keys.add(`${a}:${b}`);
    });
    return keys;
  }, [solution]);

  const communities = solution?.meta?.communities;
  const isClusterView = Array.isArray(communities) && communities.length === graph.nodes.length;

  // The scored group: the people the chosen edges actually link together.
  const scoredGroup = useMemo(
    () => getPeopleComponents(graph, solution?.selectedEdges || []),
    [graph, solution],
  );
  const canvasColors =
    theme === 'dark'
      ? {
          background: '#101827',
          mutedText: '#94a3b8',
          edge: 'rgba(148, 163, 184, 0.12)',
          selectedEdge: 'rgba(226, 232, 240, 0.7)',
          hover: '#f8fafc',
          highlight: '#f59e0b',
        }
      : {
          background: '#f8fafc',
          mutedText: '#475569',
          edge: 'rgba(148, 163, 184, 0.16)',
          selectedEdge: 'rgba(15, 23, 42, 0.62)',
          hover: '#020617',
          highlight: '#b45309',
        };

  const layout = useMemo(() => {
    if (isClusterView) {
      return layoutByCommunity(graph, communities, size.width, size.height);
    }
    return { positions: layoutByType(graph, size.width, size.height), bounds: new Map() };
  }, [communities, graph, isClusterView, size.height, size.width]);

  const positions = layout.positions;
  const rankedClusters = useMemo(() => {
    if (!isClusterView) return [];
    return Array.from(layout.bounds.entries())
      .map(([community, bounds]) => ({ community, ...bounds }))
      .sort((a, b) => b.peopleCount - a.peopleCount);
  }, [isClusterView, layout.bounds]);

  const visibleClusters = rankedClusters.slice(0, 8);
  const hiddenClusterCount = rankedClusters.length - visibleClusters.length;

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      setSize({
        width: Math.max(320, Math.floor(width)),
        height: Math.max(520, Math.min(900, Math.floor(window.innerHeight * 0.78))),
      });
    });

    if (wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;

    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    context.fillStyle = canvasColors.background;
    context.fillRect(0, 0, size.width, size.height);

    if (isClusterView) {
      layout.bounds.forEach((bounds, community) => {
        const color = getClusterColor(community);
        context.beginPath();
        context.arc(bounds.x, bounds.y, bounds.radius, 0, Math.PI * 2);
        context.fillStyle = hexToRgba(color, 0.08);
        context.strokeStyle = hexToRgba(color, 0.28);
        context.lineWidth = 1.2;
        context.fill();
        context.stroke();
      });
    }

    // Edges of the scored group are drawn last so the group the score refers to
    // stays traceable on top of everything else.
    const scoredEdges = [];

    graph.links.forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
      const isSelected = selectedKeys.has(`${a}:${b}`);

      if (isSelected && scoredGroup.roots[edge.from] === scoredGroup.largestRoot) {
        scoredEdges.push({ from, to });
        return;
      }

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      if (isSelected) {
        const community = communities?.[edge.from];
        const sameCommunity = isClusterView && community === communities[edge.to];
        context.strokeStyle = sameCommunity ? hexToRgba(getClusterColor(community), 0.72) : canvasColors.selectedEdge;
      } else {
        context.strokeStyle = canvasColors.edge;
      }
      context.lineWidth = isSelected ? 2.2 : 0.8;
      context.stroke();
    });

    context.strokeStyle = canvasColors.highlight;
    context.lineWidth = 2.6;
    scoredEdges.forEach(({ from, to }) => {
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    });

    graph.nodes.forEach((node) => {
      const position = positions.get(node.index);
      const typeColors = TYPE_COLORS[node.type];
      const clusterColor = isClusterView ? getClusterColor(communities[node.index]) : typeColors.fill;
      const radius = node.type === NODE_TYPES.people ? 5.5 : 8;
      const isHovered = hoveredNode === node.index;

      context.beginPath();
      context.arc(position.x, position.y, isHovered ? radius + 4 : radius, 0, Math.PI * 2);
      context.fillStyle = isClusterView ? hexToRgba(clusterColor, 0.82) : typeColors.fill;
      context.strokeStyle = isHovered ? canvasColors.hover : typeColors.stroke;
      context.lineWidth = isHovered ? 2.5 : 1.4;
      context.fill();
      context.stroke();

      if (isClusterView && node.type !== NODE_TYPES.people) {
        context.beginPath();
        context.arc(position.x, position.y, radius * 0.46, 0, Math.PI * 2);
        context.fillStyle = typeColors.fill;
        context.fill();
      }

      // Ring only people, so counting rings gives exactly the score.
      if (node.type === NODE_TYPES.people && scoredGroup.roots[node.index] === scoredGroup.largestRoot) {
        context.beginPath();
        context.arc(position.x, position.y, radius + 3.5, 0, Math.PI * 2);
        context.strokeStyle = canvasColors.highlight;
        context.lineWidth = 2;
        context.stroke();
      }
    });

    context.font = '600 12px Inter, system-ui, sans-serif';
    context.fillStyle = canvasColors.mutedText;
    if (isClusterView) {
      context.fillText(`${solution.meta.communityCount} visual communities`, 18, 28);
      context.fillStyle = canvasColors.highlight;
      context.fillText(`Highlighted: biggest linked group, ${scoredGroup.largestPeople} people = score`, 18, 46);
    } else {
      context.fillText('Gyms', 18, 28);
      context.fillText('People', size.width / 2 - 20, 28);
      context.fillText('Stores', size.width - 62, 28);
    }
  }, [canvasColors, communities, graph, hoveredNode, isClusterView, layout.bounds, positions, scoredGroup, selectedKeys, size, solution]);

  function handlePointerMove(event) {
    const point = getCanvasPoint(canvasRef.current, event);
    let nextHovered = null;

    graph.nodes.some((node) => {
      const position = positions.get(node.index);
      const distance = Math.hypot(point.x - position.x, point.y - position.y);
      if (distance <= 12) {
        nextHovered = node.index;
        return true;
      }
      return false;
    });

    setHoveredNode(nextHovered);
  }

  const hovered = hoveredNode === null ? null : graph.nodes[hoveredNode];

  return (
    <div className="graph-shell" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        onPointerLeave={() => setHoveredNode(null)}
        onPointerMove={handlePointerMove}
      />
      {hovered ? (
        <div className="node-tooltip">
          <strong>{hovered.type}</strong>
          <span>ID {hovered.id}</span>
          <span>{hovered.neighbors.length} options</span>
          {isClusterView ? <span>Community {communities[hovered.index] + 1}</span> : null}
        </div>
      ) : null}
      {isClusterView ? (
        <div className="cluster-legend">
          <strong>Biggest linked group</strong>
          <span>
            <i style={{ background: canvasColors.highlight }} />
            {scoredGroup.largestPeople} people = score
          </span>
          <strong>Communities (people)</strong>
          {visibleClusters.map((cluster) => (
            <span key={cluster.community}>
              <i style={{ background: getClusterColor(cluster.community) }} />
              C{cluster.community + 1}: {cluster.peopleCount}
            </span>
          ))}
          {hiddenClusterCount > 0 ? <span className="legend-more">+{hiddenClusterCount} more</span> : null}
        </div>
      ) : null}
    </div>
  );
}
