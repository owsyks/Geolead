const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/VVV/Desktop/SaaS/.understand-anything';
const INTER = path.join(ROOT, 'intermediate');

const FILE_LEVEL_TYPES = new Set([
  'file', 'config', 'document', 'service', 'pipeline',
  'table', 'schema', 'resource', 'endpoint'
]);

function kebab(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---- Load inputs ----
const graph = JSON.parse(fs.readFileSync(path.join(INTER, 'assembled-graph.json'), 'utf8'));
const layersRaw = JSON.parse(fs.readFileSync(path.join(INTER, 'layers.json'), 'utf8'));
const tourRaw = JSON.parse(fs.readFileSync(path.join(INTER, 'tour.json'), 'utf8'));

const nodes = graph.nodes;
const edges = graph.edges;
const nodeIdSet = new Set(nodes.map(n => n.id));

// ---- Normalize layers ----
const assignedNodeIds = new Set(); // enforce one-layer-per-node (first wins)
const layers = layersRaw.map(layer => {
  const id = layer.id || `layer:${kebab(layer.name)}`;
  const nodeIds = [];
  for (const nid of (layer.nodeIds || [])) {
    if (!nodeIdSet.has(nid)) continue;       // drop nodeId not in node set
    if (assignedNodeIds.has(nid)) continue;  // already in another layer (first wins)
    assignedNodeIds.add(nid);
    nodeIds.push(nid);
  }
  return { id, name: layer.name, description: layer.description, nodeIds };
});

// ---- Normalize tour ----
const tour = (tourRaw.steps || [])
  .slice()
  .sort((a, b) => a.order - b.order)
  .map(step => ({
    order: step.order,
    title: step.title,
    description: step.description,
    nodeIds: (step.nodeIds || []).filter(nid => nodeIdSet.has(nid))
  }));

// ---- Assemble final graph ----
const finalGraph = {
  version: '1.0.0',
  project: {
    name: 'geolead-ai',
    languages: ['typescript', 'javascript', 'css', 'html', 'sql', 'prisma', 'yaml', 'json', 'markdown', 'dockerfile', 'toml'],
    frameworks: ['Express', 'Prisma', 'BullMQ', 'Redis', 'Next.js', 'React', 'Vite', 'Tailwind CSS', 'Docker', 'Docker Compose', 'GitHub Actions'],
    description: 'AI-powered outbound email automation platform for geo-domain sellers: lead discovery + crawling, contact extraction/verification, AI lead scoring & enrichment, and AI-personalized outbound email campaigns with a unified inbox. Express/Prisma/PostgreSQL + Redis/BullMQ backend, Next.js/React frontend, plus a Vite/React design-mockup app.',
    analyzedAt: new Date().toISOString(),
    gitCommitHash: '850e52b696199d562b535051604475610e43a256'
  },
  nodes,
  edges,
  layers,
  tour
};

// ---- Validator ----
function validate(g) {
  const issues = [];
  const warnings = [];
  const ids = new Set(g.nodes.map(n => n.id));

  // edges
  for (const e of g.edges) {
    if (!ids.has(e.source)) issues.push({ kind: 'dangling-edge-source', source: e.source, target: e.target, type: e.type });
    if (!ids.has(e.target)) issues.push({ kind: 'dangling-edge-target', source: e.source, target: e.target, type: e.type });
  }

  // layer nodeIds
  for (const l of g.layers) {
    for (const nid of l.nodeIds) {
      if (!ids.has(nid)) issues.push({ kind: 'dangling-layer-nodeId', layer: l.id, nodeId: nid });
    }
  }

  // tour nodeIds
  for (const s of g.tour) {
    for (const nid of s.nodeIds) {
      if (!ids.has(nid)) issues.push({ kind: 'dangling-tour-nodeId', step: s.order, nodeId: nid });
    }
  }

  // every file-level node assigned to exactly one layer
  const layerCount = new Map();
  for (const l of g.layers) {
    for (const nid of l.nodeIds) {
      layerCount.set(nid, (layerCount.get(nid) || 0) + 1);
    }
  }
  for (const n of g.nodes) {
    if (!FILE_LEVEL_TYPES.has(n.type)) continue;
    const c = layerCount.get(n.id) || 0;
    if (c === 0) issues.push({ kind: 'file-node-unassigned', nodeId: n.id, nodeType: n.type });
    else if (c > 1) issues.push({ kind: 'file-node-multi-layer', nodeId: n.id, count: c });
  }

  // stats
  const nodeTypes = {};
  for (const n of g.nodes) nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  const edgeTypes = {};
  for (const e of g.edges) edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;

  const stats = {
    nodes: g.nodes.length,
    edges: g.edges.length,
    layers: g.layers.length,
    tourSteps: g.tour.length,
    nodeTypes,
    edgeTypes,
    fileLevelNodes: g.nodes.filter(n => FILE_LEVEL_TYPES.has(n.type)).length,
    nodesInLayers: assignedNodeIdsCount(g)
  };

  return { issues, warnings, stats };
}

function assignedNodeIdsCount(g) {
  const s = new Set();
  for (const l of g.layers) for (const nid of l.nodeIds) s.add(nid);
  return s.size;
}

// ---- Automated fixes ----
function applyFixes(g) {
  const ids = new Set(g.nodes.map(n => n.id));
  g.edges = g.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  for (const l of g.layers) l.nodeIds = l.nodeIds.filter(nid => ids.has(nid));
  for (const s of g.tour) s.nodeIds = s.nodeIds.filter(nid => ids.has(nid));
  return g;
}

// ---- Write graph (both locations) ----
function writeGraph(g) {
  fs.writeFileSync(path.join(INTER, 'assembled-graph.json'), JSON.stringify(g, null, 2));
  fs.writeFileSync(path.join(ROOT, 'knowledge-graph.json'), JSON.stringify(g, null, 2));
}

writeGraph(finalGraph);

// ---- STEP 2: validate ----
let result = validate(finalGraph);

// ---- STEP 3: fix + revalidate once if needed ----
let passedFirst = result.issues.length === 0;
let fixed = false;
if (result.issues.length > 0) {
  applyFixes(finalGraph);
  writeGraph(finalGraph);
  result = validate(finalGraph);
  fixed = true;
}

// Note: file-node-unassigned / multi-layer issues are NOT auto-fixable by dropping;
// they are reported as-is.

fs.writeFileSync(path.join(INTER, 'review.json'), JSON.stringify(result, null, 2));

const passed = result.issues.length === 0;

console.log('=== FINAL COUNTS ===');
console.log('nodes:', finalGraph.nodes.length);
console.log('edges:', finalGraph.edges.length);
console.log('layers:', finalGraph.layers.length);
console.log('tourSteps:', finalGraph.tour.length);
console.log('=== STATS ===');
console.log('nodeTypes:', JSON.stringify(result.stats.nodeTypes));
console.log('edgeTypes:', JSON.stringify(result.stats.edgeTypes));
console.log('fileLevelNodes:', result.stats.fileLevelNodes);
console.log('nodesInLayers:', result.stats.nodesInLayers);
console.log('=== VALIDATION ===');
console.log('issues:', result.issues.length, 'warnings:', result.warnings.length);
console.log('passedFirstPass:', passedFirst, 'appliedFixes:', fixed, 'passedFinal:', passed);
if (result.issues.length > 0) {
  console.log('--- up to 10 issues ---');
  for (const iss of result.issues.slice(0, 10)) console.log(JSON.stringify(iss));
}
console.log('knowledge-graph.json written:', fs.existsSync(path.join(ROOT, 'knowledge-graph.json')));
