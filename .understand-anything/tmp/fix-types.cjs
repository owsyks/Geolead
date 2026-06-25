const fs=require('fs');
const G='C:/Users/VVV/Desktop/SaaS/.understand-anything/intermediate/assembled-graph.json';
const g=JSON.parse(fs.readFileSync(G,'utf8'));
const remap={doc:'document',stylesheet:'file',markup:'file',variable:'function'};
let fixed=0;
for(const n of g.nodes){ if(remap[n.type]){ console.log(`  ${n.id}: ${n.type} -> ${remap[n.type]}`); n.type=remap[n.type]; fixed++; } }
// also fix id prefixes for the remapped ones if they used the bad type as prefix
for(const n of g.nodes){
  // ensure file-level nodes that became 'file' but have a non-file prefix id get a filePath
  if(n.type==='file' && !n.filePath && n.id.includes(':')) n.filePath=n.id.split(':').slice(1).join(':');
}
fs.writeFileSync(G,JSON.stringify(g,null,2));
console.log('fixed',fixed,'node types; total nodes',g.nodes.length);
