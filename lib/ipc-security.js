function assertTrustedSender(event,window){
  const frame=window?.webContents?.mainFrame;
  if(!window||window.isDestroyed()||event?.sender!==window.webContents||!frame||event.senderFrame?.routingId!==frame.routingId||event.senderFrame?.processId!==frame.processId)throw Error('Bu işlem yalnızca Voldena ana penceresinden yapılabilir.');
}
module.exports={assertTrustedSender};
