const {test}=require('node:test'),assert=require('node:assert/strict');const {assertTrustedSender}=require('../lib/ipc-security');
test('only the current main window and its main frame can use native operations',()=>{
  const contents={mainFrame:{routingId:1,processId:2}},window={webContents:contents,isDestroyed:()=>false};
  assert.doesNotThrow(()=>assertTrustedSender({sender:contents,senderFrame:{routingId:1,processId:2}},window));
  for(const event of [{sender:{},senderFrame:contents.mainFrame},{sender:contents,senderFrame:{routingId:9,processId:2}},{sender:contents}])assert.throws(()=>assertTrustedSender(event,window));
});
