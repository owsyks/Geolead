const fs=require('fs');
const G='C:/Users/VVV/Desktop/SaaS/.understand-anything/intermediate/assembled-graph.json';
const g=JSON.parse(fs.readFileSync(G,'utf8'));
const fileLevel=new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const fileNodes=g.nodes.filter(n=>fileLevel.has(n.type)).map(n=>({id:n.id,type:n.type,name:n.name,filePath:n.filePath,summary:n.summary,tags:n.tags}));
const importEdges=g.edges.filter(e=>e.type==='imports').map(e=>({source:e.source,target:e.target,type:e.type}));
const allEdges=g.edges.map(e=>({source:e.source,target:e.target,type:e.type}));
// Architecture input
fs.writeFileSync('C:/Users/VVV/Desktop/SaaS/.understand-anything/tmp/arch-input.json',JSON.stringify({fileNodes,importEdges,allEdges},null,0));
// Tour input: file-level nodes (lighter) + all edges
const tourNodes=fileNodes.map(n=>({id:n.id,name:n.name,filePath:n.filePath,summary:n.summary,type:n.type}));
fs.writeFileSync('C:/Users/VVV/Desktop/SaaS/.understand-anything/tmp/tour-input.json',JSON.stringify({nodes:tourNodes,allEdges},null,0));
console.log('fileLevel nodes:',fileNodes.length);
console.log('import edges:',importEdges.length,' all edges:',allEdges.length);
console.log('node type counts:',JSON.stringify(g.nodes.reduce((a,n)=>{a[n.type]=(a[n.type]||0)+1;return a;},{})));
console.log('edge type counts:',JSON.stringify(g.edges.reduce((a,e)=>{a[e.type]=(a[e.type]||0)+1;return a;},{})));
