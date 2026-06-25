const fs=require('fs');
const G='C:/Users/VVV/Desktop/SaaS/.understand-anything/intermediate/assembled-graph.json';
const g=JSON.parse(fs.readFileSync(G,'utf8'));
const valid=['file','function','class','module','concept','config','document','service','table','endpoint','pipeline','schema','resource'];
const validPrefix=new RegExp('^('+valid.join('|')+'):');
const bad=g.nodes.filter(n=>!validPrefix.test(n.id) || /^(file|function|document|config):(symbol|doc|file|markup|stylesheet|variable):/.test(n.id));
console.log('nodes with malformed/double-prefixed ids:',bad.length);
bad.slice(0,20).forEach(n=>console.log('  ',n.type,'|',n.id));
