import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let windowOptions;
let openHandler;
const externalUrls=[];
const fakeWindow={
  loadFile:()=>{},
  webContents:{setWindowOpenHandler:handler=>{openHandler=handler;}},
};
function BrowserWindow(options){windowOptions=options;return fakeWindow;}
BrowserWindow.getAllWindows=()=>[fakeWindow];
const electron={
  app:{whenReady:()=>({then:handler=>handler()}),on:()=>{},quit:()=>{}},
  BrowserWindow,
  Menu:{setApplicationMenu:()=>{}},
  shell:{openExternal:url=>externalUrls.push(url)},
};
const sandbox={
  require:id=>{
    if(id==='electron')return electron;
    if(id==='node:path')return {join:(...parts)=>parts.join('/')};
    throw new Error(`unexpected require: ${id}`);
  },
  __dirname:'electron',
  process:{platform:'linux'},
  console,
};
vm.runInNewContext(fs.readFileSync('electron/main.cjs','utf8'),sandbox,{filename:'electron/main.cjs'});

assert.ok(windowOptions,'desktop startup should create a browser window');
assert.equal(windowOptions.webPreferences.contextIsolation,true,'context isolation must remain enabled');
assert.equal(windowOptions.webPreferences.nodeIntegration,false,'renderer Node integration must remain disabled');
assert.equal(windowOptions.webPreferences.sandbox,true,'renderer sandbox must remain enabled');
assert.equal(typeof openHandler,'function','new-window requests must be intercepted');

const httpsResult=openHandler({url:'https://example.com/channel'});
assert.equal(httpsResult.action,'deny','external HTTP(S) windows must not open inside the privileged shell');
assert.deepEqual(externalUrls,['https://example.com/channel'],'allowed web links should be handed to the operating system browser');

const unsafeResult=openHandler({url:'file:///tmp/untrusted.html'});
assert.equal(unsafeResult.action,'deny','non-web popup schemes must be denied');
assert.equal(externalUrls.length,1,'non-web schemes must not be passed to the operating system');

console.log('Electron security invariants validated.');
