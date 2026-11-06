import assert from 'node:assert/strict';
import {mainProcesses,parseProcessList} from './windows-processes.mjs';

// Reproduce the old no-process result, then run the real Windows query with no matches.
assert.throws(()=>JSON.parse(''),/Unexpected end/);
assert.deepEqual(parseProcessList(''),[]);
assert.deepEqual(parseProcessList('\uFEFF []\r\n'),[]);
assert.deepEqual(parseProcessList('null'),[]);
assert.deepEqual(await mainProcesses('Linker-No-Such-Process.exe'),[]);
const singleton={pid:123,path:'C:\\Program Files\\WindowsApps\\OpenAI.Codex_test\\app\\ChatGPT.exe'};
assert.deepEqual(parseProcessList(JSON.stringify(singleton)),[singleton]);
assert.equal(parseProcessList(JSON.stringify([singleton,{...singleton,pid:456}])).length,2);
assert.throws(()=>parseProcessList('{bad json'),SyntaxError);
const current=await mainProcesses();
console.log(JSON.stringify({emptyProcessColdStart:'passed',zeroOneManyParsing:'passed',currentAppProcessCount:current.length}));
