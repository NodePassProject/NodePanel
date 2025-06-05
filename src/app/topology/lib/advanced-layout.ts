
import ELK, { type ElkNode, type ElkExtendedEdge, type LayoutOptions as ElkLayoutOptions } from 'elkjs/lib/elk.bundled.js';
import type { Node as ReactFlowNodeReactFlow, Edge as ReactFlowEdge } from 'reactflow'; 
import type { NodePassFlowNodeType, TopologyNodeData } from './topology-types';
import { NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT, TIER_Y_SPACING, NODE_X_SPACING, CONTROLLER_NODE_DEFAULT_WIDTH, CONTROLLER_NODE_DEFAULT_HEIGHT } from './topology-types';

const elk = new ELK();

const defaultElkOptions: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN', // Reverted from RIGHT for simpler flat layout
  'elk.layered.spacing.nodeNodeBetweenLayers': String(TIER_Y_SPACING * 0.9), 
  'elk.spacing.nodeNode': String(NODE_X_SPACING * 0.7), 
  'elk.layered.spacing.edgeNodeBetweenLayers': String(TIER_Y_SPACING * 0.5),
  'elk.layered.spacing.edgeEdgeBetweenLayers': String(TIER_Y_SPACING * 0.5),
  'elk.edgeRouting': 'POLYLINE', 
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
  'elk.separateConnectedComponents': 'true',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.mergeEdges': 'true',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.padding.node': '[top=10,left=10,bottom=10,right=10]', // Generic padding
};

export async function calculateElkLayout(
  reactFlowNodes: NodePassFlowNodeType[],
  reactFlowEdges: ReactFlowEdge[],
  setNodesRf: (nodes: NodePassFlowNodeType[] | ((nodes: NodePassFlowNodeType[]) => NodePassFlowNodeType[])) => void,
  setEdgesRf: (edges: ReactFlowEdge[] | ((edges: ReactFlowEdge[]) => ReactFlowEdge[])) => void
): Promise<{ nodes: NodePassFlowNodeType[], edges: ReactFlowEdge[] }> {
  if (reactFlowNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const elkNodes: ElkNode[] = reactFlowNodes.map(flowNode => {
    let width, height;
    if (flowNode.data?.type === 'controller') {
      width = flowNode.width || CONTROLLER_NODE_DEFAULT_WIDTH;
      height = flowNode.height || CONTROLLER_NODE_DEFAULT_HEIGHT;
    } else {
      width = flowNode.width || NODE_DEFAULT_WIDTH;
      height = flowNode.height || NODE_DEFAULT_HEIGHT;
    }
    return {
      id: flowNode.id,
      width: width,
      height: height,
      labels: [{ text: flowNode.data?.label || flowNode.id }],
    };
  });

  const elkEdges: ElkExtendedEdge[] = reactFlowEdges.map(flowEdge => ({
    id: flowEdge.id,
    sources: [flowEdge.source],
    targets: [flowEdge.target],
  }));

  const graphToLayout: ElkNode = {
    id: 'root',
    layoutOptions: defaultElkOptions,
    children: elkNodes, // Flat list of nodes, no explicit hierarchy for ELK here
    edges: elkEdges,
  };

  try {
    const layoutedGraph = await elk.layout(graphToLayout);

    const newNodes = reactFlowNodes.map(flowNode => {
      const elkNode = layoutedGraph.children?.find(n => n.id === flowNode.id);
      if (elkNode) {
        const newPosition = {
          x: isNaN(Number(elkNode.x)) ? flowNode.position.x : Number(elkNode.x),
          y: isNaN(Number(elkNode.y)) ? flowNode.position.y : Number(elkNode.y),
        };
        if (isNaN(Number(elkNode.x)) || isNaN(Number(elkNode.y))) {
            console.warn(`ELK returned NaN position for node ${flowNode.id}. Keeping original position.`);
        }
        // Use original node dimensions or default, ELK won't resize simple nodes
        const width = flowNode.width || (flowNode.data?.type === 'controller' ? CONTROLLER_NODE_DEFAULT_WIDTH : NODE_DEFAULT_WIDTH);
        const height = flowNode.height || (flowNode.data?.type === 'controller' ? CONTROLLER_NODE_DEFAULT_HEIGHT : NODE_DEFAULT_HEIGHT);

        return {
          ...flowNode,
          position: newPosition,
          width: width,
          height: height,
          style: { ...flowNode.style, opacity: 1 } // Ensure opacity is reset if it was changed
        };
      }
      return flowNode;
    });
    
    // For now, return original edges. Custom edge components would process elkEdge.sections / bendPoints.
    const newEdges = reactFlowEdges.map(flowEdge => {
        const elkEdge = layoutedGraph.edges?.find(e => e.id === flowEdge.id);
        if (elkEdge) {
            // return { ...flowEdge, data: { ...flowEdge.data, elkSections: elkEdge.sections } };
        }
        return flowEdge; 
    });

    setNodesRf(newNodes);
    setEdgesRf(newEdges);

    return { nodes: newNodes, edges: newEdges };
  } catch (e) {
    console.error('ELK layout error:', e);
    // Fallback to original nodes/edges if ELK fails catastrophically
    setNodesRf(reactFlowNodes);
    setEdgesRf(reactFlowEdges);
    throw e; 
  }
}

// Tiered layout remains as a fallback or alternative
export function calculateTieredLayout(
  nodes: NodePassFlowNodeType[],
  options?: { tierSpacing?: number; nodeSpacing?: number; }
): NodePassFlowNodeType[] {
  if (nodes.length === 0) {
    return [];
  }

  const tierYSpacing = options?.tierSpacing || TIER_Y_SPACING;
  const nodeXSpacing = options?.nodeSpacing || NODE_X_SPACING;

  const tierOrder: TopologyNodeData['type'][] = ['controller', 'user', 'client', 'server', 'landing'];
  const nodesByTier: Record<string, NodePassFlowNodeType[]> = { controller: [], user: [], client: [], server: [], landing: [] };

  nodes.forEach(node => {
    const nodeType = node.data?.type;
    if (nodeType && nodesByTier[nodeType]) {
      nodesByTier[nodeType].push(node);
    } else if (nodeType) {
      if (!nodesByTier['unknown']) nodesByTier['unknown'] = [];
      nodesByTier['unknown'].push(node);
    }
  });
  if (nodesByTier['unknown']) tierOrder.push('unknown');


  const newNodesLayout: NodePassFlowNodeType[] = [];
  let currentY = 50;

  tierOrder.forEach(tierType => {
    const tierNodes = nodesByTier[tierType];
    if (!tierNodes || tierNodes.length === 0) return;

    const tierWidth = (tierNodes.length - 1) * nodeXSpacing;
    let currentX = -tierWidth / 2; 

    tierNodes.forEach(node => {
      newNodesLayout.push({
        ...node,
        position: { x: currentX, y: currentY },
      });
      currentX += nodeXSpacing;
    });
    currentY += tierYSpacing;
  });

  return newNodesLayout;
}

