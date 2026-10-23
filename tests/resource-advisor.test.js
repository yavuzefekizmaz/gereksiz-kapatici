const {test}=require('node:test'),assert=require('node:assert/strict'),os=require('node:os');const Advisor=require('../lib/resource-advisor');
test('resource suggestions exclude selected, protected, games and Windows and require measured CPU deltas',()=>{
  const advisor=new Advisor({supported:()=>true,isGame:name=>name==='game.exe'});
  const names=['chrome.exe','protected.exe','game.exe','windows.exe','selected.exe'];
  const rows=names.map((name,index)=>({name,pid:index+10,startedAt:'one',path:name==='windows.exe'?'C:\\Windows\\windows.exe':'C:\\Apps\\'+name,cpuSeconds:1,memoryMb:0}));
  const options={protectedApps:['protected.exe'],selected:['selected.exe'],cpuThreshold:10,ramThreshold:100};
  assert.equal(advisor.sample(rows,options,1000).length,0);
  for(const row of rows)row.cpuSeconds+=os.cpus().length*2;
  const result=advisor.sample(rows,options,11000);assert.equal(result.length,1);assert.equal(result[0].name,'chrome.exe');assert.equal(result[0].cpuPercent,20);
  advisor.ignore('chrome.exe');assert.equal(advisor.sample(rows,options,21000).length,0);
});
