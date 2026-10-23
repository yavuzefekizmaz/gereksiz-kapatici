const os=require('node:os');
class ResourceAdvisor {
  constructor({supported,isGame}){this.supported=supported;this.isGame=isGame;this.previous=new Map();this.lastAt=0;this.ignored=new Set();}
  sample(rows,{protectedApps=[],selected=[],cpuThreshold=15,ramThreshold=10}={},now=Date.now()){
    const elapsed=(now-this.lastAt)/1000,previous=this.previous;this.previous=new Map();this.lastAt=now;
    const exclude=new Set([...protectedApps,...selected].filter(name=>typeof name==='string').map(name=>name.toLowerCase().replace(/\.exe$/,'')+'.exe'));
    const groups=new Map();
    for(const row of rows){
      const key=`${row.pid}:${row.startedAt}`,cpu=Number(row.cpuSeconds);this.previous.set(key,cpu);
      const name=row.name?.toLowerCase();
      if(!name||exclude.has(name)||this.ignored.has(name)||!this.supported(name)||this.isGame(name,row.path)||!row.path||/\\windows\\/i.test(row.path))continue;
      const entry=groups.get(name)||{name,memoryMb:0,cpuPercent:0,paths:new Set()};
      entry.memoryMb+=Number(row.memoryMb)||0;entry.paths.add(row.path);
      if(elapsed>0&&elapsed<120&&previous.has(key)&&Number.isFinite(cpu))entry.cpuPercent+=Math.max(0,cpu-previous.get(key))/elapsed/os.cpus().length*100;
      groups.set(name,entry);
    }
    const totalMb=os.totalmem()/1048576;
    return [...groups.values()].map(item=>({...item,paths:[...item.paths],cpuPercent:Number(item.cpuPercent.toFixed(1)),ramPercent:Number((item.memoryMb/totalMb*100).toFixed(1))}))
      .filter(item=>item.cpuPercent>=cpuThreshold||item.ramPercent>=ramThreshold).sort((a,b)=>b.cpuPercent-a.cpuPercent||b.memoryMb-a.memoryMb).slice(0,5);
  }
  ignore(name){this.ignored.add(name.toLowerCase());}
}
module.exports=ResourceAdvisor;
