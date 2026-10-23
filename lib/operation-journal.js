const fs=require('node:fs'),path=require('node:path');
function sanitize(value,depth=0){
  if(depth>6)return '[ayrıntı sınırı]';
  if(typeof value==='string')return value.replace(/https?:\/\/[^\s"<>]+/gi,url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return '[bağlantı]';}}).slice(0,4000);
  if(Array.isArray(value))return value.slice(0,200).map(item=>sanitize(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,80).map(([key,item])=>[key,/token|password|secret|authorization|cookie/i.test(key)?'[gizlendi]':sanitize(item,depth+1)]));
  return value;
}
class OperationJournal{
  constructor(directory,{maxBytes=4*1024*1024}={}){this.directory=directory;this.file=path.join(directory,'operations.jsonl');this.maxBytes=maxBytes;fs.mkdirSync(directory,{recursive:true});}
  record(event,details={},level='info'){
    try{
      if(fs.existsSync(this.file)&&fs.statSync(this.file).size>this.maxBytes){const previous=this.file+'.previous';fs.rmSync(previous,{force:true});fs.renameSync(this.file,previous);}
      fs.appendFileSync(this.file,JSON.stringify({at:new Date().toISOString(),level,event,details:sanitize(details)})+'\n','utf8');
    }catch{} // Logging must never interrupt a game or an operation.
  }
  text(){
    const lines=[];
    for(const file of [this.file+'.previous',this.file])try{for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean)){try{const row=JSON.parse(line);lines.push(`[${row.at}] ${row.level.toUpperCase()} ${row.event}\n${JSON.stringify(row.details,null,2)}`);}catch{}}}catch{}
    const reports=['last-session.json','last-optimization.json','last-quick-boost.json','last-cleanup.json','update-result.json'];
    for(const directory of ['exit-restore','desktop-recovery'])try{reports.push(...fs.readdirSync(path.join(this.directory,directory)).filter(name=>name.endsWith('.result.json')).slice(-20).map(name=>path.join(directory,name)));}catch{}
    for(const name of reports)try{const file=path.join(this.directory,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>200000)continue;const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));lines.push('KAYIT DOSYASI: '+name+'\n'+JSON.stringify(sanitize(data),null,2));}catch{}
    return 'VOLDENA — AYRINTILI YEREL GÜNLÜK\nSaatler UTC biçimindedir. Uygulama adları ve yerel dosya konumları içerebilir.\n\n'+lines.join('\n\n');
  }
  export(){const file=path.join(this.directory,'logs.txt');fs.writeFileSync(file,this.text(),'utf8');return file;}
}
module.exports={OperationJournal,sanitize};
