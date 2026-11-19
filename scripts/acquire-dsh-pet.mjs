/** Reproducible, fixed-commit asset acquisition only. Never executes upstream code. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ts from 'typescript';
import sharp from 'sharp';
const commit='572cf0ff68e7ffbe76afe4ba5fd8ae99ec7e0733';
const root=resolve('public/vendor/dsh-pet');
const source=`https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/${commit}/`;
const run=promisify(execFile);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
await mkdir(join(root,'webm'),{recursive:true});
async function downloadUrl(uri,target){
 await run('pwsh',['-NoProfile','-Command',`$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri ${quote(uri)} -OutFile ${quote(target)} -TimeoutSec 45`]);
 return readFile(target);
}
async function download(path,target){return downloadUrl(source+path.split('/').map(encodeURIComponent).join('/'),target);}
const entries=JSON.parse(await readFile(new URL('./dsh-pet-files.json',import.meta.url),'utf8'));
if(entries.length<100)throw Error('Unexpected incomplete animation directory');
const configBytes=await download('dsh-pet/assets/config.jsonc',join(root,'upstream-config.jsonc'));
const config=ts.parseConfigFileTextToJson('config.jsonc',configBytes.toString('utf8'));
if(config.error||!config.config?.animations)throw Error('Invalid upstream animation config');
const categories=new Map();
function classify(value,path=[]){
 if(typeof value==='string'){const current=categories.get(value)??new Set();current.add(path.join('.'));categories.set(value,current);return;}
 if(Array.isArray(value)){for(const row of value)classify(row,row?.id?[...path,row.id]:path);return;}
 if(value&&typeof value==='object')for(const [key,row] of Object.entries(value))if(key!=='id'&&key!=='weight')classify(row,[...path,key]);
}
classify(config.config.animations);
const hashes=[];let cursor=0;
function record(target,path,content){
 const entry={path:target,sourcePath:path,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')};
 if(target.endsWith('.webm'))entry.categories=[...(categories.get(target.slice(5,-5))??[])];
 hashes.push(entry);
}
async function acquire(path,target){
 let content;
 try{content=await readFile(join(root,target));}catch{content=await download(path,join(root,target));}
 const expected=entries.find(row=>row.path===path);if(expected&&content.length!==expected.size)throw Error(`Incomplete asset: ${path}`);
 record(target,path,content);
}
await Promise.all(Array.from({length:4},async()=>{while(cursor<entries.length){const entry=entries[cursor++];await acquire(entry.path,'webm/'+entry.name);}}));
await acquire('dsh-pet/assets/main-character.png','main-character.png');
await acquire('dsh-pet/LICENSE','LICENSE-MIT.txt');
const ccPath='LICENSE-CC-BY-NC-SA-4.0.txt',ccUrl='https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.txt';
let ccBytes;try{ccBytes=await readFile(join(root,ccPath));}catch{ccBytes=await downloadUrl(ccUrl,join(root,ccPath));}
record(ccPath,ccUrl,ccBytes);
// Mechanical front-view crop and edge-connected white removal, not a redrawn character.
const poster=await sharp(join(root,'main-character.png')).extract({left:60,top:90,width:650,height:890}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const pixels=poster.data,{width,height}=poster.info,queue=[],seen=new Uint8Array(width*height);
const push=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return;const index=y*width+x;if(seen[index])return;seen[index]=1;const p=index*4;if(Math.min(pixels[p],pixels[p+1],pixels[p+2])>=240&&Math.max(pixels[p],pixels[p+1],pixels[p+2])-Math.min(pixels[p],pixels[p+1],pixels[p+2])<=15)queue.push(index);};
for(let x=0;x<width;x++){push(x,0);push(x,height-1);}for(let y=0;y<height;y++){push(0,y);push(width-1,y);}
for(let i=0;i<queue.length;i++){const index=queue[i],x=index%width,y=Math.floor(index/width);pixels[index*4+3]=0;push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);}
await sharp(pixels,{raw:{width,height,channels:4}}).trim().png().toFile(join(root,'poster.png'));
const posterBytes=await readFile(join(root,'poster.png'));record('poster.png','dsh-pet/assets/main-character.png (front view crop; edge-connected white made transparent)',posterBytes);
await writeFile(join(root,'upstream-config.jsonc'),configBytes);
await writeFile(join(root,'animations.json'),JSON.stringify({animations:config.config.animations,weights:config.config.animationWeights},null,2)+'\n');
record('upstream-config.jsonc','dsh-pet/assets/config.jsonc',configBytes);
record('animations.json','dsh-pet/assets/config.jsonc (animation data extracted)',await readFile(join(root,'animations.json')));
record('ATTRIBUTION.txt','CareerPilot attribution and adaptation notice',await readFile(join(root,'ATTRIBUTION.txt')));
hashes.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(join(root,'manifest.json'),JSON.stringify({repository:'https://github.com/PC2005-cloud/dsh-pet',commit,codeLicense:'MIT',assetLicense:'CC-BY-NC-SA-4.0',animationCount:entries.length,files:hashes},null,2)+'\n');
console.log(JSON.stringify({commit,animations:entries.length,bytes:hashes.reduce((n,row)=>n+row.bytes,0),manifest:join(root,'manifest.json')}));
