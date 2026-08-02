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

const UNUSED_GROUP = -1;

function getClusterColor(group) {
  return CLUSTER_COLORS[group % CLUSTER_COLORS.length];
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Partitions nodes into the disjoint sets the chosen edges leave behind, which
 * is the thing the score measures: the score is the people count of the biggest
 * set. Sets are numbered by people descending, so set 1 is always the score.
 * Activities nobody chose end up in no set at all and are parked separately.
 */
function getDisjointSets(graph, selectedEdges) {
  const { roots, peopleByRoot, largestRoot, largestPeople } = getPeopleComponents(graph, selectedEdges);

  const populated = [...peopleByRoot.entries()].sort((a, b) => b[1] - a[1]);
  const groupByRoot = new Map(populated.map(([root], group) => [root, group]));
  const groupOf = roots.map((root) => (groupByRoot.has(root) ? groupByRoot.get(root) : UNUSED_GROUP));

  return {
    groupOf,
    peopleByGroup: populated.map(([, people]) => people),
    setCount: populated.length,
    largestGroup: groupByRoot.get(largestRoot) ?? UNUSED_GROUP,
    largestPeople,
    unusedCount: groupOf.filter((group) => group === UNUSED_GROUP).length,
  };
}

function layoutBySet(graph, sets, width, height) {
  const padding = 58;
  const groupIds = [...Array(sets.setCount).keys()];
  if (sets.unusedCount > 0) {
    groupIds.push(UNUSED_GROUP);
  }

  const columns = Math.ceil(Math.sqrt(groupIds.length));
  const rows = Math.ceil(groupIds.length / columns);
  const cellWidth = (width - padding * 2) / Math.max(1, columns);
  const cellHeight = (height - padding * 2) / Math.max(1, rows);
  const positions = new Map();
  const bounds = new Map();

  groupIds.forEach((groupId, slot) => {
    const nodes = graph.nodes.filter((node) => sets.groupOf[node.index] === groupId);
    const column = slot % columns;
    const row = Math.floor(slot / columns);
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

    bounds.set(groupId, {
      x: centerX,
      y: centerY,
      radius: radius + 18,
      count: nodes.length,
      peopleCount: groupId === UNUSED_GROUP ? 0 : sets.peopleByGroup[groupId],
    });
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

  const selectedEdges = solution?.selectedEdges;

  const sets = useMemo(() => getDisjointSets(graph, selectedEdges || []), [graph, selectedEdges]);

  const canvasColors =
    theme === 'dark'
      ? {
          background: '#101827',
          mutedText: '#94a3b8',
          idle: 'rgba(148, 163, 184, 0.35)',
          hover: '#f8fafc',
          highlight: '#f59e0b',
        }
      : {
          background: '#f8fafc',
          mutedText: '#475569',
          idle: 'rgba(100, 116, 139, 0.4)',
          hover: '#020617',
          highlight: '#b45309',
        };

  const layout = useMemo(() => layoutBySet(graph, sets, size.width, size.height), [graph, sets, size.height, size.width]);
  const positions = layout.positions;

  const rankedSets = useMemo(
    () =>
      [...Array(sets.setCount).keys()].map((group) => ({
        group,
        peopleCount: sets.peopleByGroup[group],
      })),
    [sets],
  );
  const visibleSets = rankedSets.slice(0, 8);
  const hiddenSetCount = rankedSets.length - visibleSets.length;

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

    layout.bounds.forEach((bound, groupId) => {
      const isUnused = groupId === UNUSED_GROUP;
      const isLargest = groupId === sets.largestGroup;
      const color = isUnused ? canvasColors.idle : getClusterColor(groupId);

      context.beginPath();
      context.arc(bound.x, bound.y, bound.radius, 0, Math.PI * 2);
      context.fillStyle = isUnused ? 'rgba(148, 163, 184, 0.05)' : hexToRgba(color, 0.08);
      context.fill();
      context.strokeStyle = isLargest ? canvasColors.highlight : isUnused ? canvasColors.idle : hexToRgba(color, 0.28);
      context.lineWidth = isLargest ? 2.4 : 1.2;
      context.stroke();
    });

    // Only the surviving edges are drawn. Showing the discarded options too is
    // what made it impossible to see that each person keeps one gym and one
    // store, and it smeared the disjoint sets into each other.
    (selectedEdges || []).forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      const group = sets.groupOf[edge.from];

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle =
        group === sets.largestGroup ? canvasColors.highlight : hexToRgba(getClusterColor(group), 0.72);
      context.lineWidth = group === sets.largestGroup ? 2.6 : 2;
      context.stroke();
    });

    graph.nodes.forEach((node) => {
      const position = positions.get(node.index);
      const typeColors = TYPE_COLORS[node.type];
      const group = sets.groupOf[node.index];
      const isUnused = group === UNUSED_GROUP;
      const radius = node.type === NODE_TYPES.people ? 5.5 : 8;
      const isHovered = hoveredNode === node.index;

      context.beginPath();
      context.arc(position.x, position.y, isHovered ? radius + 4 : radius, 0, Math.PI * 2);
      context.fillStyle = isUnused ? canvasColors.idle : hexToRgba(getClusterColor(group), 0.82);
      context.strokeStyle = isHovered ? canvasColors.hover : typeColors.stroke;
      context.lineWidth = isHovered ? 2.5 : 1.4;
      context.fill();
      context.stroke();

      if (node.type !== NODE_TYPES.people) {
        context.beginPath();
        context.arc(position.x, position.y, radius * 0.46, 0, Math.PI * 2);
        context.fillStyle = typeColors.fill;
        context.fill();
      }
    });

    context.font = '600 12px Inter, system-ui, sans-serif';
    context.fillStyle = canvasColors.mutedText;
    context.fillText(`${sets.setCount} disjoint sets`, 18, 28);
    context.fillStyle = canvasColors.highlight;
    context.fillText(`Biggest set: ${sets.largestPeople} people = score`, 18, 46);
  }, [canvasColors, graph, hoveredNode, layout.bounds, positions, selectedEdges, sets, size]);

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
  const hoveredGroup = hovered ? sets.groupOf[hovered.index] : UNUSED_GROUP;

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
          <span>
            {hoveredGroup === UNUSED_GROUP
              ? 'Not chosen by anyone'
              : `Set ${hoveredGroup + 1} · ${sets.peopleByGroup[hoveredGroup]} people`}
          </span>
        </div>
      ) : null}
      <div className="cluster-legend">
        <strong>Disjoint sets (people)</strong>
        {visibleSets.map((set) => (
          <span key={set.group}>
            <i
              style={{
                background: set.group === sets.largestGroup ? canvasColors.highlight : getClusterColor(set.group),
              }}
            />
            Set {set.group + 1}: {set.peopleCount}
            {set.group === sets.largestGroup ? ' = score' : ''}
          </span>
        ))}
        {hiddenSetCount > 0 ? <span className="legend-more">+{hiddenSetCount} more</span> : null}
        {sets.unusedCount > 0 ? <span className="legend-more">{sets.unusedCount} activities unused</span> : null}
      </div>
    </div>
  );
}
