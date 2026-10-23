const {test}=require('node:test'),assert=require('node:assert/strict');const Cache=require('../src/disk-scan-cache');
test('tab reentry and drive/filter revisits keep results until explicit rescan; overlapping calls share a request',async()=>{
  const cache=new Cache();let scans=0;const scan=async()=>{scans++;return [{path:'old.file'}];};
  assert.equal(cache.has('C:100'),false);
  await Promise.all([cache.get('C:100',false,scan),cache.get('C:100',false,scan)]);assert.equal(scans,1);
  await cache.get('C:100',false,scan);assert.equal(scans,1);
  await cache.get('C:100',true,scan);assert.equal(scans,2);
  cache.remove('old.file');assert.deepEqual(await cache.get('C:100',false,scan),[]);
});
test('failed scans are not treated as successful empty scans',async()=>{
  const cache=new Cache();await assert.rejects(cache.get('D:50',true,async()=>{throw Error('Denied');}),/Denied/);assert.equal(cache.has('D:50'),false);
});
