"use client";

import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";

type MindMapTree = {
  label: string;
  children?: MindMapTree[];
};

type MindNodeData = {
  label: string;
  childCount: number;
  collapsed: boolean;
};

type MindFlowNode = Node<MindNodeData, "mind">;

function isTree(value: unknown): value is MindMapTree {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { label?: unknown }).label === "string"
  );
}

function childrenOf(node: MindMapTree) {
  return Array.isArray(node.children) ? node.children.filter(isTree) : [];
}

function MindNode({ data }: NodeProps<MindFlowNode>) {
  return (
    <div className="max-w-56 rounded-md border-[1.5px] border-line bg-paper px-3 py-2 text-xs text-ink shadow-card">
      <Handle type="target" position={Position.Left} className="!bg-ink" />
      <p className="font-bold leading-5">{data.label}</p>
      {data.childCount > 0 && (
        <p className="label-caps mt-1 text-muted">
          {data.collapsed ? `+${data.childCount}` : `${data.childCount}`}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-ink" />
    </div>
  );
}

const NODE_TYPES = { mind: MindNode };

function buildFlow(root: MindMapTree, collapsed: Set<string>) {
  const nodes: MindFlowNode[] = [];
  const edges: Edge[] = [];
  let leaf = 0;

  function place(node: MindMapTree, id: string, depth: number): number {
    const children = childrenOf(node);
    const isCollapsed = collapsed.has(id);
    const visibleChildren = isCollapsed ? [] : children;

    let y: number;
    if (visibleChildren.length === 0) {
      y = leaf * 92;
      leaf += 1;
    } else {
      const childYs = visibleChildren.map((child, index) => {
        const childId = `${id}-${index}`;
        edges.push({
          id: `${id}->${childId}`,
          source: id,
          target: childId,
          type: "smoothstep",
          style: { stroke: "var(--theme-line)", strokeWidth: 2 },
        });
        return place(child, childId, depth + 1);
      });
      y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
    }

    nodes.push({
      id,
      type: "mind",
      position: { x: depth * 230, y },
      data: {
        label: node.label,
        childCount: children.length,
        collapsed: isCollapsed,
      },
      draggable: false,
    });
    return y;
  }

  place(root, "root", 0);
  return { nodes, edges };
}

export function MindMapCanvas({ tree }: { tree: unknown }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const root = isTree(tree) ? tree : null;
  const { nodes, edges } = useMemo(() => {
    if (!root) return { nodes: [], edges: [] };
    return buildFlow(root, collapsed);
  }, [root, collapsed]);

  if (!root) {
    return (
      <p className="rounded-lg border-[1.5px] border-line bg-paper p-4 text-sm text-muted shadow-card">
        Mind Map konnte nicht gelesen werden.
      </p>
    );
  }

  return (
    <div className="h-96 overflow-hidden rounded-lg border-[1.5px] border-line bg-paper shadow-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_event, node) => {
          if (!node.data.childCount) return;
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            return next;
          });
        }}
      >
        <Background color="var(--theme-line)" gap={20} lineWidth={0.4} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
