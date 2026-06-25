const fs=require('fs');
const G='C:/Users/VVV/Desktop/SaaS/.understand-anything/intermediate/assembled-graph.json';
const g=JSON.parse(fs.readFileSync(G,'utf8'));
const idMap={
  'file:symbol:Design Front End UI_UX/src/app/routes.tsx:router':'function:Design Front End UI_UX/src/app/routes.tsx:router',
  'file:doc:Design Front End UI_UX/ATTRIBUTIONS.md':'document:Design Front End UI_UX/ATTRIBUTIONS.md',
  'file:doc:Design Front End UI_UX/README.md':'document:Design Front End UI_UX/README.md',
};
for(const n of g.nodes){
  if(idMap[n.id]){ n.id=idMap[n.id]; if(n.type==='document'){ n.filePath=n.id.split(':').slice(1).join(':'); } }
}
let rewired=0;
for(const e of g.edges){
  if(idMap[e.source]){ e.source=idMap[e.source]; rewired++; }
  if(idMap[e.target]){ e.target=idMap[e.target]; rewired++; }
}
// dedup nodes by id (keep first), drop self/dangling edges
const seen=new Map(); const nodes=[];
for(const n of g.nodes){ if(!seen.has(n.id)){ seen.set(n.id,1); nodes.push(n);} }
const ids=new Set(nodes.map(n=>n.id));
const edges=g.edges.filter(e=>e.source&&e.target&&e.source!==e.target&&ids.has(e.source)&&ids.has(e.target));
g.nodes=nodes; g.edges=edges;
fs.writeFileSync(G,JSON.stringify(g,null,2));
console.log('rewired edge endpoints:',rewired,' final nodes:',nodes.length,' final edges:',edges.length);
