const {test}=require('node:test');
const assert=require('node:assert/strict');
const GameDetector=require('../lib/game-detector');
test('Steam-installed desktop wallpaper utilities are never automatically treated as games',()=>{
  const detector=new GameDetector({});
  const utilities=['wallpaper64.exe','wallpaper32.exe','wallpaper.exe','winrtutil64.exe','winrtutil32.exe','webwallpaper64.exe','webwallpaper32.exe','wallpaperservice64.exe','wallpaperservice32.exe'];
  detector.discoveredGames=[{name:'Wallpaper Engine',path:'D:\\SteamLibrary\\steamapps\\common\\wallpaper_engine',executables:utilities}];
  detector.gameExecutables=new Set(utilities);
  for(const name of utilities)assert.equal(detector.isProcessAGame(name,'D:\\SteamLibrary\\steamapps\\common\\wallpaper_engine\\'+name).isGame,false);
  detector.gameExecutables.add('cs2.exe');
  detector.discoveredGames.push({name:'Counter-Strike 2',exe:'cs2.exe'});
  assert.equal(detector.isProcessAGame('cs2.exe').isGame,true);
});
